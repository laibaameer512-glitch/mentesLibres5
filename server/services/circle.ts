import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export interface CircleRecord {
  hash: string;
  reporterPseudonym: string;
  category: string;
  month: string; // YYYY-MM
  caseId?: string;
  createdAt: string;
}

export interface CircleAuditLog {
  actor: string;
  action: string;
  time: string;
}

export interface CircleDbData {
  records: CircleRecord[];
  auditLogs: CircleAuditLog[];
}

// Memory database synced to disk
const DATA_DIR = path.resolve(process.cwd(), 'server/data');
const DB_FILE = path.resolve(DATA_DIR, 'circleDb.json');

// Rate limiting state: reporterPseudonym -> array of request timestamps in ms
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;

function getCircleSecret(): string {
  const secret = process.env.CIRCLE_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error('Server configuration error: CIRCLE_SECRET environment variable is missing. Please set CIRCLE_SECRET in .env.');
  }
  return secret.trim();
}

/**
 * Normalizes phone numbers to canonical E.164-style Pakistani format (+923XXXXXXXXX)
 */
export function normalizePhone(raw: string): string {
  if (!raw) return '';
  // Remove non-digit characters except leading +
  const cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');

  // 03XX XXXXXXX (11 digits starting with 03) -> +923XXXXXXXXX
  if (/^03\d{9}$/.test(cleaned)) {
    return `+92${cleaned.slice(1)}`;
  }
  // 923XXXXXXXXX (12 digits starting with 923) -> +923XXXXXXXXX
  if (/^923\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  // 00923XXXXXXXXX -> +923XXXXXXXXX
  if (/^00923\d{9}$/.test(cleaned)) {
    return `+${cleaned.slice(2)}`;
  }
  // Already in +923XXXXXXXXX format
  if (/^\+923\d{9}$/.test(cleaned)) {
    return cleaned;
  }
  // Fallback: if starts with +, keep +digits, otherwise return cleaned digits
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/**
 * Normalizes social handles (lowercase, stripped of leading @ and whitespace)
 */
export function normalizeHandle(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

/**
 * Normalizes location tags or other identifiers (lowercase, trimmed)
 */
export function normalizeGenericIdentifier(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Dispatches normalization based on identifier type
 */
export function normalizeIdentifier(type: 'phone' | 'handle' | 'location' | 'other', value: string): string {
  if (type === 'phone') return normalizePhone(value);
  if (type === 'handle') return normalizeHandle(value);
  return normalizeGenericIdentifier(value);
}

/**
 * Computes HMAC-SHA256 with the server-side secret
 * Raw value is immediately hashed and NEVER stored or logged.
 */
export function computeIdentifierHmac(normalizedValue: string): string {
  const secret = getCircleSecret();
  return crypto.createHmac('sha256', secret).update(normalizedValue).digest('hex');
}

/**
 * Checks in-memory rate limiting per reporterPseudonym
 */
export function checkRateLimit(reporterPseudonym: string): boolean {
  if (!reporterPseudonym) return true;
  const now = Date.now();
  const timestamps = rateLimitMap.get(reporterPseudonym) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }

  validTimestamps.push(now);
  rateLimitMap.set(reporterPseudonym, validTimestamps);
  return true;
}

/**
 * Loads database from disk or initializes empty file
 */
function loadDb(): CircleDbData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        records: Array.isArray(parsed.records) ? parsed.records : [],
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      };
    }
  } catch (err) {
    console.error('Failed to load circleDb.json, initializing fresh store:', err);
  }

  const freshDb: CircleDbData = {
    records: [],
    auditLogs: [],
  };
  saveDb(freshDb);
  return freshDb;
}

/**
 * Saves database safely to disk
 */
function saveDb(data: CircleDbData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save circleDb.json:', err);
  }
}

/**
 * Pre-seeds 2 dummy reporters sharing fictional identifier (+923004819283 and @suspect_anon_29)
 * so that when the demo user opts in with the same number, distinct reporters reach exactly 3 live.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// IP rate limiting for contributions: 20 per hour per IP
const ipContributionsMap = new Map<string, number[]>();
const IP_CONTRIBUTION_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_CONTRIBUTIONS_PER_IP_PER_HOUR = 20;

export function checkIpContributionRateLimit(ip: string): boolean {
  if (!ip) return true;
  const now = Date.now();
  const timestamps = (ipContributionsMap.get(ip) || []).filter((t) => now - t < IP_CONTRIBUTION_WINDOW_MS);

  if (timestamps.length >= MAX_CONTRIBUTIONS_PER_IP_PER_HOUR) {
    return false;
  }

  timestamps.push(now);
  ipContributionsMap.set(ip, timestamps);
  return true;
}

/**
 * Pre-seeds 2 dummy reporters sharing fictional identifier (+923004819283 and @suspect_anon_29)
 * In demo mode, recreates circleDb.json on server start with only the 2 fictional seeded reporters (removing test records).
 */
export function seedDemoReporters(force = true): { seeded: boolean; dummyCount: number } {
  // Use valid UUIDs for demo reporters
  const dummy1 = '11111111-1111-4111-8111-111111111111';
  const dummy2 = '22222222-2222-4222-8222-222222222222';

  // Target demo fictional phone: +923004819283
  const demoPhoneNormalized = normalizePhone('+92 300 4819283');
  const demoPhoneHash = computeIdentifierHmac(demoPhoneNormalized);

  // Target demo handle: @suspect_anon_29
  const demoHandleNormalized = normalizeHandle('@suspect_anon_29');
  const demoHandleHash = computeIdentifierHmac(demoHandleNormalized);

  const cleanRecords: CircleRecord[] = [
    // Dummy 1: Contributed in Oct 2026
    {
      hash: demoPhoneHash,
      reporterPseudonym: dummy1,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-alpha',
      createdAt: new Date('2026-10-14T10:00:00Z').toISOString(),
    },
    {
      hash: demoHandleHash,
      reporterPseudonym: dummy1,
      category: 'cyber-stalking',
      month: '2026-10',
      caseId: 'dummy-case-alpha',
      createdAt: new Date('2026-10-18T12:00:00Z').toISOString(),
    },
    // Dummy 2: Contributed in Nov 2026
    {
      hash: demoPhoneHash,
      reporterPseudonym: dummy2,
      category: 'workplace/educational harassment',
      month: '2026-11',
      caseId: 'dummy-case-beta',
      createdAt: new Date('2026-11-01T15:30:00Z').toISOString(),
    },
    {
      hash: demoHandleHash,
      reporterPseudonym: dummy2,
      category: 'cyber-stalking',
      month: '2026-11',
      caseId: 'dummy-case-beta',
      createdAt: new Date('2026-11-02T16:00:00Z').toISOString(),
    },
  ];

  const db: CircleDbData = {
    records: cleanRecords,
    auditLogs: [
      {
        actor: 'system',
        action: 'PRESEED_DEMO_REPORTERS',
        time: new Date().toISOString(),
      },
    ],
  };

  saveDb(db);
  console.log('[Sakhi Circle] Recreated circleDb.json with only the 2 fictional seeded reporters for demo mode.');
  return { seeded: true, dummyCount: 2 };
}

// Auto-seed on server start if CIRCLE_SECRET is configured (recreating clean seeded store)
try {
  seedDemoReporters(true);
} catch (err: any) {
  console.warn('[Sakhi Circle] Notice:', err.message || err);
}

/**
 * Calculates distinct reporter pseudonyms for a given hash
 */
export function getDistinctReporterCountForHash(hash: string, records: CircleRecord[]): number {
  const pseudonyms = new Set<string>();
  for (const r of records) {
    if (r.hash === hash) {
      pseudonyms.add(r.reporterPseudonym);
    }
  }
  return pseudonyms.size;
}

/**
 * Contributes normalized identifiers.
 * The server computes HMAC-SHA256 immediately, stores ONLY the hash, and discards raw values.
 */
export function contributeIdentifiers(
  reporterPseudonym: string,
  identifiers: Array<{ type: 'phone' | 'handle' | 'location' | 'other'; value: string }>,
  category = 'harassment',
  caseId?: string
): {
  success: boolean;
  contributedCount: number;
  results: Array<{ hash: string; isPattern: boolean; count: number }>;
} {
  if (!reporterPseudonym || !UUID_REGEX.test(reporterPseudonym)) {
    throw new Error('Invalid reporter pseudonym: must be a valid UUID.');
  }

  if (!checkRateLimit(reporterPseudonym)) {
    throw new Error('Rate limit exceeded: too many Circle requests in a short period. Please try again later.');
  }

  const db = loadDb();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const nowIso = new Date().toISOString();
  let contributedCount = 0;
  const results: Array<{ hash: string; isPattern: boolean; count: number }> = [];

  for (const item of identifiers) {
    if (!item.value || item.value.trim().length === 0) continue;

    // 1. Normalize
    const normalized = normalizeIdentifier(item.type, item.value);
    if (!normalized) continue;

    // 2. Compute HMAC immediately
    const hash = computeIdentifierHmac(normalized);
    // Raw value is discarded here; never logged.

    // 3. Store only {hash, reporterPseudonym, category, month}
    const alreadyExists = db.records.some(
      (r) => r.hash === hash && r.reporterPseudonym === reporterPseudonym && (caseId ? r.caseId === caseId : true)
    );

    if (!alreadyExists) {
      db.records.push({
        hash,
        reporterPseudonym,
        category: category || 'harassment',
        month: currentMonth,
        caseId,
        createdAt: nowIso,
      });
      contributedCount++;
    }

    const distinctCount = getDistinctReporterCountForHash(hash, db.records);
    results.push({
      hash,
      isPattern: distinctCount >= 3,
      count: distinctCount,
    });
  }

  db.auditLogs.unshift({
    actor: 'reporter',
    action: 'CONTRIBUTE_HASH',
    time: nowIso,
  });

  saveDb(db);
  return { success: true, contributedCount, results };
}

/**
 * Reporter-facing status:
 * Only returns a count when threshold (>= 3) is reached.
 * Below threshold, returns "No match yet".
 * NEVER returns any other reporter's data, dates, notes, or raw values.
 */
export function getStatusForReporter(
  reporterPseudonym: string,
  hashes?: string[]
): Record<string, { status: 'match' | 'no_match'; count: number; message: string }> {
  const db = loadDb();
  const queryHashes = hashes && hashes.length > 0
    ? hashes
    : Array.from(new Set(db.records.filter((r) => r.reporterPseudonym === reporterPseudonym).map((r) => r.hash)));

  const response: Record<string, { status: 'match' | 'no_match'; count: number; message: string }> = {};

  for (const hash of queryHashes) {
    const distinctCount = getDistinctReporterCountForHash(hash, db.records);
    if (distinctCount >= 3) {
      response[hash] = {
        status: 'match',
        count: distinctCount,
        message: `Other independent reports match this identifier (${distinctCount} in total)`,
      };
    } else {
      response[hash] = {
        status: 'no_match',
        count: 0,
        message: 'No match yet',
      };
    }
  }

  return response;
}

/**
 * Withdraws all of this reporter's records for a given case
 */
export function withdrawReporterCase(reporterPseudonym: string, caseId?: string): { withdrawnCount: number } {
  if (!reporterPseudonym) return { withdrawnCount: 0 };
  const db = loadDb();
  const initialLength = db.records.length;

  db.records = db.records.filter((r) => {
    if (r.reporterPseudonym !== reporterPseudonym) return true;
    if (caseId && r.caseId !== caseId) return true;
    return false;
  });

  const withdrawnCount = initialLength - db.records.length;

  db.auditLogs.unshift({
    actor: 'reporter',
    action: 'WITHDRAW_RECORDS',
    time: new Date().toISOString(),
  });

  saveDb(db);
  return { withdrawnCount };
}

/**
 * Counselor view:
 * Shows patterns with short hash (first 6 chars), distinct reporter count,
 * first/last seen month, category.
 * Absolutely NO content, names, raw identifiers, or evidence.
 */
export function getCounselorPatterns(): Array<{
  shortHash: string;
  distinctReporterCount: number;
  firstSeenMonth: string;
  lastSeenMonth: string;
  category: string;
  isPattern: boolean;
}> {
  const db = loadDb();
  const map = new Map<string, CircleRecord[]>();

  for (const rec of db.records) {
    const list = map.get(rec.hash) || [];
    list.push(rec);
    map.set(rec.hash, list);
  }

  const patterns: Array<{
    shortHash: string;
    distinctReporterCount: number;
    firstSeenMonth: string;
    lastSeenMonth: string;
    category: string;
    isPattern: boolean;
  }> = [];

  for (const [hash, records] of map.entries()) {
    const distinctReporters = new Set(records.map((r) => r.reporterPseudonym));
    const count = distinctReporters.size;

    const months = records.map((r) => r.month).sort();
    const firstSeenMonth = months[0] || 'Unknown';
    const lastSeenMonth = months[months.length - 1] || 'Unknown';

    // Count categories and find dominant one
    const catCounts = new Map<string, number>();
    for (const r of records) {
      catCounts.set(r.category, (catCounts.get(r.category) || 0) + 1);
    }
    let topCat = 'harassment';
    let max = 0;
    for (const [c, cnt] of catCounts.entries()) {
      if (cnt > max) {
        max = cnt;
        topCat = c;
      }
    }

    patterns.push({
      shortHash: `#${hash.slice(0, 6)}`,
      distinctReporterCount: count,
      firstSeenMonth,
      lastSeenMonth,
      category: topCat,
      isPattern: count >= 3,
    });
  }

  // Sort: patterns with >= 3 first, then by count descending
  patterns.sort((a, b) => b.distinctReporterCount - a.distinctReporterCount);

  db.auditLogs.unshift({
    actor: 'counselor',
    action: 'VIEW_PATTERNS',
    time: new Date().toISOString(),
  });
  saveDb(db);

  return patterns;
}

/**
 * Returns audit logs with zero content
 */
export function getCounselorAuditLogs(): CircleAuditLog[] {
  const db = loadDb();
  return db.auditLogs.slice(0, 50);
}
