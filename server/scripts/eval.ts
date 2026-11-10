/**
 * Legal RAG Evaluation Script (npm run eval)
 * Evaluates retrieval quality and grounded citation fidelity against
 * test scenarios defined in /server/data/legal/eval.json.
 *
 * Env vars:
 *  EVAL_ONLY  Comma-separated scenario ids to run (default: all).
 *
 * Metrics:
 *  1. Top-6 Hit Rate (% of scenarios where expected chunk is in top 6)
 *  2. Citation Accuracy (% of citations that strictly resolve to retrieved set, must be 100%)
 *  3. LLM vs fallback counts per step, and citation accuracy over LLM-only scenarios.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

import {
  retrieveSections,
  explainSections,
  verifyCitations,
  writeSearchQueries,
  LegalSection,
} from '../services/legal.ts';

interface EvalScenario {
  id: string;
  description: string;
  province?: string;
  expectedChunkIds: string[];
  /** If set, the scenario passes only when no retrieved chunk id starts with this prefix. */
  forbiddenActPrefix?: string;
  /** If true, print retrieval results but exclude from all metrics. */
  observeOnly?: boolean;
}

const EVAL_FILE = path.resolve(process.cwd(), 'server/data/legal/eval.json');
const INDEX_FILE = path.resolve(process.cwd(), 'server/data/legalIndex.json');

async function main() {
  console.log('====================================================');
  console.log('      Sakhi Vault: Legal RAG Pipeline Evaluation    ');
  console.log('====================================================\n');

  // ── Startup diagnostics (safe — never prints the full key) ───────────────
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '';
  const keyHint = apiKey.length >= 4 ? `...${apiKey.slice(-4)}` : apiKey ? '(set, <4 chars)' : '(not set)';
  const MODEL_NAME = 'gemini-3.8-flash'; // must match legal.ts
  console.log(`API key ending: ${keyHint}   Model: ${MODEL_NAME}\n`);
  // ─────────────────────────────────────────────────────────────────────────

  if (!fs.existsSync(EVAL_FILE)) {
    console.error(`❌ Evaluation file not found at: ${EVAL_FILE}`);
    process.exit(1);
  }

  const scenarios: EvalScenario[] = JSON.parse(
    fs.readFileSync(EVAL_FILE, 'utf-8')
  );

  // ── EVAL_ONLY filter ───────────────────────────────────────────────────────
  // If the env var is set, run only the listed scenario ids (comma-separated).
  const evalOnlyRaw = process.env.EVAL_ONLY;
  const evalOnlyIds: Set<string> | null = evalOnlyRaw
    ? new Set(evalOnlyRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  const activeScenarios = evalOnlyIds
    ? scenarios.filter((sc) => evalOnlyIds.has(sc.id))
    : scenarios;

  if (evalOnlyIds) {
    const missing = [...evalOnlyIds].filter(
      (id) => !scenarios.some((sc) => sc.id === id)
    );
    if (missing.length > 0) {
      console.warn(`⚠️  EVAL_ONLY: the following ids were not found in eval.json: ${missing.join(', ')}\n`);
    }
    console.log(`EVAL_ONLY active: running ${activeScenarios.length}/${scenarios.length} scenario(s): ${[...evalOnlyIds].join(', ')}\n`);
  }

  console.log(`Loaded ${scenarios.length} evaluation scenario(s) from ${EVAL_FILE}${evalOnlyIds ? ` (filtered to ${activeScenarios.length})` : ''}\n`);

  // ── Read-only corpus-existence check ──────────────────────────────────────
  // Print any expectedChunkId that does not appear in the index (read-only;
  // does not affect metrics or exit code).
  if (fs.existsSync(INDEX_FILE)) {
    const indexData = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
    const corpusIds: Set<string> = new Set(
      (indexData.chunks as Array<{ id: string }>).map((c) => c.id)
    );
    const missingIds: string[] = [];
    for (const sc of activeScenarios) {
      for (const expId of sc.expectedChunkIds) {
        if (!corpusIds.has(expId)) {
          missingIds.push(`  [${sc.id}] → ${expId}`);
        }
      }
    }
    if (missingIds.length > 0) {
      console.warn('⚠️  CORPUS EXISTENCE CHECK — the following expectedChunkIds are NOT in the index:');
      missingIds.forEach((m) => console.warn(m));
      console.warn('');
    } else {
      console.log('✅ Corpus existence check: all expectedChunkIds found in index.\n');
    }
  } else {
    console.warn(`⚠️  Index file not found at ${INDEX_FILE}; skipping corpus existence check.\n`);
  }
  // ──────────────────────────────────────────────────────────────────────────

  let hits = 0;
  let totalExpected = 0;
  let totalCitations = 0;
  let validCitations = 0;
  // "Scenario-level" hit: at least one expected chunk found (excludes empty-expected & observeOnly)
  let scenariosWithAnyHit = 0;
  let scoredScenarios = 0;
  // LLM vs fallback tracking
  let queriesLlm = 0;      // writeSearchQueries used LLM
  let queriesFallback = 0; // writeSearchQueries fell back
  let explainLlm = 0;      // explainSections used LLM
  let explainFallback = 0; // explainSections fell back
  // Citation accuracy over LLM-only explain scenarios
  let llmCitations = 0;
  let llmValidCitations = 0;

  /**
   * Wraps a service call and detects whether it used the LLM or fell back,
   * by temporarily intercepting console.warn for the known fallback log prefixes.
   * Returns { result, usedLlm, fallbackReason }.
   * fallbackReason is set only when usedLlm=false; it contains "HTTP <status>: <msg[:150]>"
   * and never contains the API key.
   */
  async function callWithLlmDetection<T>(
    fn: () => Promise<T>,
    fallbackPrefix: string
  ): Promise<{ result: T; usedLlm: boolean; fallbackReason: string }> {
    let fellBack = false;
    let fallbackReason = '';
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const msg = String(args[0] ?? '');
      if (msg.includes(fallbackPrefix)) {
        fellBack = true;
        // Extract the error from subsequent args or the message itself.
        // legal.ts logs: console.warn('[QUERY WRITER] LLM query writer fallback:', err)
        // The error object is in args[1] when it exists, otherwise embedded in msg.
        const errArg = args[1];
        if (errArg && typeof errArg === 'object') {
          const e = errArg as Record<string, unknown>;
          const status = typeof e['status'] === 'number' ? e['status'] : '';
          // Extract message from the error body, stripping any API key patterns (aiza[A-Za-z0-9_-]{30,})
          let errMsg = String(e['message'] ?? '');
          // Sanitise: remove anything that looks like an API key (long alphanumeric after a known prefix)
          errMsg = errMsg.replace(/key[=:]["']?[A-Za-z0-9_-]{20,}/gi, 'key=REDACTED');
          errMsg = errMsg.replace(/AIza[A-Za-z0-9_-]{30,}/g, 'REDACTED');
          fallbackReason = status
            ? `HTTP ${status}: ${errMsg.slice(0, 150)}`
            : errMsg.slice(0, 150);
        } else {
          // Try to parse status and message from the stringified error embedded in msg
          const statusMatch = msg.match(/"code"\s*:\s*(\d+)/);
          const msgMatch = msg.match(/"message"\s*:\s*"([^"]{0,200})"/);
          const status = statusMatch ? statusMatch[1] : '';
          let errMsg = msgMatch ? msgMatch[1] : msg.slice(fallbackPrefix.length, fallbackPrefix.length + 150);
          errMsg = errMsg.replace(/AIza[A-Za-z0-9_-]{30,}/g, 'REDACTED');
          fallbackReason = status ? `HTTP ${status}: ${errMsg.slice(0, 150)}` : errMsg.slice(0, 150);
        }
      }
      origWarn.apply(console, args);
    };
    try {
      const result = await fn();
      return { result, usedLlm: !fellBack, fallbackReason };
    } finally {
      console.warn = origWarn;
    }
  }

  for (let i = 0; i < activeScenarios.length; i++) {
    const sc = activeScenarios[i];
    const observeOnly = sc.observeOnly === true;

    console.log(`[Scenario ${i + 1}/${activeScenarios.length}] ${sc.id}${observeOnly ? ' [OBSERVE ONLY — not counted in metrics]' : ''}`);
    console.log(`  Query/Facts: "${sc.description}"`);
    console.log(`  Province: ${sc.province || 'federal'}`);
    if (!observeOnly) {
      console.log(`  Expected chunks: ${sc.expectedChunkIds.join(', ') || '(none — no-answer scenario)'}`);
    }

    // 1. Query Writer — same step as the real app: translates Urdu/non-English
    //    descriptions to 2–3 short English legal queries before retrieval.
    const { result: searchQueries, usedLlm: queriesUsedLlm, fallbackReason: queriesFallbackReason } =
      await callWithLlmDetection(
        () => writeSearchQueries({ labels: [], keyFacts: sc.description }),
        '[QUERY WRITER] LLM query writer fallback'
      );
    if (queriesUsedLlm) queriesLlm++; else queriesFallback++;
    console.log(`  Search Queries: ${searchQueries.map((q) => `"${q}"`).join(', ')}`);

    // 2. Run Retrieval Pipeline with the generated English queries
    const retrieved: LegalSection[] = await retrieveSections(
      searchQueries,
      sc.province
    );
    const retrievedIds = retrieved.map((r) => r.id);

    console.log(`  Retrieved Top 6:`);
    retrieved.forEach((r, idx) => {
      console.log(`    ${idx + 1}. [${r.id}] ${r.title} (Score: ${r.score})`);
    });

    // ── observeOnly: print and skip all metric accounting ───────────────────
    if (observeOnly) {
      const qStatus = queriesUsedLlm ? 'ok' : `fallback(${queriesFallbackReason || 'unknown'})`;
      console.log(`  LLM: queries=${qStatus}`);
      console.log(`  (observe-only — skipped from metrics)\n`);
      continue;
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── forbiddenActPrefix check ─────────────────────────────────────────────
    if (sc.forbiddenActPrefix) {
      const forbidden = retrievedIds.filter((id) =>
        id.startsWith(sc.forbiddenActPrefix!)
      );
      if (forbidden.length > 0) {
        console.error(`  ❌ PROVINCE FILTER FAIL: Retrieved chunk(s) with forbidden prefix "${sc.forbiddenActPrefix}":`);
        forbidden.forEach((id) => console.error(`    - ${id}`));
      } else {
        console.log(`  ✅ Province filter OK: no chunk starts with "${sc.forbiddenActPrefix}"`);
      }
      // forbiddenActPrefix scenarios have empty expectedChunkIds — still run
      // citation check but skip chunk-hit metrics.
      console.log('');
    }
    // ────────────────────────────────────────────────────────────────────────

    // Check Hits (chunk-level)
    let scenarioHits = 0;
    for (const expectedId of sc.expectedChunkIds) {
      totalExpected++;
      if (retrievedIds.includes(expectedId)) {
        scenarioHits++;
        hits++;
      }
    }

    // Scenario-level hit metric (only scenarios with ≥1 expected id)
    if (sc.expectedChunkIds.length > 0) {
      scoredScenarios++;
      if (scenarioHits > 0) scenariosWithAnyHit++;
    }

    const hitStatus = scenarioHits === sc.expectedChunkIds.length ? '✓ HIT' : '⚠️ PARTIAL/MISS';
    console.log(`  Retrieval: ${hitStatus} (${scenarioHits}/${sc.expectedChunkIds.length} expected found)`);

    // 2. Run Grounded Explanation & Citation Verification
    const { result: cards, usedLlm: explainUsedLlm, fallbackReason: explainFallbackReason } =
      await callWithLlmDetection(
        () => explainSections(sc.description, retrieved),
        '[EXPLAIN SECTIONS] LLM call failed'
      );
    if (explainUsedLlm) explainLlm++; else explainFallback++;

    // Print combined LLM status for this scenario — include reason when falling back
    const qStatus = queriesUsedLlm ? 'ok' : `fallback(${queriesFallbackReason || 'unknown'})`;
    const eStatus = explainUsedLlm ? 'ok' : `fallback(${explainFallbackReason || 'unknown'})`;
    console.log(`  LLM: queries=${qStatus}  explain=${eStatus}`);

    // Verify citations: every card must have a chunkId in retrievedIds
    let scenarioValidCitations = 0;
    for (const card of cards) {
      totalCitations++;
      if (card.chunkId && retrievedIds.includes(card.chunkId)) {
        validCitations++;
        scenarioValidCitations++;
        if (explainUsedLlm) { llmCitations++; llmValidCitations++; }
      } else {
        console.error(`  ❌ CITATION ERROR: Card cited ungrounded chunkId: '${card.chunkId}'`);
        if (explainUsedLlm) llmCitations++;
      }
    }

    const verifiedClean = verifyCitations(
      cards.map((c) => ({ chunkId: c.chunkId || '' })),
      retrieved
    );

    console.log(
      `  Citations: ${scenarioValidCitations}/${cards.length} verified strictly grounded\n`
    );
  }

  // Calculate Metrics
  const hitRate = totalExpected > 0 ? (hits / totalExpected) * 100 : 0;
  const citationAccuracy =
    totalCitations > 0 ? (validCitations / totalCitations) * 100 : 100;
  // Scenario-level: % of non-empty-expected, non-observeOnly scenarios
  // that have at least one expected chunk in top 6.
  const scenarioHitRate =
    scoredScenarios > 0 ? (scenariosWithAnyHit / scoredScenarios) * 100 : 0;
  // Citation accuracy only over scenarios where explainSections used the LLM
  const llmCitationAccuracy =
    llmCitations > 0
      ? `${((llmValidCitations / llmCitations) * 100).toFixed(1)}% (over ${explainLlm} LLM scenario(s))`
      : 'n/a (no scenarios used LLM for explain)';
  const fullyLlm = Math.min(queriesLlm, explainLlm); // both steps on LLM
  const anyFallback = activeScenarios.filter((s) => !s.observeOnly).length - fullyLlm;

  console.log('====================================================');
  console.log('                   EVALUATION SUMMARY                ');
  console.log('====================================================');
  console.log(`Total Scenarios:       ${scenarios.length}`);
  console.log(`  Active (this run):   ${activeScenarios.length}${evalOnlyIds ? '  [EVAL_ONLY filter applied]' : ''}`);
  console.log(`  Scored (metrics):    ${activeScenarios.filter(s => !s.observeOnly).length}`);
  console.log(`  Observe-only:        ${activeScenarios.filter(s => s.observeOnly).length}`);
  console.log(`Expected Chunk Hits:   ${hits}/${totalExpected}`);
  console.log(`Top-6 Hit Rate:        ${hitRate.toFixed(1)}%  (chunk-level: hits/totalExpected)`);
  console.log(`Scenarios ≥1 Hit:      ${scenariosWithAnyHit}/${scoredScenarios} = ${scenarioHitRate.toFixed(1)}%  (scenario-level, excludes empty-expected)`);
  console.log(`Citation Accuracy:     ${citationAccuracy.toFixed(1)}% (Must be 100%)`);
  console.log(`Citation Acc (LLM):    ${llmCitationAccuracy}`);
  console.log(`----------------------------------------------------`);
  console.log(`LLM Usage — queries:   ${queriesLlm} ok / ${queriesFallback} fallback`);
  console.log(`LLM Usage — explain:   ${explainLlm} ok / ${explainFallback} fallback`);
  console.log(`Fully on LLM:          ${fullyLlm}  |  Any fallback: ${anyFallback}`);
  console.log('====================================================');

  const passed = hitRate >= 75 && citationAccuracy === 100;

  if (passed) {
    console.log('\n🎉 EVALUATION PASSED: All citations strictly grounded, high retrieval accuracy!\n');
    process.exit(0);
  } else {
    console.error('\n❌ EVALUATION FAILED: Requirements not met (Citation accuracy must be 100% and hit rate >= 75%).\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal evaluation error:', err);
  process.exit(1);
});

