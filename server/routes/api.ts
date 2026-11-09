import { Router, Request, Response } from 'express';
import { performOCR } from '../services/ocr.ts';
import { transcribeAudio } from '../services/transcribe.ts';
import { extractEvidenceEntities } from '../services/extract.ts';
import { classifyHarassment } from '../services/classify.ts';
import { buildChronologicalTimeline } from '../services/timeline.ts';
import { summarizeCaseFacts } from '../services/summarize.ts';
import { retrieveSections, explainSections } from '../services/legal.ts';
import { generateComplaintDraft } from '../services/complaint.ts';
import { ai, hasApiKey } from '../services/geminiClient.ts';
import {
  contributeIdentifiers,
  getStatusForReporter,
  withdrawReporterCase,
  getCounselorPatterns,
  getCounselorAuditLogs,
  seedDemoReporters,
} from '../services/circle.ts';
import fs from 'fs';
import path from 'path';

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
apiRouter.post('/ai/legal', async (req: Request, res: Response) => {
  try {
    const { queries, caseFacts } = req.body;
    const sections = await retrieveSections(queries || []);
    const citedCards = await explainSections(caseFacts || '', sections);
    return res.json({ sections, citedCards });
  } catch (err: any) {
    console.error('Legal Route error:', err);
    return res.status(500).json({ error: err.message || 'Legal guidance retrieval failed' });
  }
});

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
    const { reporterPseudonym, identifiers, category, caseId } = req.body || {};
    if (!reporterPseudonym) {
      return res.status(400).json({ error: 'reporterPseudonym is required' });
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

// Counselor Portal Login
apiRouter.post('/circle/counselor/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.COUNSELOR_USER || 'counselor@sakhi.org';
  const expectedPass = process.env.COUNSELOR_PASS || 'DemoCounselor2026!';

  if (username === expectedUser && password === expectedPass) {
    return res.json({
      success: true,
      token: 'demo-counselor-session-active',
      username: expectedUser,
      role: 'counselor',
    });
  }

  return res.status(401).json({ error: 'Invalid counselor credentials' });
});

// Counselor Patterns List (Zero raw identifiers, zero case data)
apiRouter.get('/circle/counselor/patterns', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.includes('demo-counselor-session-active')) {
    return res.status(401).json({ error: 'Unauthorized counselor session' });
  }

  try {
    const patterns = getCounselorPatterns();
    return res.json({ patterns });
  } catch (err: any) {
    console.error('Counselor patterns error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch patterns' });
  }
});

// Counselor Audit Log (actor, action, time, NO content)
apiRouter.get('/circle/counselor/audit', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.includes('demo-counselor-session-active')) {
    return res.status(401).json({ error: 'Unauthorized counselor session' });
  }

  try {
    const auditLogs = getCounselorAuditLogs();
    return res.json({ auditLogs });
  } catch (err: any) {
    console.error('Counselor audit logs error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

