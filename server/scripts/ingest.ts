/**
 * Legal Corpus Ingestion CLI (npm run ingest)
 * Parses /server/data/legal/*.md files, validates required fields,
 * dynamically queries Gemini for available embedding models,
 * generates vector embeddings + BM25 index, and saves to server/data/legalIndex.json.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import {
  parseCorpusFiles,
  BM25Engine,
  findEmbeddingModel,
  embedText,
  LegalIndexData,
} from '../services/legal.ts';
import { ai, hasApiKey, DEFAULT_EMBEDDING_MODEL } from '../services/geminiClient.ts';

const LEGAL_DIR = path.resolve(process.cwd(), 'server/data/legal');
const INDEX_FILE = path.resolve(process.cwd(), 'server/data/legalIndex.json');

async function main() {
  console.log('====================================================');
  console.log('   Sakhi Vault: Legal Corpus Ingestion Pipeline     ');
  console.log('====================================================\n');

  console.log(`[1/4] Scanning legal markdown files in: ${LEGAL_DIR}`);
  const { chunks, errors } = parseCorpusFiles(LEGAL_DIR);

  if (errors.length > 0) {
    console.error('\n❌ INGESTION FAILED: Corpus validation found the following problems:\n');
    errors.forEach((err, idx) => {
      console.error(`  ${idx + 1}. ${err}`);
    });
    console.error('\nPlease fix the issues above in /server/data/legal/*.md and re-run ingestion.\n');
    process.exit(1);
  }

  console.log(`✓ Parsed and validated ${chunks.length} legal chunk(s) across all acts.`);
  chunks.forEach((c) => {
    console.log(`  - [${c.jurisdiction.toUpperCase()}] ${c.id}: ${c.title}`);
  });

  // 2. Discover available Gemini embedding models
  console.log('\n[2/4] Querying available Gemini embedding models...');
  let embeddingModel = DEFAULT_EMBEDDING_MODEL;

  if (!hasApiKey) {
    console.warn('⚠️ No GEMINI_API_KEY detected. Ingesting with BM25 keyword index only.');
  } else {
    try {
      const modelList = await ai.models.list();
      const availableEmbeddingModels: string[] = [];
      for await (const m of modelList) {
        if (
          m.name &&
          (m.name.includes('embed') ||
            (m.supportedActions && m.supportedActions.includes('embedContent')))
        ) {
          availableEmbeddingModels.push(m.name);
        }
      }

      console.log(`✓ Found ${availableEmbeddingModels.length} available embedding model(s):`);
      availableEmbeddingModels.forEach((m) => console.log(`    • ${m}`));

      embeddingModel = await findEmbeddingModel();
      console.log(`✓ Selected embedding model: ${embeddingModel}`);
    } catch (err: any) {
      console.warn(`⚠️ Could not list models from Gemini API (${err.message}), falling back to default embedding model.`);
    }
  }

  // 3. Compute Embeddings
  console.log('\n[3/4] Generating vector embeddings for chunks...');
  let embeddedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const textToEmbed = `${chunk.act} ${chunk.section} ${chunk.title}: ${chunk.text}`;

    if (hasApiKey) {
      process.stdout.write(`  [${i + 1}/${chunks.length}] Embedding ${chunk.id}... `);
      const vec = await embedText(textToEmbed, embeddingModel);
      if (vec && vec.length > 0) {
        chunk.vector = vec;
        embeddedCount++;
        process.stdout.write(`done (${vec.length}-dim)\n`);
      } else {
        process.stdout.write(`warning (empty vector)\n`);
      }
    } else {
      chunk.vector = [];
    }
  }

  console.log(`✓ Embedded ${embeddedCount}/${chunks.length} chunks.`);

  // 4. Build BM25 Index
  console.log('\n[4/4] Building Okapi BM25 keyword index...');
  const bm25Engine = new BM25Engine();
  const bm25 = bm25Engine.build(chunks);
  console.log(`✓ BM25 index built. Average document length: ${bm25.avgDocLength.toFixed(1)} tokens; Vocabulary terms: ${Object.keys(bm25.idf).length}.`);

  const indexData: LegalIndexData = {
    version: '2.0.0',
    embeddingModel,
    indexedAt: new Date().toISOString(),
    chunks,
    bm25,
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf-8');
  console.log(`\n====================================================`);
  console.log(`✓ Ingestion successful!`);
  console.log(`  Index written to: ${INDEX_FILE}`);
  console.log(`  Total chunks indexed: ${chunks.length}`);
  console.log(`  Vectors generated: ${embeddedCount}`);
  console.log(`====================================================\n`);
}

main().catch((err) => {
  console.error('\nFatal ingestion error:', err);
  process.exit(1);
});
