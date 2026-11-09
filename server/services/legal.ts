import fs from 'fs';
import path from 'path';
import { ai, hasApiKey } from './geminiClient.ts';
import { Type } from '@google/genai';

export interface LegalSection {
  id: string;
  act: string;
  section: string;
  title: string;
  snippet: string;
  category?: string;
  sourceUrl: string;
  isPlaceholder: boolean;
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
}

// TODO: Replace placeholder corpus with production Vector Search / RAG pipeline (Milvus/pgvector or Vertex Search)
// TODO: Connect with Circle module for anonymized cross-incident pattern matching
let cachedCorpus: LegalSection[] | null = null;

function loadCorpus(): LegalSection[] {
  if (cachedCorpus) return cachedCorpus;
  try {
    const corpusPath = path.resolve(process.cwd(), 'server/data/legalCorpus.placeholder.json');
    const raw = fs.readFileSync(corpusPath, 'utf-8');
    cachedCorpus = JSON.parse(raw);
    return cachedCorpus || [];
  } catch (err) {
    console.error('Failed to load legal corpus placeholder file:', err);
    return [];
  }
}

/**
 * Interface method required: retrieveSections(queries: string[])
 * Returns matched sections from the placeholder corpus.
 * Note: Backed strictly by placeholder corpus. Does NOT invent fake sections.
 */
export async function retrieveSections(queries: string[]): Promise<LegalSection[]> {
  const corpus = loadCorpus();
  if (!queries || queries.length === 0) {
    return corpus.slice(0, 3);
  }

  const queryTokens = queries
    .join(' ')
    .toLowerCase()
    .split(/[\s,.;/]+/)
    .filter((w) => w.length > 2);

  const matched = corpus.filter((item) => {
    const textToMatch = `${item.title} ${item.snippet} ${item.category || ''}`.toLowerCase();
    return queryTokens.some((token) => textToMatch.includes(token));
  });

  return matched.length > 0 ? matched : corpus.slice(0, 2);
}

/**
 * Interface method required: explainSections(caseFacts, sections) -> cited cards
 * Explains how each placeholder section conceptually relates to the case facts,
 * with prominent non-legal-advice disclaimers.
 */
export async function explainSections(
  caseFacts: string,
  sections: LegalSection[]
): Promise<CitedLegalCard[]> {
  if (!sections || sections.length === 0) {
    return [];
  }

  if (!hasApiKey || !caseFacts || caseFacts.trim().length < 5) {
    return sections.map((sec) => ({
      act: sec.act,
      section: sec.section,
      title: sec.title,
      snippet: sec.snippet,
      plainExplanation: `[PLACEHOLDER EXPLANATION] This provision pertains to incidents involving ${sec.category || 'digital intimidation'}. Consult a qualified advocate for actual legal guidance.`,
      sourceUrl: sec.sourceUrl,
      isPlaceholder: true,
      relevanceReason: `Matches case flags related to ${sec.category || 'harassment'}.`,
    }));
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are generating educational, preliminary legal explanations for an evidence vault prototype.
CRITICAL CONSTRAINT: Do NOT invent new laws or cite unverified section numbers. Only reference the provided placeholder sections.
For each provided section, write a 1-2 sentence plain-language explanation of why this category of provision might apply to the given case facts.
Always emphasize that this is draft educational information only, not legal counsel.

Case Facts:
${caseFacts}

Available Placeholder Sections:
${JSON.stringify(sections, null, 2)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sectionId: { type: Type.STRING },
              plainExplanation: { type: Type.STRING },
              relevanceReason: { type: Type.STRING },
            },
            required: ['sectionId', 'plainExplanation', 'relevanceReason'],
          },
        },
      },
    });

    const parsed = JSON.parse(response.text || '[]') as Array<{
      sectionId: string;
      plainExplanation: string;
      relevanceReason: string;
    }>;

    return sections.map((sec) => {
      const match = parsed.find((p) => p.sectionId === sec.id);
      return {
        act: sec.act,
        section: sec.section,
        title: sec.title,
        snippet: sec.snippet,
        plainExplanation:
          match?.plainExplanation ||
          `[PLACEHOLDER EXPLANATION] This section addresses issues concerning ${sec.category || 'digital communications'}.`,
        sourceUrl: sec.sourceUrl,
        isPlaceholder: true,
        relevanceReason:
          match?.relevanceReason || `Aligned with recorded evidence in ${sec.category || 'harassment'} category.`,
      };
    });
  } catch (err) {
    console.warn('explainSections error, returning template cards:', err);
    return sections.map((sec) => ({
      act: sec.act,
      section: sec.section,
      title: sec.title,
      snippet: sec.snippet,
      plainExplanation: `[PLACEHOLDER EXPLANATION] Applicable to allegations regarding ${sec.category || 'coercion'}.`,
      sourceUrl: sec.sourceUrl,
      isPlaceholder: true,
      relevanceReason: `Corresponds to identified incident tags.`,
    }));
  }
}
