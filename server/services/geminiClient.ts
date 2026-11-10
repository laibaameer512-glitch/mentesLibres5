import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Single source of truth for Gemini model names and rotation configuration.
 * No other file in the project should define or hardcode Gemini model strings.
 */
export const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
export const DEFAULT_EMBEDDING_MODEL = 'models/gemini-embedding-001';

/**
 * Reads GEMINI_MODELS from environment in priority order (comma-separated).
 * Falls back to DEFAULT_GEMINI_MODELS if missing or empty.
 */
export function getGeminiModels(): string[] {
  const raw = process.env.GEMINI_MODELS;
  if (!raw || !raw.trim()) {
    return [...DEFAULT_GEMINI_MODELS];
  }
  const models = raw
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return models.length > 0 ? models : [...DEFAULT_GEMINI_MODELS];
}

/**
 * Reads all configured Gemini API keys (comma-separated or single var).
 */
export function getGeminiApiKeys(): string[] {
  const raw =
    process.env.GEMINI_API_KEYS ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    '';
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 5);
}

export const hasApiKey = getGeminiApiKeys().length > 0;
export const hasAnyKey = hasApiKey;

/**
 * Configurable timeouts for Gemini API operations:
 * - Text calls default to 25s (GEMINI_TEXT_TIMEOUT_MS)
 * - Audio calls default to 45s (GEMINI_AUDIO_TIMEOUT_MS)
 */
export function getTextTimeoutMs(): number {
  const val = Number(process.env.GEMINI_TEXT_TIMEOUT_MS);
  return !isNaN(val) && val > 0 ? val : 25000;
}

export function getAudioTimeoutMs(): number {
  const val = Number(process.env.GEMINI_AUDIO_TIMEOUT_MS);
  return !isNaN(val) && val > 0 ? val : 45000;
}

/**
 * Promise timeout utility that marks the error as a TimeoutError
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => {
        const err: any = new Error(msg);
        err.name = 'TimeoutError';
        err.isTimeout = true;
        reject(err);
      }, ms);
      if (timer.unref) timer.unref();
    }),
  ]);
}

export interface LlmPair {
  key: string;
  model: string;
}

export interface PairState {
  disabledForProcess: boolean;
  cooldownUntil: number; // epoch ms
  firstQuota429At: number; // epoch ms of first 429 in rolling 10-min window
}

// Global rotation state shared across all services
const _pairState = new Map<string, PairState>();
const _modelLastCall = new Map<string, number>();

let _activeModel = '';

export function getActiveModel(): string {
  return _activeModel || getGeminiModels()[0] || '(none)';
}

export function getLastSuccessModel(): string {
  return getActiveModel();
}

function _pairKey(p: LlmPair): string {
  return `${p.model}::${p.key}`;
}

function _getState(p: LlmPair): PairState {
  const k = _pairKey(p);
  if (!_pairState.has(k)) {
    _pairState.set(k, { disabledForProcess: false, cooldownUntil: 0, firstQuota429At: 0 });
  }
  return _pairState.get(k)!;
}

function _keyHint(key: string): string {
  return key.length >= 4 ? `...${key.slice(-4)}` : '(short)';
}

/**
 * Enforce >= 4s between calls to the same model to prevent RPM rate limit spikes.
 */
async function _throttleModel(model: string): Promise<void> {
  const last = _modelLastCall.get(model) ?? 0;
  const wait = last + 4000 - Date.now();
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait));
  }
  _modelLastCall.set(model, Date.now());
}

// Client cache per API key
const _clientCache = new Map<string, GoogleGenAI>();

export function getGenAIClient(apiKey: string): GoogleGenAI {
  const key = (apiKey || '').trim();
  if (!_clientCache.has(key)) {
    _clientCache.set(
      key,
      new GoogleGenAI(
        key.length > 5
          ? {
              apiKey: key,
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                },
              },
            }
          : {
              httpOptions: {
                headers: {
                  'User-Agent': 'aistudio-build',
                },
              },
            }
      )
    );
  }
  return _clientCache.get(key)!;
}

export const ai = getGenAIClient(getGeminiApiKeys()[0] || '');

/**
 * Executes an LLM call with priority rotation across all configured models and keys.
 * If a model times out, is rate-limited (429), or fails, it moves to the next model/key pair.
 */
export async function withRotation<T>(
  callLabel: string,
  fn: (pair: LlmPair, client: GoogleGenAI) => Promise<T>,
  options?: { timeoutMs?: number; isAudio?: boolean }
): Promise<T> {
  const keys = getGeminiApiKeys();
  const models = getGeminiModels();
  const timeoutMs =
    options?.timeoutMs ??
    (options?.isAudio ? getAudioTimeoutMs() : getTextTimeoutMs());

  const pairs: LlmPair[] = [];
  for (const model of models) {
    for (const key of keys) {
      pairs.push({ key, model });
    }
  }

  if (pairs.length === 0) {
    throw new Error(`[LLM ROUTER] No API keys configured (${callLabel})`);
  }

  let lastErr: unknown;

  for (const pair of pairs) {
    const state = _getState(pair);

    // Skip permanently disabled pairs (403 / 404)
    if (state.disabledForProcess) continue;

    // Skip pairs currently on cooldown (429)
    if (Date.now() < state.cooldownUntil) continue;

    // Per-model throttle
    await _throttleModel(pair.model);

    const client = getGenAIClient(pair.key);

    try {
      const result = await withTimeout(
        fn(pair, client),
        timeoutMs,
        `[${pair.model}] ${callLabel} call timed out after ${timeoutMs}ms`
      );

      _activeModel = pair.model;
      console.log(`[LLM] model=${pair.model} key=${_keyHint(pair.key)} status=ok (${callLabel})`);
      return result;
    } catch (err: unknown) {
      lastErr = err;
      const e = err as Record<string, unknown>;
      const status = e?.status as number | undefined;
      const isTimeout = Boolean(
        e?.name === 'TimeoutError' ||
          e?.isTimeout ||
          (String(e?.message || '').toLowerCase().includes('time') &&
            String(e?.message || '').toLowerCase().includes('out'))
      );

      if (status === 429) {
        const now = Date.now();
        const TEN_MIN = 10 * 60 * 1000;
        const isRepeat = state.firstQuota429At > 0 && now - state.firstQuota429At < TEN_MIN;
        const cooldownMs = isRepeat ? 30 * 60 * 1000 : 60 * 1000;
        state.cooldownUntil = now + cooldownMs;
        if (!isRepeat) state.firstQuota429At = now;
        console.log(
          `[LLM] model=${pair.model} key=${_keyHint(pair.key)} status=429 (${callLabel}) — cooldown ${
            cooldownMs / 1000
          }s`
        );
      } else if (status === 403 || status === 404) {
        state.disabledForProcess = true;
        console.log(
          `[LLM] model=${pair.model} key=${_keyHint(pair.key)} status=${status} (${callLabel}) — disabled for process`
        );
      } else if (isTimeout) {
        // Timeout: transient error, rotate immediately to next pair
        console.log(
          `[LLM] model=${pair.model} key=${_keyHint(pair.key)} status=timeout (${callLabel}) — timed out, trying next model/key`
        );
      } else {
        // 5xx / network / high demand: transient error, rotate immediately
        const statusStr = status !== undefined ? String(status) : 'transient_error';
        console.log(
          `[LLM] model=${pair.model} key=${_keyHint(pair.key)} status=${statusStr} (${callLabel}) — trying next`
        );
      }
    }
  }

  // All pairs exhausted
  throw lastErr ?? new Error(`[LLM ROUTER] All pairs failed (${callLabel})`);
}
