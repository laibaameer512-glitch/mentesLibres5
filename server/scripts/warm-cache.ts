/**
 * warm-cache.ts  (npm run warm-cache)
 *
 * Runs the real pipeline (writeSearchQueries → retrieveSections → explainSections)
 * for 6 demo cases and writes verified results to server/data/demoCasesCache.json.
 *
 * A result is saved ONLY when:
 *   1. The query-writer used the LLM (not template fallback).
 *   2. explainSections used the LLM (not template fallback).
 *   3. Every citation in the response resolves to a retrieved chunk (verifier passes).
 *
 * Cases that fail any condition are marked SKIPPED.
 * A 6-second pause is inserted between cases to stay within rate limits.
 *
 * Output file schema (demoCasesCache.json):
 * {
 *   version: "1.0",
 *   generatedAt: "<ISO8601>",
 *   cases: {
 *     "<caseId>": {
 *       caseId, description, language, province,
 *       model,         // model name that produced the LLM output
 *       cachedAt,      // ISO8601
 *       disclaimer,
 *       isPlaceholder, // always false (only real LLM outputs are saved)
 *       citedCards     // CitedLegalCard[]
 *     },
 *     ...
 *   }
 * }
 *
 * Do NOT change any other code, tags or thresholds.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import {
  writeSearchQueries,
  retrieveSections,
  explainSections,
  CitedLegalCard,
  LegalSection,
  getLastSuccessModel,
} from '../services/legal.ts';
import { hasApiKey } from '../services/geminiClient.ts';

// Provide a mock document if running in Node environment so canvas call in demoData does not throw
if (typeof globalThis.document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => null,
      toDataURL: () => '',
    }),
  };
}

import { createDemoCase } from '../../src/lib/demoData.ts';

// Extract the exact caseFacts that LegalAdvicePanel sends for createDemoCase()
const builtinCase = createDemoCase();
const builtinCaseFacts =
  builtinCase.extractedReview?.summary5Lines?.join(' ') ||
  builtinCase.evidenceItems.map((e) => e.notes).join(' ') ||
  'Harassment and blackmail incident';
const builtinCategories =
  builtinCase.extractedReview?.classificationLabels?.map((c) => c.category) || [
    'blackmail/extortion',
    'cyber-stalking',
  ];

// ── Cache file location ───────────────────────────────────────────────────────
const CACHE_FILE = path.resolve(process.cwd(), 'server/data/demoCasesCache.json');
const DISCLAIMER = 'Information and draft only, not legal advice.';

// ── Demo case definitions ─────────────────────────────────────────────────────
interface DemoCase {
  caseId: string;
  description: string;
  labels: string[];
  language: 'en' | 'ur';
  province?: string;
}

const DEMO_CASES: DemoCase[] = [
  // ── Blackmail ──────────────────────────────────────────────────────────────
  {
    caseId: 'demo-blackmail-en',
    description:
      'My ex-partner is threatening to share private photos with my family and colleagues unless I pay them money. The threats are coming through WhatsApp and Instagram.',
    labels: ['blackmail', 'cyber-crime', 'extortion'],
    language: 'en',
    province: undefined,
  },
  {
    caseId: 'demo-blackmail-ur',
    description:
      'میرے سابق ساتھی نے مجھے دھمکی دی ہے کہ اگر میں نے پیسے نہ دیے تو وہ میری نجی تصاویر میرے گھر والوں اور دفتر میں بھیج دے گا۔ یہ دھمکیاں واٹس ایپ کے ذریعے آ رہی ہیں۔',
    labels: ['blackmail', 'cyber-crime', 'extortion'],
    language: 'ur',
    province: undefined,
  },
  // ── Criminal intimidation / threats ───────────────────────────────────────
  {
    caseId: 'demo-intimidation-en',
    description:
      'Someone is sending me repeated messages threatening to harm me and members of my family if I do not withdraw my court case. I have screenshots of all the threats.',
    labels: ['criminal intimidation', 'threats', 'coercion'],
    language: 'en',
    province: undefined,
  },
  {
    caseId: 'demo-intimidation-ur',
    description:
      'ایک شخص مجھے بار بار پیغامات بھیج رہا ہے اور دھمکی دے رہا ہے کہ اگر میں نے عدالتی کیس واپس نہ لیا تو وہ مجھے اور میرے گھر والوں کو نقصان پہنچائے گا۔',
    labels: ['criminal intimidation', 'threats', 'coercion'],
    language: 'ur',
    province: undefined,
  },
  // ── FIR process ───────────────────────────────────────────────────────────
  {
    caseId: 'demo-fir-en',
    description:
      'I want to file a First Information Report (FIR) with the police but the station is refusing to register my complaint. What is the legal process and what are my rights?',
    labels: ['FIR', 'police complaint', 'criminal procedure'],
    language: 'en',
    province: undefined,
  },
  {
    caseId: 'demo-fir-ur',
    description:
      'میں پولیس اسٹیشن میں ایف آئی آر درج کروانا چاہتی ہوں لیکن پولیس والے میری شکایت قبول کرنے سے انکار کر رہے ہیں۔ قانونی طریقہ کار کیا ہے اور میرے کیا حقوق ہیں؟',
    labels: ['FIR', 'police complaint', 'criminal procedure'],
    language: 'ur',
    province: undefined,
  },
  // ── Built-in Demo Case (Frontend case-demo-104) ────────────────────────────
  {
    caseId: 'case-demo-104',
    description: builtinCaseFacts,
    labels: builtinCategories,
    language: 'en',
    province: 'federal',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Installs console.warn and console.log intercepts before the case pipeline runs
 * and returns a function to remove them and collect results.
 */
function installCaseInterception(): () => {
  queriesUsedLlm: boolean;
  explainUsedLlm: boolean;
  modelUsed: string;
} {
  const QUERY_FALLBACK_PREFIX = '[QUERY WRITER] LLM query writer fallback';
  const EXPLAIN_FALLBACK_PREFIX = '[EXPLAIN SECTIONS] LLM call failed';

  let queriesFell = false;
  let explainFell = false;
  let queriesOk = false;
  let explainOk = false;
  let modelFound = '';

  const origWarn = console.warn;
  const origLog = console.log;

  console.warn = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    if (msg.includes(QUERY_FALLBACK_PREFIX)) queriesFell = true;
    if (msg.includes(EXPLAIN_FALLBACK_PREFIX)) explainFell = true;
    origWarn.apply(console, args);
  };

  console.log = (...args: unknown[]) => {
    const msg = String(args[0] ?? '');
    // e.g.: [LLM] model=gemini-3.5-flash-lite key=...1iqA status=ok (queries)
    const m = msg.match(/\[LLM\]\s+model=([^\s]+)\s+key=[^\s]+\s+status=ok\s+\((queries|explain)\)/);
    if (m) {
      modelFound = m[1];
      if (m[2] === 'queries') queriesOk = true;
      if (m[2] === 'explain') explainOk = true;
    }
    origLog.apply(console, args);
  };

  return () => {
    // Restore originals
    console.warn = origWarn;
    console.log = origLog;
    return {
      queriesUsedLlm: queriesOk && !queriesFell,
      explainUsedLlm: explainOk && !explainFell,
      modelUsed: modelFound || getLastSuccessModel(),
    };
  };
}

/** Returns true if every citedCard.chunkId is in the retrieved set. */
function allCitationsGrounded(
  cards: CitedLegalCard[],
  retrieved: LegalSection[]
): boolean {
  const ids = new Set(retrieved.map((s) => s.id));
  return cards.every((c) => c.chunkId && ids.has(c.chunkId));
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface CacheEntry {
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

interface CacheFile {
  version: string;
  generatedAt: string;
  cases: Record<string, CacheEntry>;
}

async function main() {
  console.log('====================================================');
  console.log('  Sakhi Vault — Demo Cache Warmer (warm-cache)      ');
  console.log('====================================================\n');
  console.log(`Cases to process: ${DEMO_CASES.length}`);
  console.log(`Output file:      ${CACHE_FILE}\n`);

  // ── API key check ────────────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const keyHint = apiKey.length >= 4 ? `...${apiKey.slice(-4)}` : '(not set)';
  console.log(`API key ending: ${keyHint}   hasApiKey=${hasApiKey}`);
  if (!hasApiKey) {
    console.error('\n❌ No API key found — LLM steps will all be template fallbacks.\n'
      + '   Set GEMINI_API_KEY in .env and re-run.\n');
    process.exit(1);
  }
  console.log('');

  // Load existing cache if present so we can merge / update individual entries.
  let existing: CacheFile = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    cases: {},
  };
  if (fs.existsSync(CACHE_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8')) as CacheFile;
      console.log(`Loaded existing cache with ${Object.keys(existing.cases).length} entry(s).\n`);
    } catch {
      console.warn('⚠️  Existing cache file could not be parsed — starting fresh.\n');
    }
  }

  const results: Array<{
    caseId: string;
    status: 'CACHED' | 'SKIPPED';
    reason?: string;
    model?: string;
  }> = [];

  for (let i = 0; i < DEMO_CASES.length; i++) {
    const demo = DEMO_CASES[i];

    console.log(`----------------------------------------------------`);
    console.log(`[${i + 1}/${DEMO_CASES.length}] ${demo.caseId}`);
    console.log(`  Language: ${demo.language}  Province: ${demo.province || 'federal'}`);
    console.log(`  Description: "${demo.description.slice(0, 90)}..."`);
    console.log('');

    // Install intercepts before any pipeline call so every [LLM] log is captured.
    const stopInterception = installCaseInterception();

    let searchQueries: string[] = [];
    let retrieved: LegalSection[] = [];
    let cards: CitedLegalCard[] = [];
    let pipelineError: unknown = null;

    try {
      // Step 1: Query writer (LLM)
      searchQueries = await writeSearchQueries({ labels: demo.labels, keyFacts: demo.description });

      // Step 2: Retrieval (pure — no LLM — but kept inside intercept block for consistency)
      retrieved = await retrieveSections(searchQueries, demo.province);

      // Step 3: explainSections (LLM) — only when retrieval found chunks
      if (retrieved.length > 0) {
        cards = await explainSections(demo.description, retrieved, demo.language);
      }
    } catch (err) {
      pipelineError = err;
    }

    // Always stop intercepts before logging so our own console.logs are clean.
    const { queriesUsedLlm, explainUsedLlm, modelUsed } = stopInterception();

    if (pipelineError) {
      console.error(`  ❌ Pipeline threw: ${pipelineError}`);
      results.push({ caseId: demo.caseId, status: 'SKIPPED', reason: `pipeline error: ${pipelineError}` });
      if (i < DEMO_CASES.length - 1) await sleep(6000);
      continue;
    }

    console.log(`  Queries LLM: ${queriesUsedLlm ? '✅ ok' : '❌ fallback'}`);
    console.log(`  Search queries: ${searchQueries.map((q) => `"${q}"`).join(', ')}`);
    console.log(`  Retrieved: ${retrieved.length} chunk(s)`);

    if (retrieved.length === 0) {
      console.log(`  ⏭️  SKIPPED — retrieval returned 0 chunks.\n`);
      results.push({ caseId: demo.caseId, status: 'SKIPPED', reason: 'retrieval returned 0 chunks' });
      if (i < DEMO_CASES.length - 1) await sleep(6000);
      continue;
    }

    console.log(`  Explain LLM:  ${explainUsedLlm ? '✅ ok' : '❌ fallback'}`);
    console.log(`  Cards returned: ${cards.length}`);
    console.log(`  Model used: ${modelUsed}`);

    // ── Qualification checks ──────────────────────────────────────────────
    if (!queriesUsedLlm) {
      console.log(`  ⏭️  SKIPPED — query-writer used fallback (no LLM).\n`);
      results.push({ caseId: demo.caseId, status: 'SKIPPED', reason: 'query-writer fallback' });
      if (i < DEMO_CASES.length - 1) await sleep(6000);
      continue;
    }
    if (!explainUsedLlm) {
      console.log(`  ⏭️  SKIPPED — explainSections used fallback (no LLM).\n`);
      results.push({ caseId: demo.caseId, status: 'SKIPPED', reason: 'explainSections fallback' });
      if (i < DEMO_CASES.length - 1) await sleep(6000);
      continue;
    }
    if (!allCitationsGrounded(cards, retrieved)) {
      const ungrounded = cards
        .filter((c) => !retrieved.some((r) => r.id === c.chunkId))
        .map((c) => c.chunkId);
      console.log(`  ⏭️  SKIPPED — ungrounded citations: ${ungrounded.join(', ')}\n`);
      results.push({ caseId: demo.caseId, status: 'SKIPPED', reason: `ungrounded citations: ${ungrounded.join(', ')}` });
      if (i < DEMO_CASES.length - 1) await sleep(6000);
      continue;
    }

    // ── All checks passed → cache ────────────────────────────────────────
    const entry: CacheEntry = {
      caseId: demo.caseId,
      description: demo.description,
      language: demo.language,
      province: demo.province ?? null,
      model: modelUsed,
      cachedAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
      isPlaceholder: false,
      citedCards: cards,
    };
    existing.cases[demo.caseId] = entry;
    console.log(`  ✅ CACHED  model=${modelUsed}  citations=${cards.length} (all grounded)\n`);
    results.push({ caseId: demo.caseId, status: 'CACHED', model: modelUsed });

    if (i < DEMO_CASES.length - 1) await sleep(6000);
  }

  // ── Write updated cache ──────────────────────────────────────────────────
  existing.generatedAt = new Date().toISOString();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`\nCache written → ${CACHE_FILE}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  const cached = results.filter((r) => r.status === 'CACHED');
  const skipped = results.filter((r) => r.status === 'SKIPPED');

  console.log('\n====================================================');
  console.log('                      SUMMARY                       ');
  console.log('====================================================');
  console.log(`Cached:  ${cached.length}/${DEMO_CASES.length}`);
  if (cached.length > 0) {
    cached.forEach((r) => console.log(`  ✅  ${r.caseId}  (model: ${r.model})`));
  }
  console.log(`Skipped: ${skipped.length}/${DEMO_CASES.length}`);
  if (skipped.length > 0) {
    skipped.forEach((r) => console.log(`  ⏭️   ${r.caseId}  — ${r.reason}`));
  }
  console.log('====================================================\n');

  if (cached.length === 0) {
    console.error('❌ No cases were cached. Check LLM availability (try npm run llm:check).');
    process.exit(1);
  } else {
    console.log(`🎉 Done. ${cached.length} case(s) cached with verified LLM output.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\nFatal error in warm-cache:', err);
  process.exit(1);
});
