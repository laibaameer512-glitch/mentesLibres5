import { ai, hasApiKey } from './geminiClient.ts';

export interface SummaryResult {
  lines: string[];
  fullText: string;
  language: 'en' | 'ur';
  isFallback?: boolean;
}

/**
 * Generates an objective, 5-line plain-language summary of the case facts
 * in English or Urdu for quick review and authority filings.
 */
export async function summarizeCaseFacts(
  factsText: string,
  language: 'en' | 'ur' = 'en',
  demands: string[] = [],
  threats: string[] = []
): Promise<SummaryResult> {
  if (!hasApiKey || !factsText || factsText.trim().length < 5) {
    return getFallbackSummary(language);
  }

  try {
    const isUrdu = language === 'ur';
    const prompt = isUrdu
      ? `درج ذیل ہراسانی اور بلیک میلنگ شواہد کا بالکل 5 سطور (5 lines) پر مشتمل جامع، غیر جانبدارانہ اور سادہ اردو میں خلاصہ تیار کریں۔
ہر سطر ایک مخصوص حقیقت بیان کرے:
1. فریقین اور مواصلاتی پلیٹ فارم
2. غیر مطلوبہ پیغامات یا پیچھا کرنے کا آغاز
3. دھمکیوں یا بلیک میلنگ کا واضح مواد
4. متاثرہ فرد کا انکار اور تحفظ کا مطالبہ
5. فوری صورتحال اور لاحق خطرہ

شواہد:
${factsText}
دھمکیاں: ${threats.join('; ')}
مطالبات: ${demands.join('; ')}

صرف 5 سطور فراہم کریں، ہر سطر 1 تا 5 نمبر کے ساتھ۔`
      : `Generate exactly a 5-line plain-language, factual case summary of the harassment/extortion evidence.
Structure each line as follows:
Line 1: Incident context, platforms used, and relationship/parties involved.
Line 2: Progression of persistent unwelcome communications or tracking.
Line 3: Specific threats made (e.g. extortion, non-consensual media disclosure, physical intimidation).
Line 4: Response of the victim (rejection of demands and requests to cease).
Line 5: Current urgency level, ongoing danger, and requested protective relief.

Evidence facts:
${factsText}
Threats: ${threats.join('; ')}
Demands: ${demands.join('; ')}

Output exactly 5 lines, numbered 1 to 5.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const raw = response.text?.trim() || '';
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 5);

    if (lines.length >= 3) {
      return {
        lines,
        fullText: lines.join('\n'),
        language,
        isFallback: false,
      };
    }

    return getFallbackSummary(language);
  } catch (error) {
    console.warn('Summarize facts failed, using demo fallback:', error);
    return getFallbackSummary(language);
  }
}

function getFallbackSummary(language: 'en' | 'ur'): SummaryResult {
  if (language === 'ur') {
    const urduLines = [
      '1. ملزم کی جانب سے واٹس ایپ اور کالز کے ذریعے بلا اجازت مسلسل پیغامات بھیجے گئے۔',
      '2. متاثرہ فرد پر تنظیمی اور پیشہ ورانہ دباؤ ڈال کر مرضی کے مطابق بیانات دینے کا مطالبہ کیا گیا۔',
      '3. انکار کی صورت میں نجی تصاویر اور ذاتی معلومات اعلیٰ انتظامیہ اور خاندان کو بھیجنے کی واضح دھمکی دی گئی۔',
      '4. متاثرہ خاتون نے واضح طور پر بلیک میلنگ کو مسترد کیا اور رابطہ بند کرنے کا تقاضا کیا۔',
      '5. ملزم کی جانب سے 24 گھنٹے کی مہلت اور مسلسل تعاقب کے پیشِ نظر فوری تحفظ اور قانونی مداخلت ناگزیر ہے۔',
    ];
    return {
      lines: urduLines,
      fullText: urduLines.join('\n'),
      language: 'ur',
      isFallback: true,
    };
  }

  const enLines = [
    '1. The complainant was subjected to persistent, unsolicited communications across digital messaging platforms.',
    '2. The accused leveraged institutional proximity to demand forced compliance in an upcoming official proceeding.',
    '3. Explicit threats of distributing private media to employers and family were delivered with a 24-hour ultimatum.',
    '4. The complainant explicitly recorded objections, rejected all extortion demands, and demanded cessation of harassment.',
    '5. Given recurring intimidation and active extortion, immediate inquiry, protective relief, and digital preservation are urgently sought.',
  ];

  return {
    lines: enLines,
    fullText: enLines.join('\n'),
    language: 'en',
    isFallback: true,
  };
}
