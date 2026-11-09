import { ai, hasApiKey } from './geminiClient.ts';
import { Type } from '@google/genai';

export interface ExtractedMessage {
  id: string;
  speaker: string; // e.g. "Accused", "Complainant", "Unknown"
  timestamp: string; // e.g. "2026-03-12 22:14"
  text: string;
  language: string; // e.g. "Roman Urdu", "English", "Urdu"
  isThreat?: boolean;
}

export interface ExtractedEvidenceData {
  messages: ExtractedMessage[];
  threats: string[];
  demands: string[];
  platform: string; // WhatsApp, Instagram, SMS, Call, etc.
  identifiers: string[]; // e.g. phone numbers, social handles, account IDs
  summaryOneLiner?: string;
  isFallback?: boolean;
}

/**
 * Parses raw text or chat transcript into strict structured message records,
 * explicit threats, coercive demands, and identifiers.
 */
export async function extractEvidenceEntities(
  rawText: string,
  platformHint: string = 'WhatsApp'
): Promise<ExtractedEvidenceData> {
  if (!hasApiKey || !rawText || rawText.trim().length < 5) {
    return getFallbackExtraction(platformHint);
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: `You are an expert evidence intake specialist parsing sanitized harassment evidence records.
Analyze the following evidence text from platform: "${platformHint}".
Extract:
1. Every distinct message with speaker, approximate/exact timestamp, text, and language.
2. Direct or implicit threats (e.g. threats to distribute photos, damage career, physical harm).
3. Coercive demands (e.g. demanding money, meeting, withdrawing complaint, silence).
4. Detected platform name.
5. All identifiers mentioned (phone placeholders like [PHONE_1], handles, accounts, location references).

Evidence text to analyze:
---
${rawText}
---`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            messages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  text: { type: Type.STRING },
                  language: { type: Type.STRING },
                  isThreat: { type: Type.BOOLEAN },
                },
                required: ['speaker', 'text'],
              },
            },
            threats: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            demands: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            platform: { type: Type.STRING },
            identifiers: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            summaryOneLiner: { type: Type.STRING },
          },
          required: ['messages', 'threats', 'demands', 'platform', 'identifiers'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}') as ExtractedEvidenceData;
    // Ensure ids exist
    parsed.messages = (parsed.messages || []).map((m, idx) => ({
      ...m,
      id: m.id || `msg-${idx + 1}-${Date.now()}`,
    }));
    return {
      ...parsed,
      isFallback: false,
    };
  } catch (error) {
    console.warn('Extract evidence failed, using demo fallback:', error);
    return getFallbackExtraction(platformHint);
  }
}

function getFallbackExtraction(platformHint: string): ExtractedEvidenceData {
  return {
    platform: platformHint || 'WhatsApp',
    messages: [
      {
        id: 'msg-1',
        speaker: 'Accused',
        timestamp: '10:14 PM',
        text: 'Agar kal meeting mein mere haq mein bayan nahi diya to photos tumhare department head ko bhej doonga. Yaad rakhna.',
        language: 'Roman Urdu',
        isThreat: true,
      },
      {
        id: 'msg-2',
        speaker: 'Complainant',
        timestamp: '10:15 PM',
        text: 'Aap mujhe blackmail mat karein, main administration ko inform karungi.',
        language: 'Roman Urdu',
        isThreat: false,
      },
      {
        id: 'msg-3',
        speaker: 'Accused',
        timestamp: '10:16 PM',
        text: 'Karke dekh lo. Samajhti kya ho khud ko? 24 ghantay hain tumhare paas.',
        language: 'Roman Urdu',
        isThreat: true,
      },
    ],
    threats: [
      'Threat to distribute private photos to department head / employers',
      'Intimidation with a 24-hour ultimatum to force compliance',
    ],
    demands: [
      'Forced favorable testimony in upcoming institutional meeting',
      'Submission under duress without reporting to authorities',
    ],
    identifiers: ['[PHONE_1]', '@suspect_work_handle', 'Department Office'],
    summaryOneLiner: 'Unsolicited blackmail messages imposing a 24-hour deadline with extortion threats.',
    isFallback: true,
  };
}
