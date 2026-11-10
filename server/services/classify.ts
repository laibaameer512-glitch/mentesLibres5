import { hasApiKey, withRotation } from './geminiClient.ts';
import { Type } from '@google/genai';

export const ALLOWED_CATEGORIES = [
  'workplace/educational harassment',
  'cyber-stalking',
  'blackmail/extortion',
  'criminal threats',
  'non-consensual image sharing',
  'domestic abuse',
  'defamation',
] as const;

export type HarassmentCategory = (typeof ALLOWED_CATEGORIES)[number];

export interface ClassificationLabel {
  category: HarassmentCategory;
  confidence: number; // 0.0 to 1.0
  reason: string; // One-line reason linked to specific messages
  linkedQuotes: string[];
}

export interface ClassificationResult {
  labels: ClassificationLabel[];
  primaryCategory: HarassmentCategory;
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
  rationale: string;
  isFallback?: boolean;
}

/**
 * Multi-label classification with confidence and specific message-linked reasoning
 */
export async function classifyHarassment(
  evidenceText: string,
  demands: string[] = [],
  threats: string[] = []
): Promise<ClassificationResult> {
  if (!hasApiKey || !evidenceText || evidenceText.trim().length < 5) {
    return getFallbackClassification();
  }

  try {
    const response = await withRotation('classify', (pair, client) =>
      client.models.generateContent({
        model: pair.model,
        contents: `You are an expert legal triage and harassment classification analyst.
Analyze the provided evidence statements, threats, and demands.
Select all applicable categories from ONLY the following allowed labels:
1. workplace/educational harassment
2. cyber-stalking
3. blackmail/extortion
4. criminal threats
5. non-consensual image sharing
6. domestic abuse
7. defamation

For each identified label:
- Provide confidence between 0.50 and 0.99
- A one-line reason specifically citing evidence facts or quotes
- The exact quote(s) from the text justifying this label

Also determine overall urgencyLevel: "low", "medium", "high", or "critical" (if imminent physical danger or ultimatum is detected).

Evidence:
${evidenceText}

Identified Threats:
${JSON.stringify(threats)}

Identified Demands:
${JSON.stringify(demands)}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primaryCategory: { type: Type.STRING },
            urgencyLevel: { type: Type.STRING },
            rationale: { type: Type.STRING },
            labels: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  reason: { type: Type.STRING },
                  linkedQuotes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['category', 'confidence', 'reason'],
              },
            },
          },
          required: ['primaryCategory', 'urgencyLevel', 'labels', 'rationale'],
        },
      },
    })
  );

    const parsed = JSON.parse(response.text || '{}') as ClassificationResult;
    // Validate categories are from allowed set
    const filteredLabels = (parsed.labels || []).filter((l) =>
      ALLOWED_CATEGORIES.includes(l.category as HarassmentCategory)
    );

    return {
      primaryCategory: (ALLOWED_CATEGORIES.includes(parsed.primaryCategory as HarassmentCategory)
        ? parsed.primaryCategory
        : 'blackmail/extortion') as HarassmentCategory,
      urgencyLevel: parsed.urgencyLevel || 'high',
      rationale: parsed.rationale || 'Coercive digital pressure identified',
      labels: filteredLabels.length > 0 ? filteredLabels : getFallbackClassification().labels,
      isFallback: false,
    };
  } catch (error) {
    console.warn('Classify harassment failed, using demo fallback:', error);
    return getFallbackClassification();
  }
}

function getFallbackClassification(): ClassificationResult {
  return {
    primaryCategory: 'blackmail/extortion',
    urgencyLevel: 'high',
    rationale:
      'Direct extortion ultimatum demanding favorable testimony under threat of distributing private media to employers within 24 hours.',
    labels: [
      {
        category: 'blackmail/extortion',
        confidence: 0.96,
        reason: 'Explicit ultimatum ("24 ghantay hain tumhare paas") threatening disclosure of private photos to enforce compliance.',
        linkedQuotes: ['Agar kal meeting mein mere haq mein bayan nahi diya to photos tumhare department head ko bhej doonga.'],
      },
      {
        category: 'workplace/educational harassment',
        confidence: 0.91,
        reason: 'Coercing institutional outcome and leveraging professional hierarchy / department head exposure.',
        linkedQuotes: ['Agar kal meeting mein mere haq mein bayan nahi diya...'],
      },
      {
        category: 'criminal threats',
        confidence: 0.88,
        reason: 'Intimidation and threat of reputational damage to force an illegal act.',
        linkedQuotes: ['Karke dekh lo. Samajhti kya ho khud ko?'],
      },
    ],
    isFallback: true,
  };
}
