import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ override: true });

export interface CircleRecord {
  hash: string;
  type?: 'phone' | 'handle' | 'location' | 'other';
  reporterPseudonym: string;
  category: string;
  month: string; // YYYY-MM
  caseId?: string;
  createdAt: string;
}

export interface CircleAuditLog {
  actor: string;
  action: string;
  pairId?: string;
  time: string;
}

export interface CircleDbData {
  records: CircleRecord[];
  auditLogs: CircleAuditLog[];
  duplicateDecisions?: Record<string, 'merge' | 'keep'>;
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
    throw new Error('[Sakhi Circle] FATAL: CIRCLE_SECRET environment variable is missing or empty. Please set CIRCLE_SECRET in .env.');
  }
  return secret.trim();
}

// Fail immediately at startup if CIRCLE_SECRET is missing or empty
getCircleSecret();

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
        duplicateDecisions: parsed.duplicateDecisions && typeof parsed.duplicateDecisions === 'object'
          ? parsed.duplicateDecisions
          : {},
      };
    }
  } catch (err) {
    console.error('Failed to load circleDb.json, initializing fresh store:', err);
  }

  const freshDb: CircleDbData = {
    records: [],
    auditLogs: [],
    duplicateDecisions: {},
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
 * Pre-seeds fictional reports for demo mode:
 * - One pair legitimately scoring high (shared phone & handle, same category & month, different location tag)
 * - One pair scoring around 50 to 60 (shared phone, different handle, same category, adjacent month)
 * - One pair unrelated (< 50, hidden)
 */
export function seedDemoReporters(force = true): { seeded: boolean; dummyCount: number } {
  // Use valid UUIDs for demo reporters
  const dummy1 = '11111111-1111-4111-8111-111111111111';
  const dummy2 = '22222222-2222-4222-8222-222222222222';
  const dummy3 = '33333333-3333-4333-8333-333333333333';
  const dummy4 = '44444444-4444-4444-8444-444444444444';

  // Target demo fictional phone: +923004819283
  const demoPhoneNormalized = normalizePhone('+92 300 4819283');
  const demoPhoneHash = computeIdentifierHmac(demoPhoneNormalized);

  // Target demo handle: @suspect_anon_29
  const demoHandleNormalized = normalizeHandle('@suspect_anon_29');
  const demoHandleHash = computeIdentifierHmac(demoHandleNormalized);

  // Fictional location tags
  const demoLocANormalized = normalizeGenericIdentifier('lahore-gulberg');
  const demoLocationAHash = computeIdentifierHmac(demoLocANormalized);

  const demoLocBNormalized = normalizeGenericIdentifier('rawalpindi-cantt');
  const demoLocationBHash = computeIdentifierHmac(demoLocBNormalized);

  // Secondary handle for dummy3
  const demoHandleCNormalized = normalizeHandle('@suspect_secondary_88');
  const demoHandleCHash = computeIdentifierHmac(demoHandleCNormalized);

  // Unrelated identifiers for dummy4
  const unrelatedPhoneNormalized = normalizePhone('+92 321 0000000');
  const unrelatedPhoneHash = computeIdentifierHmac(unrelatedPhoneNormalized);

  const unrelatedHandleNormalized = normalizeHandle('@unrelated_random_acc');
  const unrelatedHandleHash = computeIdentifierHmac(unrelatedHandleNormalized);

  const cleanRecords: CircleRecord[] = [
    // Report 1: Dummy 1 (case-alpha) - Oct 2026, blackmail/extortion
    {
      hash: demoPhoneHash,
      type: 'phone',
      reporterPseudonym: dummy1,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-alpha',
      createdAt: new Date('2026-10-14T10:00:00Z').toISOString(),
    },
    {
      hash: demoHandleHash,
      type: 'handle',
      reporterPseudonym: dummy1,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-alpha',
      createdAt: new Date('2026-10-14T10:00:00Z').toISOString(),
    },
    {
      hash: demoLocationAHash,
      type: 'location',
      reporterPseudonym: dummy1,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-alpha',
      createdAt: new Date('2026-10-14T10:00:00Z').toISOString(),
    },

    // Report 2: Dummy 2 (case-beta) - Oct 2026, blackmail/extortion
    // High match with Report 1: shared phone & handle, same category & month, different location tag
    // Matched: 40 + 30 + 0 + 10 + 5 = 85 / 100 => 85% ("Very likely the same")
    {
      hash: demoPhoneHash,
      type: 'phone',
      reporterPseudonym: dummy2,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-beta',
      createdAt: new Date('2026-10-18T12:00:00Z').toISOString(),
    },
    {
      hash: demoHandleHash,
      type: 'handle',
      reporterPseudonym: dummy2,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-beta',
      createdAt: new Date('2026-10-18T12:00:00Z').toISOString(),
    },
    {
      hash: demoLocationBHash,
      type: 'location',
      reporterPseudonym: dummy2,
      category: 'blackmail/extortion',
      month: '2026-10',
      caseId: 'dummy-case-beta',
      createdAt: new Date('2026-10-18T12:00:00Z').toISOString(),
    },

    // Report 3: Dummy 3 (case-gamma) - Nov 2026 (adjacent month), blackmail/extortion
    // Scores around 50 to 60 with Report 1:
    // Shared phone (40/40), diff handle (0/30), location in report 1/2 only (0/15), same cat (10/10), adjacent month (2/5)
    // Matched: 40 + 0 + 0 + 10 + 2 = 52 / 100 => 52% ("Possibly related")
    {
      hash: demoPhoneHash,
      type: 'phone',
      reporterPseudonym: dummy3,
      category: 'blackmail/extortion',
      month: '2026-11',
      caseId: 'dummy-case-gamma',
      createdAt: new Date('2026-11-01T15:30:00Z').toISOString(),
    },
    {
      hash: demoHandleCHash,
      type: 'handle',
      reporterPseudonym: dummy3,
      category: 'blackmail/extortion',
      month: '2026-11',
      caseId: 'dummy-case-gamma',
      createdAt: new Date('2026-11-01T15:30:00Z').toISOString(),
    },

    // Report 4: Dummy 4 (case-delta) - Apr 2026, workplace/educational harassment
    // Completely unrelated: score < 50 (hidden from view)
    {
      hash: unrelatedPhoneHash,
      type: 'phone',
      reporterPseudonym: dummy4,
      category: 'workplace/educational harassment',
      month: '2026-04',
      caseId: 'dummy-case-delta',
      createdAt: new Date('2026-04-10T09:00:00Z').toISOString(),
    },
    {
      hash: unrelatedHandleHash,
      type: 'handle',
      reporterPseudonym: dummy4,
      category: 'workplace/educational harassment',
      month: '2026-04',
      caseId: 'dummy-case-delta',
      createdAt: new Date('2026-04-10T09:00:00Z').toISOString(),
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
    duplicateDecisions: {},
  };

  saveDb(db);
  console.log('[Sakhi Circle] Recreated circleDb.json with fictional seeded reporters for demo mode.');
  return { seeded: true, dummyCount: 4 };
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
        type: item.type,
        reporterPseudonym,
        category: category || 'harassment',
        month: currentMonth,
        caseId: caseId || 'case-default',
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
 * first/last seen month, category, and linked reports cluster summary.
 * Absolutely NO content, names, raw identifiers, or evidence.
 */
export function getCounselorPatterns(): Array<{
  shortHash: string;
  distinctReporterCount: number;
  firstSeenMonth: string;
  lastSeenMonth: string;
  category: string;
  isPattern: boolean;
  linkedReports?: string;
}> {
  const db = loadDb();
  const map = new Map<string, CircleRecord[]>();

  for (const rec of db.records) {
    const list = map.get(rec.hash) || [];
    list.push(rec);
    map.set(rec.hash, list);
  }

  // Pre-calculate clusters of merged reports
  const reports = buildReportsFromRecords(db.records);
  const reportClusters = getMergedReportClusters(db, reports);

  const patterns: Array<{
    shortHash: string;
    distinctReporterCount: number;
    firstSeenMonth: string;
    lastSeenMonth: string;
    category: string;
    isPattern: boolean;
    linkedReports?: string;
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

    // Check if any record in this pattern belongs to a merged cluster
    let linkedReportsStr: string | undefined = undefined;
    for (const r of records) {
      const repKey = `${r.reporterPseudonym}::${r.caseId || 'case-default'}`;
      const clusterInfo = reportClusters.get(repKey);
      if (clusterInfo && clusterInfo.reportCount >= 2) {
        linkedReportsStr = `Linked reports (${clusterInfo.reportCount} reports from ${clusterInfo.distinctReporterCount} distinct reporters)`;
        break;
      }
    }

    patterns.push({
      shortHash: `#${hash.slice(0, 6)}`,
      distinctReporterCount: count,
      firstSeenMonth,
      lastSeenMonth,
      category: topCat,
      isPattern: count >= 3,
      linkedReports: linkedReportsStr,
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

// ==========================================
// Cross-Report Duplicate Detector Engine
// ==========================================

export const REPORT_SIMILARITY_WEIGHTS = {
  phone: 40,
  handle: 30,
  location: 15,
  category: 10,
  monthSame: 5,
  monthAdjacent: 2,
} as const;

export interface ReportItem {
  reportId: string;
  reporterPseudonym: string;
  caseId: string;
  shortId: string;
  month: string;
  category: string;
  phoneHashes: Set<string>;
  handleHashes: Set<string>;
  locationHashes: Set<string>;
  otherHashes: Set<string>;
}

export function areMonthsAdjacent(m1: string, m2: string): boolean {
  if (!m1 || !m2) return false;
  const p1 = m1.split('-').map(Number);
  const p2 = m2.split('-').map(Number);
  if (p1.length < 2 || p2.length < 2 || isNaN(p1[0]) || isNaN(p1[1]) || isNaN(p2[0]) || isNaN(p2[1])) {
    return false;
  }
  const monthsDiff = Math.abs((p1[0] * 12 + p1[1]) - (p2[0] * 12 + p2[1]));
  return monthsDiff === 1;
}

export function buildReportsFromRecords(records: CircleRecord[]): ReportItem[] {
  const map = new Map<string, ReportItem>();

  for (const r of records) {
    const caseId = r.caseId || 'case-default';
    const key = `${r.reporterPseudonym}::${caseId}`;

    if (!map.has(key)) {
      const shortId = crypto
        .createHash('sha256')
        .update(r.reporterPseudonym + ':' + caseId)
        .digest('hex')
        .slice(0, 6);

      map.set(key, {
        reportId: key,
        reporterPseudonym: r.reporterPseudonym,
        caseId,
        shortId,
        month: r.month,
        category: r.category,
        phoneHashes: new Set<string>(),
        handleHashes: new Set<string>(),
        locationHashes: new Set<string>(),
        otherHashes: new Set<string>(),
      });
    }

    const report = map.get(key)!;
    if (r.type === 'phone') {
      report.phoneHashes.add(r.hash);
    } else if (r.type === 'handle') {
      report.handleHashes.add(r.hash);
    } else if (r.type === 'location') {
      report.locationHashes.add(r.hash);
    } else {
      report.otherHashes.add(r.hash);
    }
  }

  return Array.from(map.values());
}

export function computeReportPairSimilarity(
  reportA: ReportItem,
  reportB: ReportItem
): { score: number; label: 'Very likely the same' | 'Possibly related'; reasons: string[] } | null {
  const weights = REPORT_SIMILARITY_WEIGHTS;
  let possibleWeight = 0;
  let matchedWeight = 0;
  const reasons: string[] = [];

  // 1. Phone match
  const hasPhone = reportA.phoneHashes.size > 0 || reportB.phoneHashes.size > 0;
  if (hasPhone) {
    possibleWeight += weights.phone;
    let phoneMatched = false;
    for (const h of reportA.phoneHashes) {
      if (reportB.phoneHashes.has(h)) {
        phoneMatched = true;
        break;
      }
    }
    if (phoneMatched) {
      matchedWeight += weights.phone;
      reasons.push('Same phone number code (hashed)');
    } else if (reportA.phoneHashes.size > 0 && reportB.phoneHashes.size > 0) {
      reasons.push('Phone number code differs');
    } else {
      reasons.push('Phone number code only in one report');
    }
  }

  // 2. Handle match
  const hasHandle = reportA.handleHashes.size > 0 || reportB.handleHashes.size > 0;
  if (hasHandle) {
    possibleWeight += weights.handle;
    let handleMatched = false;
    for (const h of reportA.handleHashes) {
      if (reportB.handleHashes.has(h)) {
        handleMatched = true;
        break;
      }
    }
    if (handleMatched) {
      matchedWeight += weights.handle;
      reasons.push('Same social handle code (hashed)');
    } else if (reportA.handleHashes.size > 0 && reportB.handleHashes.size > 0) {
      reasons.push('Social handle code differs');
    } else {
      reasons.push('Social handle code only in one report');
    }
  }

  // 3. Location match
  const hasLocation = reportA.locationHashes.size > 0 || reportB.locationHashes.size > 0;
  if (hasLocation) {
    possibleWeight += weights.location;
    let locationMatched = false;
    for (const h of reportA.locationHashes) {
      if (reportB.locationHashes.has(h)) {
        locationMatched = true;
        break;
      }
    }
    if (locationMatched) {
      matchedWeight += weights.location;
      reasons.push('Same location tag (hashed)');
    } else if (reportA.locationHashes.size > 0 && reportB.locationHashes.size > 0) {
      reasons.push('Location tag differs');
    } else {
      reasons.push('Location tag only in one report');
    }
  }

  // 4. Same category
  possibleWeight += weights.category;
  if (reportA.category && reportB.category && reportA.category === reportB.category) {
    matchedWeight += weights.category;
    reasons.push('Same category');
  } else {
    reasons.push('Different category');
  }

  // 5. Month match
  possibleWeight += weights.monthSame;
  if (reportA.month && reportB.month && reportA.month === reportB.month) {
    matchedWeight += weights.monthSame;
    reasons.push('Same month');
  } else if (areMonthsAdjacent(reportA.month, reportB.month)) {
    matchedWeight += weights.monthAdjacent;
    reasons.push('Adjacent month');
  } else {
    reasons.push('Different month');
  }

  const score = possibleWeight > 0 ? Math.round((100 * matchedWeight) / possibleWeight) : 0;

  // Below 50 not shown
  if (score < 50) return null;

  const label = score >= 80 ? 'Very likely the same' : 'Possibly related';
  return { score, label, reasons };
}

export function computeReportPairId(reportIdA: string, reportIdB: string): string {
  const [first, second] = [reportIdA, reportIdB].sort();
  return 'pair_' + crypto.createHash('sha256').update(first + '::' + second).digest('hex').slice(0, 12);
}

export function getCounselorDuplicates(): Array<{
  pairId: string;
  score: number;
  label: 'Very likely the same' | 'Possibly related';
  reasons: string[];
  reportA: { shortId: string; month: string; category: string };
  reportB: { shortId: string; month: string; category: string };
  decision: 'merge' | 'keep' | null;
}> {
  const db = loadDb();
  const reports = buildReportsFromRecords(db.records);
  const duplicates: Array<{
    pairId: string;
    score: number;
    label: 'Very likely the same' | 'Possibly related';
    reasons: string[];
    reportA: { shortId: string; month: string; category: string };
    reportB: { shortId: string; month: string; category: string };
    decision: 'merge' | 'keep' | null;
  }> = [];

  const decisions = db.duplicateDecisions || {};

  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const repA = reports[i];
      const repB = reports[j];

      const sim = computeReportPairSimilarity(repA, repB);
      if (!sim) continue;

      const pairId = computeReportPairId(repA.reportId, repB.reportId);
      const decision = decisions[pairId] || null;

      duplicates.push({
        pairId,
        score: sim.score,
        label: sim.label,
        reasons: sim.reasons,
        reportA: {
          shortId: repA.shortId,
          month: repA.month,
          category: repA.category,
        },
        reportB: {
          shortId: repB.shortId,
          month: repB.month,
          category: repB.category,
        },
        decision,
      });
    }
  }

  // Sorted by score descending
  duplicates.sort((a, b) => b.score - a.score);
  return duplicates;
}

export function saveDuplicateDecision(pairId: string, decision: 'merge' | 'keep'): void {
  const db = loadDb();
  if (!db.duplicateDecisions) {
    db.duplicateDecisions = {};
  }
  db.duplicateDecisions[pairId] = decision;

  db.auditLogs.unshift({
    actor: 'counselor',
    action: decision === 'merge' ? 'DUPLICATE_MERGE' : 'DUPLICATE_KEEP',
    pairId,
    time: new Date().toISOString(),
  });

  saveDb(db);
}

export function undoDuplicateDecision(pairId: string): void {
  const db = loadDb();
  if (db.duplicateDecisions && db.duplicateDecisions[pairId]) {
    delete db.duplicateDecisions[pairId];

    db.auditLogs.unshift({
      actor: 'counselor',
      action: 'DUPLICATE_UNDO',
      pairId,
      time: new Date().toISOString(),
    });

    saveDb(db);
  }
}

/**
 * Computes clusters of merged reports for the pattern view
 */
export function getMergedReportClusters(
  db: CircleDbData,
  reports: ReportItem[]
): Map<string, { reportCount: number; distinctReporterCount: number }> {
  const decisions = db.duplicateDecisions || {};
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }

  function union(x: string, y: string) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent.set(rootX, rootY);
    }
  }

  // Initialize all reports as their own parent
  reports.forEach((r) => find(r.reportId));

  // Connect merged reports
  for (let i = 0; i < reports.length; i++) {
    for (let j = i + 1; j < reports.length; j++) {
      const pairId = computeReportPairId(reports[i].reportId, reports[j].reportId);
      if (decisions[pairId] === 'merge') {
        union(reports[i].reportId, reports[j].reportId);
      }
    }
  }

  // Group by root
  const groups = new Map<string, ReportItem[]>();
  for (const r of reports) {
    const root = find(r.reportId);
    const list = groups.get(root) || [];
    list.push(r);
    groups.set(root, list);
  }

  // Map each reportId to cluster stats
  const result = new Map<string, { reportCount: number; distinctReporterCount: number }>();
  for (const list of groups.values()) {
    if (list.length >= 2) {
      const distinctReporters = new Set(list.map((r) => r.reporterPseudonym)).size;
      const stats = {
        reportCount: list.length,
        distinctReporterCount: distinctReporters,
      };
      for (const r of list) {
        result.set(r.reportId, stats);
      }
    }
  }

  return result;
}
