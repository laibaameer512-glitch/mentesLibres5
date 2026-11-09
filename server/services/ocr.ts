import { ai, hasApiKey } from './geminiClient.ts';
import { Type } from '@google/genai';

export interface OCRResult {
  extractedText: string;
  confidence: number;
  detectedLanguages: string[];
  notes?: string;
  isFallback?: boolean;
}

/**
 * Extracts text from chat screenshots (English, Roman Urdu, Urdu script)
 */
export async function performOCR(
  imageBase64: string,
  mimeType: string = 'image/png'
): Promise<OCRResult> {
  // If no API key or image is placeholder demo, use safe demo fallback
  if (!hasApiKey || !imageBase64) {
    return getFallbackOCR(imageBase64);
  }

  try {
    // Strip data prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/png',
              data: cleanBase64,
            },
          },
          {
            text: `Extract all visible text from this chat screenshot or document. 
Support English, Roman Urdu (e.g. 'tum meri baat suno warna...', 'ab dekhna'), and Arabic/Urdu script.
Preserve speaker labels, timestamps, and message sequence accurately.
Provide output in JSON format with fields:
- extractedText: full text extracted line by line
- confidence: number between 0.0 and 1.0 indicating OCR quality
- detectedLanguages: array of language codes e.g. ["English", "Roman Urdu", "Urdu"]
- notes: brief observation of message styling or sender markers`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            extractedText: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            detectedLanguages: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            notes: { type: Type.STRING },
          },
          required: ['extractedText', 'confidence', 'detectedLanguages'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      extractedText: parsed.extractedText || '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.95,
      detectedLanguages: parsed.detectedLanguages || ['English', 'Roman Urdu'],
      notes: parsed.notes || 'Vision OCR completed',
      isFallback: false,
    };
  } catch (error) {
    console.warn('Gemini OCR API error or timeout, utilizing demo fallback:', error);
    return getFallbackOCR(imageBase64);
  }
}

function getFallbackOCR(sampleHint?: string): OCRResult {
  return {
    extractedText: `[10:14 PM] Accused: "Agar kal meeting mein mere haq mein bayan nahi diya to photos tumhare department head ko bhej doonga. Yaad rakhna."
[10:15 PM] Complainant: "Aap mujhe blackmail mat karein, main administration ko inform karungi."
[10:16 PM] Accused: "Karke dekh lo. Samajhti kya ho khud ko? 24 ghantay hain tumhare paas."`,
    confidence: 0.96,
    detectedLanguages: ['Roman Urdu', 'English'],
    notes: 'Preserved timestamps and threatening statement sequence',
    isFallback: true,
  };
}
