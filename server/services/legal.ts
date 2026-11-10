import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  ai,
  hasApiKey,
  withRotation,
  getLastSuccessModel,
  DEFAULT_EMBEDDING_MODEL,
} from './geminiClient.ts';
import { Type } from '@google/genai';

export { getLastSuccessModel };

export interface LegalSection {
  id: string;
  act: string;
  section: string;
  title: string;
  snippet: string;
  category?: string;
  sourceUrl: string;
  isPlaceholder: boolean;
  jurisdiction?: string;
  lastVerified?: string;
  verifiedBy?: string;
  score?: number;
}

export interface CitedLegalCard {
  act: string;
  section: string;
  title: string;
  snippet: string;
  plainExplanation: string;
  sourceUrl: string;
  isPlaceholder: boolean;
  relevanceReason: string;
  chunkId?: string;
  jurisdiction?: string;
  lastVerified?: string;
  verifiedBy?: string;
}

export interface LegalChunk {
  id: string;
  act: string;
  year: number | string;
  jurisdiction: string;
  type: string;
  sourceUrl: string;
  lastVerified: string;
  verifiedBy: string;
  section: string;
  title: string;
  tags: string[];
  text: string;
  isPlaceholder: boolean;
  vector?: number[];
}

export interface BM25Index {
  docCount: number;
  avgDocLength: number;
  docLengths: Record<string, number>;
  termFrequencies: Record<string, Record<string, number>>;
  docFrequencies: Record<string, number>;
  idf: Record<string, number>;
}

export interface LegalIndexData {
  version: string;
  embeddingModel: string;
  indexedAt: string;
  chunks: LegalChunk[];
  bm25: BM25Index;
}

// Configurable threshold (default 0.015 for reciprocal rank fusion)
export const RETRIEVAL_THRESHOLD = parseFloat(
  process.env.LEGAL_RETRIEVAL_THRESHOLD || '0.012'
);

const DATA_DIR = path.resolve(process.cwd(), 'server/data');
const LEGAL_DIR = path.resolve(DATA_DIR, 'legal');
const INDEX_FILE = path.resolve(DATA_DIR, 'legalIndex.json');
const DEMO_CASES_CACHE_FILE = path.resolve(DATA_DIR, 'demoCasesCache.json');

let inMemoryIndex: LegalIndexData | null = null;

function withTimeout<T>(
  promise: Promise<T>,
  ms = 12000,
  msg = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

// ==========================================
// 1. Text Tokenizer & BM25 Keyword Search
// ==========================================

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/[\s,.;:/?!()[\]{}'"]+/)
    .filter((w) => w.length > 2);
}

export class BM25Engine {
  index: BM25Index;

  constructor(index?: BM25Index) {
    this.index = index || {
      docCount: 0,
      avgDocLength: 0,
      docLengths: {},
      termFrequencies: {},
      docFrequencies: {},
      idf: {},
    };
  }

  build(chunks: LegalChunk[]): BM25Index {
    const docLengths: Record<string, number> = {};
    const termFrequencies: Record<string, Record<string, number>> = {};
    const docFrequencies: Record<string, number> = {};
    let totalLength = 0;

    for (const chunk of chunks) {
      const fullText = `${chunk.act} ${chunk.section} ${chunk.title} ${chunk.tags.join(' ')} ${chunk.text}`;
      const tokens = tokenize(fullText);
      const docLen = tokens.length;
      docLengths[chunk.id] = docLen;
      totalLength += docLen;

      const tf: Record<string, number> = {};
      const seenTerms = new Set<string>();

      for (const t of tokens) {
        tf[t] = (tf[t] || 0) + 1;
        seenTerms.add(t);
      }
      termFrequencies[chunk.id] = tf;

      for (const t of seenTerms) {
        docFrequencies[t] = (docFrequencies[t] || 0) + 1;
      }
    }

    const docCount = chunks.length;
    const avgDocLength = docCount > 0 ? totalLength / docCount : 0;
    const idf: Record<string, number> = {};

    for (const [term, df] of Object.entries(docFrequencies)) {
      // Standard Okapi BM25 IDF with smoothing
      idf[term] = Math.log((docCount - df + 0.5) / (df + 0.5) + 1);
    }

    this.index = {
      docCount,
      avgDocLength,
      docLengths,
      termFrequencies,
      docFrequencies,
      idf,
    };

    return this.index;
  }

  score(chunkId: string, queryTokens: string[]): number {
    const { avgDocLength, docLengths, termFrequencies, idf } = this.index;
    const docLen = docLengths[chunkId] || 0;
    const tfMap = termFrequencies[chunkId] || {};
    if (docLen === 0) return 0;

    const k1 = 1.2;
    const b = 0.75;
    let score = 0;

    for (const token of queryTokens) {
      const termIdf = idf[token];
      if (!termIdf) continue;
      const tf = tfMap[token] || 0;
      if (tf === 0) continue;

      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / (avgDocLength || 1)));
      score += termIdf * (numerator / denominator);
    }

    return score;
  }
}

// ==========================================
// 2. Cosine Similarity for Vectors
// ==========================================

export function cosineSimilarity(a?: number[], b?: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);

  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

// ==========================================
// 3. Markdown Corpus Parser & Validator
// ==========================================

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parseCorpusFiles(dirPath: string): {
  chunks: LegalChunk[];
  errors: string[];
} {
  const errors: string[] = [];
  const chunks: LegalChunk[] = [];
  const seenIds = new Map<string, string>(); // chunkId -> filename

  if (!fs.existsSync(dirPath)) {
    return {
      chunks: [],
      errors: [`Directory not found: ${dirPath}`],
    };
  }

  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    return {
      chunks: [],
      errors: [`No .md files found in ${dirPath}`],
    };
  }

  for (const filename of files) {
    const filePath = path.join(dirPath, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse Front Matter
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fmMatch) {
      errors.push(`[${filename}] Missing or malformed YAML front matter (must start and end with ---)`);
      continue;
    }

    const fmRaw = fmMatch[1];
    const body = fmMatch[2];

    const meta: Record<string, string> = {};
    for (const line of fmRaw.split(/\r?\n/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        meta[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    // Validate required front matter fields
    if (!meta.act) errors.push(`[${filename}] Missing required front matter: 'act'`);
    if (!meta.year) errors.push(`[${filename}] Missing required front matter: 'year'`);
    if (!meta.jurisdiction) {
      errors.push(`[${filename}] Missing required front matter: 'jurisdiction' (federal or province name)`);
    }
    if (!meta.type) errors.push(`[${filename}] Missing required front matter: 'type' (law or process)`);
    if (!meta.sourceUrl || !/^https?:\/\//i.test(meta.sourceUrl)) {
      errors.push(`[${filename}] Missing or invalid required front matter: 'sourceUrl'`);
    }
    if (!meta.lastVerified) {
      errors.push(`[${filename}] Missing required front matter: 'lastVerified'`);
    }
    if (meta.verifiedBy === undefined) {
      errors.push(`[${filename}] Missing required front matter field: 'verifiedBy'`);
    }

    const actName = meta.act || filename.replace('.md', '');
    const actSlug = slugify(actName);
    const year = meta.year || '2024';
    const jurisdiction = (meta.jurisdiction || 'federal').toLowerCase();
    const type = (meta.type || 'law').toLowerCase();
    const sourceUrl = meta.sourceUrl || '';
    const lastVerified = meta.lastVerified || '';
    const verifiedBy = meta.verifiedBy || '';
    const isPlaceholder = content.toLowerCase().includes('placeholder');

    // Parse Sections: Blocks starting with "## Section "
    const sectionBlocks = body.split(/\r?\n(?=## Section\s+)/i).filter((b) => b.trim().length > 0);

    if (sectionBlocks.length === 0) {
      errors.push(`[${filename}] No section blocks found starting with '## Section <number>'`);
      continue;
    }

    for (const block of sectionBlocks) {
      const lines = block.trim().split(/\r?\n/);
      const headingLine = lines[0] || '';
      const sectionMatch = headingLine.match(/^##\s*Section\s+([A-Za-z0-9\-]+)/i);

      if (!sectionMatch) {
        errors.push(`[${filename}] Invalid section heading format: '${headingLine}'. Expected '## Section <number>'`);
        continue;
      }

      const rawSectionNum = sectionMatch[1].trim();
      const sectionSlug = slugify(rawSectionNum);

      let title = '';
      const tags: string[] = [];
      let textLines: string[] = [];
      let inText = false;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!inText) {
          if (/^title:\s*/i.test(line)) {
            title = line.replace(/^title:\s*/i, '').trim();
          } else if (/^tags:\s*/i.test(line)) {
            const rawTags = line.replace(/^tags:\s*/i, '').trim();
            tags.push(
              ...rawTags
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean)
            );
          } else if (/^text:\s*$/i.test(line.trim())) {
            inText = true;
          }
        } else {
          textLines.push(line);
        }
      }

      const text = textLines.join('\n').trim();

      if (!text || text.length === 0) {
        errors.push(`[${filename}] Empty text for Section ${rawSectionNum}`);
        continue;
      }

      const chunkId = `${actSlug}-${year}-${sectionSlug}`;

      // Long text sub-section splitting (> 1200 chars or containing explicit (1), (2) sub-clauses)
      const subSectionRegex = /(?:\r?\n|^)\(([0-9]+|[a-z])\)\s+/g;
      const hasSubSections = text.length > 1200 && subSectionRegex.test(text);

      if (hasSubSections) {
        const subParts = text.split(/(?=(?:\r?\n|^)\([0-9a-z]\)\s+)/i).filter((p) => p.trim().length > 0);
        subParts.forEach((part, subIdx) => {
          const subId = `${chunkId}-sub-${subIdx + 1}`;
          if (seenIds.has(subId)) {
            errors.push(`Duplicate chunk ID '${subId}' found in ${filename} (already defined in ${seenIds.get(subId)})`);
          } else {
            seenIds.set(subId, filename);
            chunks.push({
              id: subId,
              act: actName,
              year,
              jurisdiction,
              type,
              sourceUrl,
              lastVerified,
              verifiedBy,
              section: `Section ${rawSectionNum} (${subIdx + 1})`,
              title: title || `Section ${rawSectionNum}`,
              tags,
              text: part.trim(),
              isPlaceholder,
            });
          }
        });
      } else {
        if (seenIds.has(chunkId)) {
          errors.push(`Duplicate chunk ID '${chunkId}' found in ${filename} (already defined in ${seenIds.get(chunkId)})`);
        } else {
          seenIds.set(chunkId, filename);
          chunks.push({
            id: chunkId,
            act: actName,
            year,
            jurisdiction,
            type,
            sourceUrl,
            lastVerified,
            verifiedBy,
            section: `Section ${rawSectionNum}`,
            title: title || `Section ${rawSectionNum}`,
            tags,
            text,
            isPlaceholder,
          });
        }
      }
    }
  }

  return { chunks, errors };
}

// ==========================================
// 4. Index Loading and Embedding
// ==========================================

export async function findEmbeddingModel(): Promise<string> {
  if (!hasApiKey) return DEFAULT_EMBEDDING_MODEL;
  try {
    const list = await ai.models.list();
    const candidateModels: string[] = [];

    for await (const m of list) {
      const isEmbed =
        m.name &&
        (m.name.includes('embed') ||
          (m.supportedActions && m.supportedActions.includes('embedContent')));
      if (isEmbed && m.name) {
        candidateModels.push(m.name);
      }
    }

    const preferred = candidateModels.find(
      (m) =>
        m.includes('embedding') ||
        m.includes('text-embedding')
    );

    return preferred || candidateModels[0] || DEFAULT_EMBEDDING_MODEL;
  } catch (err) {
    console.warn('[LEGAL RAG] Failed to dynamically query embedding models, using default:', err);
    return DEFAULT_EMBEDDING_MODEL;
  }
}

export async function embedText(text: string, modelName: string): Promise<number[]> {
  if (!hasApiKey || !text || text.trim().length === 0) {
    return [];
  }
  try {
    const res = await ai.models.embedContent({
      model: modelName.replace(/^models\//, ''),
      contents: text,
    });
    return res.embeddings?.[0]?.values || [];
  } catch (err) {
    console.warn(`[LEGAL RAG] Embedding call failed for model ${modelName}:`, err);
    return [];
  }
}

export async function loadOrBuildIndex(forceRebuild = false): Promise<LegalIndexData> {
  if (inMemoryIndex && !forceRebuild) {
    return inMemoryIndex;
  }

  // 1. Try reading local index file if exists and not forced
  if (!forceRebuild && fs.existsSync(INDEX_FILE)) {
    try {
      const raw = fs.readFileSync(INDEX_FILE, 'utf-8');
      inMemoryIndex = JSON.parse(raw);
      if (inMemoryIndex && Array.isArray(inMemoryIndex.chunks) && inMemoryIndex.chunks.length > 0) {
        return inMemoryIndex;
      }
    } catch (err) {
      console.warn('[LEGAL RAG] Could not parse legalIndex.json, building in-memory:', err);
    }
  }

  // 2. Parse corpus files
  const { chunks, errors } = parseCorpusFiles(LEGAL_DIR);
  if (errors.length > 0) {
    console.error('[LEGAL RAG] Corpus validation errors:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    if (chunks.length === 0) {
      throw new Error(`Corpus validation failed with ${errors.length} error(s). Run 'npm run ingest' to inspect.`);
    }
  }

  // 3. Build BM25 index
  const bm25Engine = new BM25Engine();
  const bm25 = bm25Engine.build(chunks);

  // 4. Discover embedding model and embed chunks if API key is present
  const embeddingModel = await findEmbeddingModel();

  if (hasApiKey) {
    for (const chunk of chunks) {
      if (!chunk.vector || chunk.vector.length === 0) {
        const textToEmbed = `${chunk.act} ${chunk.section} ${chunk.title}: ${chunk.text}`;
        chunk.vector = await embedText(textToEmbed, embeddingModel);
      }
    }
  }

  inMemoryIndex = {
    version: '2.0.0',
    embeddingModel,
    indexedAt: new Date().toISOString(),
    chunks,
    bm25,
  };

  return inMemoryIndex;
}

// ==========================================
// 5. Gemini Key/Model Rotation Layer
// ==========================================
// Rotation logic and model selection are centralized in server/services/geminiClient.ts

// ==========================================
// 6. Query Writer
// ==========================================

/**
 * Best-effort fallback when the LLM query-writer is unavailable (quota / timeout).
 * Passes keyFacts as the primary query so BM25 can tokenize natural-language text
 * and the vector model can embed it semantically — including Urdu descriptions.
 * Labels are used first when supplied (real-app path with case classification).
 */
function fallbackQueries(labels: string[], keyFacts: string): string[] {
  // If classification labels are present (real-app path), use them directly.
  const fromLabels = labels.map((l) => l.replace(/[/_-]/g, ' ')).filter(Boolean);
  if (fromLabels.length >= 2) return fromLabels.slice(0, 3);

  // No labels — use the raw keyFacts text as the primary query.
  // Both BM25 (tokenises English words) and the vector model (handles Urdu
  // semantics) work correctly with full natural-language descriptions.
  const primary = keyFacts.trim().slice(0, 512);
  if (!primary) return ['harassment blackmail intimidation', 'cyber stalking unauthorized'];
  return [primary];
}

// True when ANY key source is configured (single key OR multi-key rotation).
export const hasAnyKey =
  hasApiKey ||
  Boolean(process.env.GEMINI_API_KEYS && process.env.GEMINI_API_KEYS.trim().length > 0) ||
  Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) ||
  Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim().length > 0);

export async function writeSearchQueries(params: {
  labels: string[];
  keyFacts: string;
}): Promise<string[]> {
  const { labels, keyFacts } = params;

  if (!hasAnyKey || (!labels.length && !keyFacts)) {
    return fallbackQueries(labels, keyFacts);
  }

  try {
    const prompt = `You are a legal search query generator for a statutory retrieval engine.
From the provided redacted classification labels and key case facts, produce exactly 2 to 3 short English search queries (each 3 to 6 words).
Queries should describe the specific offenses, legal misconduct categories, or procedural actions needed.
Do NOT invent section numbers or law titles.
Input is already redacted. Keep output generic and strictly focused on legal concepts.

Classification Labels: ${labels.join(', ')}
Key Facts: ${keyFacts}

Respond with a JSON array containing 2 to 3 strings only.`;

    const response = await withRotation('queries', (pair, pairAi) =>
      pairAi.models.generateContent({
        model: pair.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '[]') as string[];
    const validQueries = parsed
      .map((q) => q.trim())
      .filter((q) => q.length > 2)
      .slice(0, 3);

    if (validQueries.length >= 2) {
      return validQueries;
    }
  } catch (err) {
    console.warn('[QUERY WRITER] LLM query writer fallback:', err);
  }

  // LLM failed — derive queries from the keyFacts text itself
  return fallbackQueries(labels, keyFacts);
}

// ==========================================
// 6. Hybrid Retrieval (Vector + BM25 + RRF)
// ==========================================

/**
 * Interface method required: retrieveSections(queries: string[], province?: string)
 * Merges Vector Search + BM25 with Reciprocal Rank Fusion (RRF), returns top 6.
 * Enforces Province Filter and retrieval score threshold.
 */
export async function retrieveSections(
  queries: string[],
  province?: string
): Promise<LegalSection[]> {
  const indexData = await loadOrBuildIndex();
  const allChunks = indexData.chunks;

  if (!queries || queries.length === 0) {
    queries = ['blackmail extortion intimidation', 'cyber-stalking surveillance'];
  }

  const selectedProvince = (province || '').trim().toLowerCase();

  // Province filter: provincial chunks only eligible if matches; federal chunks always eligible
  const eligibleChunks = allChunks.filter((chunk) => {
    const chunkJurisdiction = (chunk.jurisdiction || 'federal').toLowerCase();
    if (chunkJurisdiction === 'federal') return true;
    if (!selectedProvince || selectedProvince === 'all' || selectedProvince === 'federal') {
      return false; // Only federal is eligible when no province or federal-only is selected
    }
    return chunkJurisdiction === selectedProvince;
  });

  if (eligibleChunks.length === 0) {
    return [];
  }

  const bm25Engine = new BM25Engine(indexData.bm25);
  const rrfScores = new Map<string, number>();
  const k = 60; // Standard RRF constant

  for (const query of queries) {
    const queryTokens = tokenize(query);

    // 1. BM25 Ranking for this query
    const bm25Ranked = eligibleChunks
      .map((c) => ({ chunk: c, score: bm25Engine.score(c.id, queryTokens) }))
      .sort((a, b) => b.score - a.score);

    // 2. Vector Ranking for this query (if vectors exist)
    let vectorRanked: Array<{ chunk: LegalChunk; score: number }> = [];
    if (hasApiKey) {
      const queryVec = await embedText(query, indexData.embeddingModel);
      if (queryVec.length > 0) {
        vectorRanked = eligibleChunks
          .map((c) => ({ chunk: c, score: cosineSimilarity(queryVec, c.vector) }))
          .sort((a, b) => b.score - a.score);
      }
    }

    // 3. Accumulate Reciprocal Rank Fusion
    bm25Ranked.forEach((item, rankIdx) => {
      // Only reward documents with a positive keyword match
      if (item.score > 0) {
        const rrf = 1 / (k + (rankIdx + 1));
        rrfScores.set(item.chunk.id, (rrfScores.get(item.chunk.id) || 0) + rrf);
      }
    });

    if (vectorRanked.length > 0) {
      vectorRanked.forEach((item, rankIdx) => {
        // High semantic relevance threshold for 3072-dim embeddings (noise floor is ~0.50)
        if (item.score >= 0.58) {
          const rrf = 1 / (k + (rankIdx + 1));
          rrfScores.set(item.chunk.id, (rrfScores.get(item.chunk.id) || 0) + rrf);
        }
      });
    }
  }

  // Sort eligible chunks by total RRF score
  const scoredChunks = eligibleChunks
    .map((c) => ({
      chunk: c,
      score: rrfScores.get(c.id) || 0,
    }))
    .filter((sc) => sc.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredChunks.length === 0) {
    return [];
  }

  // Check top score against configurable threshold
  const topScore = scoredChunks[0].score;
  if (topScore < RETRIEVAL_THRESHOLD) {
    return [];
  }

  // Top 6 with scores
  const top6 = scoredChunks.slice(0, 6);

  return top6.map(({ chunk, score }) => ({
    id: chunk.id,
    act: chunk.act,
    section: chunk.section,
    title: chunk.title,
    snippet: chunk.text, // Verbatim snippet from chunk
    category: chunk.tags[0] || 'general',
    sourceUrl: chunk.sourceUrl,
    jurisdiction: chunk.jurisdiction,
    lastVerified: chunk.lastVerified,
    verifiedBy: chunk.verifiedBy || 'Not yet verified',
    isPlaceholder: chunk.isPlaceholder,
    score: Number(score.toFixed(4)),
  }));
}

// ==========================================
// 7. Grounded Explanation & Citation Verifier
// ==========================================

export function verifyCitations(
  rawCards: Array<{
    chunkId: string;
    whyItMayApply?: string;
    plainExplanation?: string;
    relevanceReason?: string;
  }>,
  retrievedSections: LegalSection[]
): CitedLegalCard[] {
  const sectionMap = new Map<string, LegalSection>(
    retrievedSections.map((s) => [s.id, s])
  );
  const verified: CitedLegalCard[] = [];

  for (const raw of rawCards) {
    // 5. Citation verifier: drop any card whose chunkId is not in the retrieved set
    const sec = sectionMap.get(raw.chunkId);
    if (!sec) {
      console.warn(`[CITATION VERIFIER] Dropped ungrounded chunkId: '${raw.chunkId}' (not in retrieved set)`);
      continue;
    }

    const verifiedBy =
      sec.verifiedBy && sec.verifiedBy.trim().length > 0
        ? sec.verifiedBy
        : 'Not yet verified';

    verified.push({
      chunkId: sec.id,
      act: sec.act,
      section: sec.section,
      title: sec.title,
      // Always show original verbatim snippet from chunk (never model-rewritten quote)
      snippet: sec.snippet,
      plainExplanation:
        raw.plainExplanation ||
        `Educational summary: Pertains to statutory regulations governing ${sec.title}. Consult legal counsel for formal advice.`,
      relevanceReason:
        raw.whyItMayApply ||
        raw.relevanceReason ||
        `Identified based on recorded incident tags matching ${sec.category || sec.title}.`,
      sourceUrl: sec.sourceUrl,
      jurisdiction: sec.jurisdiction,
      lastVerified: sec.lastVerified,
      verifiedBy,
      isPlaceholder: sec.isPlaceholder,
    });
  }

  return verified;
}

/**
 * Interface method required: explainSections(caseFacts, sections, language) -> cited cards
 * Model sees ONLY retrieved chunks and returns JSON cards.
 * Citation verifier drops any unretrieved chunk citations.
 */
export async function explainSections(
  caseFacts: string,
  sections: LegalSection[],
  language: 'en' | 'ur' = 'en'
): Promise<CitedLegalCard[]> {
  if (!sections || sections.length === 0) {
    return [];
  }

  const isUrdu = language === 'ur';

  if (!hasAnyKey || !caseFacts || caseFacts.trim().length < 5) {
    // Fallback: build strictly grounded cards from retrieved sections
    return sections.map((sec) => ({
      chunkId: sec.id,
      act: sec.act,
      section: sec.section,
      title: sec.title,
      snippet: sec.snippet,
      plainExplanation: isUrdu
        ? `یہ دفعہ ${sec.title} سے متعلق معاملات کا احاطہ کرتی ہے۔ قانونی رہنمائی کے لیے مستند وکیل سے رجوع کریں۔`
        : `[PLACEHOLDER EXPLANATION] This provision pertains to incidents concerning ${sec.title}. Consult a qualified advocate for actual legal guidance.`,
      relevanceReason: isUrdu
        ? `مقدمے کے شواہد اور اندراجات سے مطابقت رکھتی ہے۔`
        : `Matches evidence indicators related to ${sec.category || 'recorded misconduct'}.`,
      sourceUrl: sec.sourceUrl,
      jurisdiction: sec.jurisdiction,
      lastVerified: sec.lastVerified,
      verifiedBy: sec.verifiedBy && sec.verifiedBy.trim() ? sec.verifiedBy : 'Not yet verified',
      isPlaceholder: sec.isPlaceholder,
    }));
  }

  try {
    const prompt = `You are generating educational, preliminary legal explanations for an evidence vault.
CRITICAL MANDATORY INSTRUCTIONS:
1. You are provided with a list of retrieved legal chunks. You must ONLY reference sections from this exact list.
2. Under NO circumstances should you invent, cite, recall, or mention any law, act, or section number not in the list below.
3. For each provided chunk, explain why it may apply to the case facts and provide a 1-2 sentence plain-language explanation for a layperson.
4. Output language: ${isUrdu ? 'Urdu' : 'English'}.
5. Return JSON adhering to the schema.

Case Facts:
${caseFacts}

Available Retrieved Chunks (ONLY these chunks may be used):
${JSON.stringify(
  sections.map((s) => ({
    id: s.id,
    act: s.act,
    section: s.section,
    title: s.title,
    snippet: s.snippet,
  })),
  null,
  2
)}`;

    const response = await withRotation('explain', (pair, pairAi) =>
      pairAi.models.generateContent({
        model: pair.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                chunkId: { type: Type.STRING },
                whyItMayApply: { type: Type.STRING },
                plainExplanation: { type: Type.STRING },
              },
              required: ['chunkId', 'whyItMayApply', 'plainExplanation'],
            },
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '[]') as Array<{
      chunkId: string;
      whyItMayApply: string;
      plainExplanation: string;
    }>;

    // Run Citation Verifier
    const verifiedCards = verifyCitations(parsed, sections);

    // If some retrieved sections weren't in parsed model output, add them grounded
    const verifiedIds = new Set(verifiedCards.map((c) => c.chunkId));
    for (const sec of sections) {
      if (!verifiedIds.has(sec.id)) {
        verifiedCards.push({
          chunkId: sec.id,
          act: sec.act,
          section: sec.section,
          title: sec.title,
          snippet: sec.snippet,
          plainExplanation: isUrdu
            ? `یہ دفعہ ${sec.title} سے متعلق ہے اور متعلقہ شواہد کے جائزے میں معاون ہو سکتی ہے۔`
            : `Educational notice: Provision relates to ${sec.title}. Consult a legal aid clinic.`,
          relevanceReason: isUrdu
            ? `شواہد کے مطابق متعلقہ زمرے میں شامل ہے۔`
            : `Corresponds to identified incident tags in category ${sec.category || 'general'}.`,
          sourceUrl: sec.sourceUrl,
          jurisdiction: sec.jurisdiction,
          lastVerified: sec.lastVerified,
          verifiedBy: sec.verifiedBy && sec.verifiedBy.trim() ? sec.verifiedBy : 'Not yet verified',
          isPlaceholder: sec.isPlaceholder,
        });
      }
    }

    return verifiedCards;
  } catch (err) {
    console.warn('[EXPLAIN SECTIONS] LLM call failed, returning verified template cards:', err);
    return sections.map((sec) => ({
      chunkId: sec.id,
      act: sec.act,
      section: sec.section,
      title: sec.title,
      snippet: sec.snippet,
      plainExplanation: isUrdu
        ? `یہ دفعہ ${sec.title} کے لیے لاگو ہو سکتی ہے۔ براہ کرم وکیل سے رجوع کریں۔`
        : `[PLACEHOLDER EXPLANATION] Applicable to allegations regarding ${sec.title}.`,
      relevanceReason: `Corresponds to identified incident tags.`,
      sourceUrl: sec.sourceUrl,
      jurisdiction: sec.jurisdiction,
      lastVerified: sec.lastVerified,
      verifiedBy: sec.verifiedBy && sec.verifiedBy.trim() ? sec.verifiedBy : 'Not yet verified',
      isPlaceholder: sec.isPlaceholder,
    }));
  }
}

// ==========================================
// 8. Free-Form Legal Question Answering
// ==========================================

export async function askLegalQuestion(params: {
  question: string;
  province?: string;
  language?: 'en' | 'ur';
}): Promise<{
  answer: string;
  citedCards: CitedLegalCard[];
  disclaimer: string;
}> {
  const { question, province, language = 'en' } = params;
  const isUrdu = language === 'ur';
  const disclaimer = 'Information and draft only, not legal advice.';

  if (!question || question.trim().length < 3) {
    return {
      answer: isUrdu
        ? 'براہ کرم اپنا سوال واضح طور پر تحریر کریں۔'
        : 'Please enter a valid legal question.',
      citedCards: [],
      disclaimer,
    };
  }

  // 1. Retrieve sections using hybrid retrieval
  const retrievedSections = await retrieveSections([question], province);

  // 6. No-answer rule: if nothing passes the threshold show "No matching section found. Please consult a lawyer."
  if (retrievedSections.length === 0) {
    return {
      answer: isUrdu
        ? 'کوئی متعلقہ دفعہ نہیں ملی۔ براہ کرم کسی وکیل سے قانونی مشورہ لیں۔'
        : 'No matching section found. Please consult a lawyer.',
      citedCards: [],
      disclaimer,
    };
  }

  if (!hasApiKey) {
    return {
      answer: isUrdu
        ? `آپ کے سوال کے حوالے سے دستیاب قوانین سے درج ذیل دفعات حاصل ہوئی ہیں:`
        : `Based on your question, the following statutory provisions were retrieved from the available legal corpus:`,
      citedCards: retrievedSections.map((s) => ({
        chunkId: s.id,
        act: s.act,
        section: s.section,
        title: s.title,
        snippet: s.snippet,
        plainExplanation: s.snippet,
        relevanceReason: `Matched search query: "${question}"`,
        sourceUrl: s.sourceUrl,
        jurisdiction: s.jurisdiction,
        lastVerified: s.lastVerified,
        verifiedBy: s.verifiedBy && s.verifiedBy.trim() ? s.verifiedBy : 'Not yet verified',
        isPlaceholder: s.isPlaceholder,
      })),
      disclaimer,
    };
  }

  try {
    const prompt = `You are an educational legal information assistant answering a user's question.
CRITICAL MANDATORY INSTRUCTIONS:
1. Answer the question using ONLY the retrieved legal chunks provided below.
2. Under NO circumstances should you invent, mention, or cite any section number, statute, or act that is NOT in the retrieved chunks.
3. If the retrieved chunks do not contain relevant information to answer the question, state: "No matching section found. Please consult a lawyer."
4. Language: ${isUrdu ? 'Urdu' : 'English'}.
5. Return JSON:
   {
     "answer": "string (the plain language answer)",
     "citedChunkIds": ["chunkId1", "chunkId2"]
   }`;

    const response = await withRotation('grounding-answer', (pair, pairAi) =>
      pairAi.models.generateContent({
        model: pair.model,
        contents: `${prompt}

User Question:
${question}

Retrieved Legal Chunks:
${JSON.stringify(
  retrievedSections.map((s) => ({
    id: s.id,
    act: s.act,
    section: s.section,
    title: s.title,
    snippet: s.snippet,
  }))
)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              citedChunkIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['answer', 'citedChunkIds'],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || '{}') as {
      answer: string;
      citedChunkIds: string[];
    };

    // Filter cited chunk IDs strictly to retrieved sections
    const rawCards = (parsed.citedChunkIds || []).map((id) => ({
      chunkId: id,
      whyItMayApply: `Referenced in response to: "${question}"`,
      plainExplanation: parsed.answer,
    }));

    const verifiedCards = verifyCitations(rawCards, retrievedSections);

    return {
      answer:
        parsed.answer ||
        (isUrdu
          ? 'کوئی متعلقہ دفعہ نہیں ملی۔ براہ کرم کسی وکیل سے قانونی مشورہ لیں۔'
          : 'No matching section found. Please consult a lawyer.'),
      citedCards: verifiedCards.length > 0 ? verifiedCards : verifyCitations(
        retrievedSections.slice(0, 2).map((s) => ({ chunkId: s.id })),
        retrievedSections
      ),
      disclaimer,
    };
  } catch (err) {
    console.warn('[ASK LEGAL] Error answering legal question, falling back to retrieved cards:', err);
    return {
      answer: isUrdu
        ? 'حاصل شدہ قانونی دفعات درج ذیل ہیں:'
        : 'The following provisions were retrieved based on your inquiry:',
      citedCards: retrievedSections.map((s) => ({
        chunkId: s.id,
        act: s.act,
        section: s.section,
        title: s.title,
        snippet: s.snippet,
        plainExplanation: s.snippet,
        relevanceReason: `Retrieved for inquiry: "${question}"`,
        sourceUrl: s.sourceUrl,
        jurisdiction: s.jurisdiction,
        lastVerified: s.lastVerified,
        verifiedBy: s.verifiedBy && s.verifiedBy.trim() ? s.verifiedBy : 'Not yet verified',
        isPlaceholder: s.isPlaceholder,
      })),
      disclaimer,
    };
  }
}

// ==========================================
// 9. Demo Cases Cache (server/data/demoCasesCache.json)
// ==========================================

export interface CachedDemoCase {
  caseId: string;
  description: string;
  language: string;
  province: string | null;
  model: string;
  cachedAt: string;
  disclaimer: string;
  isPlaceholder: boolean;
  citedCards: CitedLegalCard[];
}

export interface DemoCasesCacheFile {
  version: string;
  generatedAt: string;
  cases: Record<string, CachedDemoCase>;
}

export function getDemoCasesCache(): DemoCasesCacheFile | null {
  try {
    if (fs.existsSync(DEMO_CASES_CACHE_FILE)) {
      const raw = fs.readFileSync(DEMO_CASES_CACHE_FILE, 'utf-8');
      return JSON.parse(raw) as DemoCasesCacheFile;
    }
  } catch (err) {
    console.warn('[DEMO CACHE] Error loading demo cases cache file:', err);
  }
  return null;
}
