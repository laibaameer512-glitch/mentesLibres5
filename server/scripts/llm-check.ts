/**
 * llm:check — read-only smoke test for every (key, model) pair.
 * Usage: npm run llm:check
 *
 * Sends "say hello" through each configured (key, model) pair once
 * and prints: model, key hint, HTTP status or ok, first 120 chars of response.
 *
 * Never prints a full API key.
 * Does NOT modify any corpus, index, or state.
 */
import dotenv from 'dotenv';
dotenv.config();

import { GoogleGenAI } from '@google/genai';

interface Pair { key: string; model: string }

function keyHint(key: string): string {
  return key.length >= 4 ? `...${key.slice(-4)}` : '(short)';
}

function buildPairs(): Pair[] {
  const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const keys = rawKeys.split(',').map((k) => k.trim()).filter(Boolean);
  const rawModels = process.env.GEMINI_MODELS || 'gemini-3.8-flash';
  const models = rawModels.split(',').map((m) => m.trim()).filter(Boolean);

  const pairs: Pair[] = [];
  for (const model of models) {
    for (const key of keys) {
      pairs.push({ key, model });
    }
  }
  return pairs;
}

async function checkPair(pair: Pair): Promise<void> {
  const tag = `model=${pair.model} key=${keyHint(pair.key)}`;
  const pairAi = new GoogleGenAI({
    apiKey: pair.key,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  try {
    const res = await Promise.race([
      pairAi.models.generateContent({ model: pair.model, contents: 'say hello' }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 30000)
      ),
    ]);
    const text = ((res as { text?: string }).text || '').slice(0, 120).replace(/\n/g, ' ');
    console.log(`  ✅ ${tag}  status=ok  reply="${text}"`);
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const status = e?.['status'] as number | undefined;
    let msg = String(e?.['message'] ?? err);
    // Sanitise: never print key material
    msg = msg.replace(/AIza[A-Za-z0-9_-]{30,}/g, 'REDACTED');
    msg = msg.replace(/key[=:]["']?[A-Za-z0-9_-]{20,}/gi, 'key=REDACTED');
    const statusStr = status !== undefined ? String(status) : (msg.includes('timeout') ? 'timeout' : 'error');
    console.log(`  ❌ ${tag}  status=${statusStr}  msg="${msg.slice(0, 150)}"`);
  }
}

async function main() {
  console.log('====================================================');
  console.log('  Sakhi Vault — LLM Key/Model Connectivity Check   ');
  console.log('====================================================\n');

  const pairs = buildPairs();
  if (pairs.length === 0) {
    console.error('❌ No API keys found. Set GEMINI_API_KEYS (or GEMINI_API_KEY) in .env');
    process.exit(1);
  }

  console.log(`Testing ${pairs.length} pair(s) — sending "say hello" to each:\n`);

  for (const pair of pairs) {
    await checkPair(pair);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal error in llm:check:', err);
  process.exit(1);
});

