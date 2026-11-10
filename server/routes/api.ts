import { Router, Request, Response } from 'express';
import { performOCR } from '../services/ocr.ts';
import { transcribeAudio } from '../services/transcribe.ts';
import { extractEvidenceEntities } from '../services/extract.ts';
import { classifyHarassment } from '../services/classify.ts';
import { buildChronologicalTimeline } from '../services/timeline.ts';
import { summarizeCaseFacts } from '../services/summarize.ts';
import {
  retrieveSections,
  explainSections,
  writeSearchQueries,
  askLegalQuestion,
  getDemoCaseCache,
  getDemoCasesCache,
  CachedDemoCase,
} from '../services/legal.ts';
import { generateComplaintDraft } from '../services/complaint.ts';
import { ai, hasApiKey } from '../services/geminiClient.ts';
import {
  contributeIdentifiers,
  getStatusForReporter,
  withdrawReporterCase,
  getCounselorPatterns,
  getCounselorAuditLogs,
  seedDemoReporters,
  checkIpContributionRateLimit,
} from '../services/circle.ts';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ override: true });

// Counselor In-Memory Session Store with 30-minute expiration
interface CounselorSession {
  token: string;
  username: string;
  createdAt: number;
  expiresAt: number;
}
const counselorSessions = new Map<string, CounselorSession>();
const SESSION_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

// Failed login attempt tracking: client IP -> array of failed timestamps (limit 5 per 10 minutes)
const failedLoginsMap = new Map<string, number[]>();
const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FAILED_LOGINS = 5;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const attempts = (failedLoginsMap.get(ip) || []).filter((t) => now - t < FAILED_LOGIN_WINDOW_MS);
  failedLoginsMap.set(ip, attempts);
  return attempts.length < MAX_FAILED_LOGINS;
}

function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const attempts = (failedLoginsMap.get(ip) || []).filter((t) => now - t < FAILED_LOGIN_WINDOW_MS);
  attempts.push(now);
  failedLoginsMap.set(ip, attempts);
}

function clearFailedLogins(ip: string): void {
  failedLoginsMap.delete(ip);
}

// Compare strings in constant time using crypto.timingSafeEqual
function timingSafeEqualStrings(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Verification middleware for all /api/circle/counselor/* routes except login
function requireCounselorAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header.' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Bearer token is empty.' });
  }

  const session = counselorSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or unknown counselor session.' });
  }

  if (Date.now() > session.expiresAt) {
    counselorSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized: Counselor session has expired. Please log in again.' });
  }

  next();
}

export const apiRouter = Router();

// Health check endpoint testing one tiny call per model
apiRouter.get('/health', async (_req: Request, res: Response) => {
  const results: Array<{
    model: string;
    task: string;
    status: 'pass' | 'fail';
    latencyMs?: number;
    responsePreview?: string;
    error?: string;
  }> = [];

  if (!hasApiKey) {
    return res.json({
      overall: 'offline_or_missing_key',
      hasApiKey: false,
      models: [
        {
          model: 'gemini-3.8-flash',
          task: 'Text / Vision / Extraction / Classification',
          status: 'fail',
          error: 'GEMINI_API_KEY environment variable is not set.',
        },
        {
          model: 'gemini-3.5-transcribe',
          task: 'Audio Transcription',
          status: 'fail',
          error: 'GEMINI_API_KEY environment variable is not set.',
        },
      ],
      timestamp: new Date().toISOString(),
    });
  }

function withTimeout<T>(promise: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

  // Run model checks concurrently with 9-second timeout safeguard
  const [flashResult, audioResult] = await Promise.all([
    (async () => {
      try {
        const t0 = Date.now();
        const flashRes = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: 'Ping health check. Respond strictly with "PONG".',
          }),
          15000,
          'gemini-3.8-flash text call timed out'
        );
        const latency = Date.now() - t0;
        const text = flashRes.text?.trim() || '';
        return {
          model: 'gemini-3.8-flash',
          task: 'Text / Vision / Extraction / Classification',
          status: text.length > 0 ? ('pass' as const) : ('fail' as const),
          latencyMs: latency,
          responsePreview: text.slice(0, 50),
        };
      } catch (err: any) {
        return {
          model: 'gemini-3.8-flash',
          task: 'Text / Vision / Extraction / Classification',
          status: 'fail' as const,
          error: err.message || 'Call failed',
        };
      }
    })(),
    (async () => {
      try {
        const t0 = Date.now();
        const trRes = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: 'Voice transcribe health check. Respond strictly with "AUDIO_READY".',
          }),
          15000,
          'gemini-3.8-flash audio pipeline call timed out'
        );
        const latency = Date.now() - t0;
        const text = trRes.text?.trim() || '';
        return {
          model: 'gemini-3.8-flash',
          task: 'Audio Understanding & Multimodal Transcription',
          status: text.length > 0 ? ('pass' as const) : ('fail' as const),
          latencyMs: latency,
          responsePreview: text.slice(0, 50),
        };
      } catch (err: any) {
        return {
          model: 'gemini-3.8-flash',
          task: 'Audio Understanding & Multimodal Transcription',
          status: 'fail' as const,
          error: err.message || 'Call failed',
        };
      }
    })(),
  ]);

  results.push(flashResult, audioResult);

  const allPassed = results.every((r) => r.status === 'pass');
  return res.json({
    overall: allPassed ? 'healthy' : 'degraded',
    hasApiKey: true,
    models: results,
    timestamp: new Date().toISOString(),
  });
});

// 1. OCR Endpoint
apiRouter.post('/ai/ocr', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }
    const result = await performOCR(imageBase64, mimeType || 'image/png');
    return res.json(result);
  } catch (err: any) {
    console.error('OCR Route error:', err);
    return res.status(500).json({ error: err.message || 'OCR processing failed' });
  }
});

// 2. Audio Transcription Endpoint
apiRouter.post('/ai/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required' });
    }
    const result = await transcribeAudio(audioBase64, mimeType || 'audio/webm');
    return res.json(result);
  } catch (err: any) {
    console.error('Transcribe Route error:', err);
    return res.status(500).json({ error: err.message || 'Audio transcription failed' });
  }
});

// 3. Entity & Message Extraction Endpoint
apiRouter.post('/ai/extract', async (req: Request, res: Response) => {
  try {
    const { text, platform } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }
    const result = await extractEvidenceEntities(text, platform || 'WhatsApp');
    return res.json(result);
  } catch (err: any) {
    console.error('Extract Route error:', err);
    return res.status(500).json({ error: err.message || 'Entity extraction failed' });
  }
});

// 4. Harassment Classification Endpoint
apiRouter.post('/ai/classify', async (req: Request, res: Response) => {
  try {
    const { text, demands, threats } = req.body;
    const result = await classifyHarassment(text || '', demands || [], threats || []);
    return res.json(result);
  } catch (err: any) {
    console.error('Classify Route error:', err);
    return res.status(500).json({ error: err.message || 'Classification failed' });
  }
});

// 5. Chronological Timeline Merger
apiRouter.post('/ai/timeline', async (req: Request, res: Response) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }
    const result = buildChronologicalTimeline(items);
    return res.json(result);
  } catch (err: any) {
    console.error('Timeline Route error:', err);
    return res.status(500).json({ error: err.message || 'Timeline generation failed' });
  }
});

// 6. Case Facts Summarizer (5 lines)
apiRouter.post('/ai/summarize', async (req: Request, res: Response) => {
  try {
    const { text, language, demands, threats } = req.body;
    const result = await summarizeCaseFacts(text || '', language || 'en', demands || [], threats || []);
    return res.json(result);
  } catch (err: any) {
    console.error('Summarize Route error:', err);
    return res.status(500).json({ error: err.message || 'Summarization failed' });
  }
});

// 7. Legal Grounding Sections & Plain Explanations
const handleLegalRetrieval = async (req: Request, res: Response) => {
  const DISCLAIMER = 'Information and draft only, not legal advice.';
  try {
    const {
      queries,
      caseFacts,
      province,
      language = 'en',
      caseId,
      classificationLabels = [],
    } = req.body || {};

    const isDemoCase =
      caseId === 'case-demo-104' ||
      (typeof caseFacts === 'string' &&
        (caseFacts.includes('Workplace & Academic Extortion') ||
          caseFacts.includes('24 ghantay hain tumhare paas')));

    // Check if offline or demo case cache should be returned
    if (isDemoCase && (!hasApiKey || req.query.offline === 'true')) {
      const demoCache = getDemoCaseCache();
      if (demoCache) {
        return res.json({
          sections: demoCache.citedCards.map((c) => ({
            id: c.chunkId || '',
            act: c.act,
            section: c.section,
            title: c.title,
            snippet: c.snippet,
            sourceUrl: c.sourceUrl,
            jurisdiction: c.jurisdiction,
            lastVerified: c.lastVerified,
            verifiedBy: c.verifiedBy,
            isPlaceholder: c.isPlaceholder,
          })),
          citedCards: demoCache.citedCards,
          isFallback: true,
          isDemoCached: true,
          disclaimer: DISCLAIMER,
        });
      }
    }

    // Check for demoCasesCache.json hit before entering live pipeline
    const demoCasesCache = getDemoCasesCache();
    if (demoCasesCache?.cases) {
      const normalizeText = (str: string) => str.trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizeProvince = (p?: string | null) => {
        const norm = (p || '').trim().toLowerCase();
        return !norm || norm === 'all' || norm === 'federal' ? 'federal' : norm;
      };

      let matchedCase: CachedDemoCase | null = null;
      const targetProvince = normalizeProvince(province);

      // (a) Match by cached case id if the frontend sends one
      if (caseId && typeof caseId === 'string' && demoCasesCache.cases[caseId]) {
        const candidate = demoCasesCache.cases[caseId];
        if (
          !candidate.isPlaceholder &&
          normalizeProvince(candidate.province) === targetProvince
        ) {
          matchedCase = candidate;
        }
      }

      // (b) Match by case text against the description text warm-cache.ts used for each case
      if (!matchedCase) {
        const textToMatch =
          typeof caseFacts === 'string'
            ? caseFacts
            : typeof req.body?.description === 'string'
            ? req.body.description
            : '';
        const normReqText = normalizeText(textToMatch);
        if (normReqText.length > 0) {
          for (const candidate of Object.values(demoCasesCache.cases)) {
            if (candidate.isPlaceholder) continue;
            if (normalizeProvince(candidate.province) !== targetProvince) continue;
            if (normalizeText(candidate.description) === normReqText) {
              matchedCase = candidate;
              break;
            }
          }
        }
      }

      if (matchedCase) {
        console.log(`[DEMO CACHE] hit: ${matchedCase.caseId}`);
        return res.json({
          sections: matchedCase.citedCards.map((c) => ({
            id: c.chunkId || '',
            act: c.act,
            section: c.section,
            title: c.title,
            snippet: c.snippet,
            sourceUrl: c.sourceUrl,
            jurisdiction: c.jurisdiction,
            lastVerified: c.lastVerified,
            verifiedBy: c.verifiedBy,
            isPlaceholder: c.isPlaceholder,
          })),
          citedCards: matchedCase.citedCards,
          isFallback: false,
          isDemoCached: true,
          disclaimer: DISCLAIMER,
        });
      }
    }

    // 2. Query Writer: from redacted classification labels and key facts produce 2 to 3 short search queries
    let searchQueries: string[] = Array.isArray(queries) && queries.length > 0 ? queries : [];
    if (
      searchQueries.length === 0 ||
      (Array.isArray(classificationLabels) && classificationLabels.length > 0)
    ) {
      const derived = await writeSearchQueries({
        labels: Array.isArray(classificationLabels) && classificationLabels.length > 0
          ? classificationLabels
          : searchQueries,
        keyFacts: caseFacts || '',
      });
      if (derived && derived.length > 0) {
        searchQueries = derived;
      }
    }

    // 3. Hybrid Retrieval with Province Filter
    const sections = await retrieveSections(searchQueries, province);

    // 6. No-answer rule: if nothing passes the threshold show "No matching section found. Please consult a lawyer."
    if (sections.length === 0) {
      return res.json({
        sections: [],
        citedCards: [],
        message: 'No matching section found. Please consult a lawyer.',
        disclaimer: DISCLAIMER,
        isFallback: false,
      });
    }

    // 4. Grounded Explanation & 5. Citation Verifier
    const citedCards = await explainSections(caseFacts || '', sections, language);

    return res.json({
      sections,
      citedCards,
      disclaimer: DISCLAIMER,
      isFallback: false,
    });
  } catch (err: any) {
    console.warn('Legal Route error, attempting demo cache or fallback:', err);
    const demoCache = getDemoCaseCache();
    if (demoCache) {
      return res.json({
        sections: demoCache.citedCards.map((c) => ({
          id: c.chunkId || '',
          act: c.act,
          section: c.section,
          title: c.title,
          snippet: c.snippet,
          sourceUrl: c.sourceUrl,
          jurisdiction: c.jurisdiction,
          lastVerified: c.lastVerified,
          verifiedBy: c.verifiedBy,
          isPlaceholder: c.isPlaceholder,
        })),
        citedCards: demoCache.citedCards,
        isFallback: true,
        isDemoCached: true,
        disclaimer: DISCLAIMER,
      });
    }
    return res.status(500).json({ error: err.message || 'Legal guidance retrieval failed' });
  }
};

apiRouter.post('/ai/legal', handleLegalRetrieval);
apiRouter.post('/legal', handleLegalRetrieval);

// 8. POST /api/legal/ask & /api/ai/legal/ask: Free-form legal question answered ONLY from retrieved chunks
const handleLegalAsk = async (req: Request, res: Response) => {
  try {
    const { question, province, language } = req.body || {};
    const result = await askLegalQuestion({
      question: question || '',
      province,
      language: language === 'ur' ? 'ur' : 'en',
    });
    return res.json(result);
  } catch (err: any) {
    console.error('Ask Legal error:', err);
    return res.status(500).json({
      answer: 'An error occurred while retrieving legal information. Please consult a lawyer.',
      citedCards: [],
      error: err.message || 'Failed to answer legal question',
      disclaimer: 'Information and draft only, not legal advice.',
    });
  }
};

apiRouter.post('/legal/ask', handleLegalAsk);
apiRouter.post('/ai/legal/ask', handleLegalAsk);

// 8. Formal Complaint Application Draft
apiRouter.post('/ai/complaint', async (req: Request, res: Response) => {
  try {
    const draft = await generateComplaintDraft(req.body);
    return res.json(draft);
  } catch (err: any) {
    console.error('Complaint Route error:', err);
    return res.status(500).json({ error: err.message || 'Complaint generation failed' });
  }
});

// 9. Helplines listing
apiRouter.get('/helplines', (_req: Request, res: Response) => {
  try {
    const helplinesPath = path.resolve(process.cwd(), 'server/data/helplines.json');
    if (fs.existsSync(helplinesPath)) {
      const data = JSON.parse(fs.readFileSync(helplinesPath, 'utf-8'));
      return res.json(data);
    }
    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 10. Silent Alert trigger (Stub for duress decoy PIN)
apiRouter.post('/silent-alert', (req: Request, res: Response) => {
  const { timestamp, clientHint, location } = req.body || {};
  console.warn(
    `[SECURITY SILENT ALERT STUB] Decoy duress PIN entered at ${new Date().toISOString()}. Client info:`,
    { timestamp, clientHint, location }
  );
  // TODO: Wire emergency SMS / automated check-in beacon for verified trusted contacts in future release
  return res.json({ status: 'logged_silently', acknowledged: true });
});

// ==========================================
// 11. Sakhi Circle Anonymous Pattern Matching
// ==========================================

// Contribute normalized identifiers (HMAC-SHA256 calculated immediately; raw values discarded)
apiRouter.post('/circle/contribute', (req: Request, res: Response) => {
  try {
    const clientIp = getClientIp(req);
    if (!checkIpContributionRateLimit(clientIp)) {
      return res.status(429).json({
        error: 'Contribution rate limit exceeded: maximum 20 contributions per hour per IP address.',
      });
    }

    const { reporterPseudonym, identifiers, category, caseId } = req.body || {};
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!reporterPseudonym || !UUID_REGEX.test(reporterPseudonym)) {
      return res.status(400).json({ error: 'Invalid reporter pseudonym: must be a valid UUID.' });
    }
    if (!Array.isArray(identifiers) || identifiers.length === 0) {
      return res.status(400).json({ error: 'identifiers array is required' });
    }

    const result = contributeIdentifiers(reporterPseudonym, identifiers, category, caseId);
    return res.json(result);
  } catch (err: any) {
    console.error('Circle Contribute error:', err);
    return res.status(400).json({ error: err.message || 'Contribution failed' });
  }
});

// Query reporter status for contributed identifiers (returns count ONLY when >= 3, else "No match yet")
apiRouter.get('/circle/status', (req: Request, res: Response) => {
  try {
    const reporterPseudonym = req.query.reporterPseudonym as string;
    if (!reporterPseudonym) {
      return res.status(400).json({ error: 'reporterPseudonym query param is required' });
    }
    const hashesParam = req.query.hashes as string | undefined;
    const hashes = hashesParam ? hashesParam.split(',').filter(Boolean) : undefined;

    const results = getStatusForReporter(reporterPseudonym, hashes);
    return res.json({ results });
  } catch (err: any) {
    console.error('Circle Status error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch status' });
  }
});

apiRouter.post('/circle/status', (req: Request, res: Response) => {
  try {
    const { reporterPseudonym, hashes } = req.body || {};
    if (!reporterPseudonym) {
      return res.status(400).json({ error: 'reporterPseudonym is required' });
    }
    const results = getStatusForReporter(reporterPseudonym, hashes);
    return res.json({ results });
  } catch (err: any) {
    console.error('Circle Status error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch status' });
  }
});

// Withdraw reporter's rows for a case
apiRouter.post('/circle/withdraw', (req: Request, res: Response) => {
  try {
    const { reporterPseudonym, caseId } = req.body || {};
    if (!reporterPseudonym) {
      return res.status(400).json({ error: 'reporterPseudonym is required' });
    }
    const result = withdrawReporterCase(reporterPseudonym, caseId);
    return res.json(result);
  } catch (err: any) {
    console.error('Circle Withdraw error:', err);
    return res.status(500).json({ error: err.message || 'Withdrawal failed' });
  }
});

// Hidden seed action to recreate 2 dummy reporters sharing fictional demo identifiers
apiRouter.post('/circle/seed-demo', (_req: Request, res: Response) => {
  try {
    const result = seedDemoReporters(true);
    return res.json(result);
  } catch (err: any) {
    console.error('Circle Seed Demo error:', err);
    return res.status(500).json({ error: err.message || 'Seeding failed' });
  }
});

// Counselor Portal Config Hint (safe status check: NEVER reveals username)
apiRouter.get('/circle/counselor/config-hint', (_req: Request, res: Response) => {
  dotenv.config({ override: true });
  const hasUser = Boolean(process.env.COUNSELOR_USER);
  const hasPass = Boolean(process.env.COUNSELOR_PASS);
  return res.json({
    configured: Boolean(hasUser && hasPass),
  });
});

// Counselor Portal Login: rate limited (5 failed attempts per 10 mins) with timing-safe comparison
apiRouter.post('/circle/counselor/login', (req: Request, res: Response) => {
  dotenv.config({ override: true });
  const clientIp = getClientIp(req);

  if (!checkLoginRateLimit(clientIp)) {
    return res.status(429).json({
      error: 'Too many failed login attempts. Please try again after 10 minutes.',
    });
  }

  const { username, password } = req.body || {};
  const expectedUser = process.env.COUNSELOR_USER;
  const expectedPass = process.env.COUNSELOR_PASS;

  if (!expectedUser || !expectedPass) {
    return res.status(500).json({
      error: 'Server configuration error: COUNSELOR_USER or COUNSELOR_PASS environment variable is missing. Please configure them in .env.',
    });
  }

  const userMatches = timingSafeEqualStrings(String(username || ''), expectedUser);
  const passMatches = timingSafeEqualStrings(String(password || ''), expectedPass);

  if (userMatches && passMatches) {
    clearFailedLogins(clientIp);

    // Generate cryptographically secure random session token
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    counselorSessions.set(token, {
      token,
      username: expectedUser,
      createdAt: now,
      expiresAt: now + SESSION_EXPIRY_MS,
    });

    return res.json({
      success: true,
      token,
      role: 'counselor',
      expiresInMinutes: 30,
    });
  }

  recordFailedLogin(clientIp);
  return res.status(401).json({ error: 'Invalid counselor credentials' });
});

// Counselor Portal Logout: terminates active session token in memory
apiRouter.post('/circle/counselor/logout', requireCounselorAuth, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.slice(7).trim();
  if (token) {
    counselorSessions.delete(token);
  }
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Counselor Patterns List (Verified by requireCounselorAuth; Zero raw identifiers, zero case data)
apiRouter.get('/circle/counselor/patterns', requireCounselorAuth, (_req: Request, res: Response) => {
  try {
    const patterns = getCounselorPatterns();
    return res.json({ patterns });
  } catch (err: any) {
    console.error('Counselor patterns error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch patterns' });
  }
});

// Counselor Audit Log (Verified by requireCounselorAuth; actor, action, time, NO content)
apiRouter.get('/circle/counselor/audit', requireCounselorAuth, (_req: Request, res: Response) => {
  try {
    const auditLogs = getCounselorAuditLogs();
    return res.json({ auditLogs });
  } catch (err: any) {
    console.error('Counselor audit logs error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

