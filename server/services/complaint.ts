import { ai, hasApiKey } from './geminiClient.ts';
import { CitedLegalCard } from './legal.ts';

export type AuthorityType =
  | 'fia_cybercrime'
  | 'police_station'
  | 'workplace_committee'
  | 'university_committee'
  | 'women_protection_cell';

export interface AuthorityMeta {
  id: AuthorityType;
  titleEn: string;
  titleUr: string;
  recipientDesignationEn: string;
  recipientDesignationUr: string;
  scopeNoticeEn: string;
}

export const AUTHORITIES: Record<AuthorityType, AuthorityMeta> = {
  fia_cybercrime: {
    id: 'fia_cybercrime',
    titleEn: 'FIA Cyber Crime Wing',
    titleUr: 'ایف آئی اے سائبر کرائم ونگ',
    recipientDesignationEn: 'The Additional Director / In-charge, Cyber Crime Reporting Centre, Federal Investigation Agency (FIA)',
    recipientDesignationUr: 'بخدمت ایڈیشنل ڈائریکٹر / انچارج، سائبر کرائم رپورٹنگ سینٹر، ایف آئی اے',
    scopeNoticeEn: 'Digital blackmail, non-consensual media distribution, cyber-stalking, spoofing, and electronic extortion.',
  },
  police_station: {
    id: 'police_station',
    titleEn: 'Local Police Station (SHO)',
    titleUr: 'متعلقہ پولیس تھانہ (ایس ایچ او)',
    recipientDesignationEn: 'The Station House Officer (SHO), Local Police Station',
    recipientDesignationUr: 'بخدمت جناب ایس ایچ او صاحب، متعلقہ تھانہ',
    scopeNoticeEn: 'Immediate criminal intimidation, physical threats, stalking, and breaches of public peace.',
  },
  workplace_committee: {
    id: 'workplace_committee',
    titleEn: 'Workplace Inquiry Committee',
    titleUr: 'کام کی جگہ پر انسدادِ ہراسانی انکوائری کمیٹی',
    recipientDesignationEn: 'The Inquiry Committee under Protection against Harassment at the Workplace Act, [Organization Name]',
    recipientDesignationUr: 'بخدمت ممبران انکوائری کمیٹی، تحفظ برائے انسدادِ ہراسانی بمقامِ کار، [ادارہ کا نام]',
    scopeNoticeEn: 'Workplace quid-pro-quo coercion, abuse of professional authority, and hostile workplace environment.',
  },
  university_committee: {
    id: 'university_committee',
    titleEn: 'University / College Committee',
    titleUr: 'یونیورسٹی / کالج انسدادِ ہراسانی کمیٹی',
    recipientDesignationEn: 'The Ombudsperson / Harassment Monitoring Committee, [Educational Institution Name]',
    recipientDesignationUr: 'بخدمت انکوائری کمیٹی برائے انسدادِ ہراسانی، [تعلیمی ادارہ کا نام]',
    scopeNoticeEn: 'Academic exploitation, grading coercion, campus stalking, and student harassment.',
  },
  women_protection_cell: {
    id: 'women_protection_cell',
    titleEn: 'Women Protection Cell',
    titleUr: 'ویمن پروٹیکشن سیل',
    recipientDesignationEn: 'In-charge, Women Protection Cell / District Protection Center',
    recipientDesignationUr: 'بخدمت انچارج صاحبہ، ویمن پروٹیکشن سیل / ضلعی مرکزِ تحفظِ خواتین',
    scopeNoticeEn: 'Domestic abuse, gender-based violence, forced isolation, and emergency protection orders.',
  },
};

export interface ComplaintDraftResult {
  authority: AuthorityType;
  language: 'en' | 'ur';
  title: string;
  complainantPlaceholder: string;
  accusedIdentifiers: string;
  chronologicalFacts: string;
  citedSections: CitedLegalCard[];
  reliefRequested: string[];
  evidenceIndex: string[];
  fullDraftText: string;
  disclaimer: string;
  isFallback?: boolean;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms = 12000,
  msg = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

export async function generateComplaintDraft(params: {
  authority: AuthorityType;
  language: 'en' | 'ur';
  complainantName?: string;
  accusedInfo?: string;
  summaryFacts: string;
  timelineEvents: Array<{ timestamp: string; speaker: string; text: string; platform: string }>;
  citedSections: CitedLegalCard[];
  evidenceItems: Array<{ id: string; type: string; notes?: string; platform: string }>;
}): Promise<ComplaintDraftResult> {
  const { authority, language, summaryFacts, timelineEvents, citedSections, evidenceItems } = params;
  const auth = AUTHORITIES[authority] || AUTHORITIES.fia_cybercrime;
  const isUrdu = language === 'ur';

  const defaultEvidenceIndex = evidenceItems.map(
    (item, idx) => `Annexure-${String.fromCharCode(65 + idx)}: ${item.type.toUpperCase()} record (${item.platform}) - ${item.notes || 'Recorded interaction'}`
  );

  const defaultReliefEn = [
    'Immediate formal registration of complaint and commencement of independent inquiry.',
    'Restraining order or formal direction ordering the accused to cease all direct or indirect contact.',
    'Technical preservation of server logs, device records, and associated digital metadata.',
    'Protection against retaliatory action, career detriment, or academic disadvantage.',
  ];

  const defaultReliefUr = [
    'درخواست کی باقاعدہ فوری وصولی اور غیر جانبدارانہ قانونی انکوائری کا فوری آغاز۔',
    'ملزم کو ہر قسم کے براہ راست یا بالواسطہ رابطے اور تعاقب سے سختی سے روکنے کا حکم۔',
    'متعلقہ ڈیجیٹل سرورز، فون ریکارڈ اور مواصلاتی ڈیٹا کو بطور ثبوت محفوظ کرنے کے احکامات۔',
    'کسی بھی قسم کی انتقامی کارروائی یا ادارہ جاتی نقصان کے خلاف فوری تحفظ۔',
  ];

  // 9. Complaint generator: cite ONLY verified cards (act and section) and leave out any section the user removed
  const verifiedCitations = (citedSections || [])
    .filter((s) => s.act && s.section)
    .map((s) => `• ${s.act} (${s.section}): ${s.title}`);

  const citationsPromptNotice =
    verifiedCitations.length > 0
      ? `VERIFIED LEGAL CITATIONS TO INCLUDE (Cite ONLY these verified provisions; leave out any section not in this list):
${verifiedCitations.join('\n')}`
      : `LEGAL CITATIONS: The complainant did not select any statutory sections. Do NOT invent or cite any act or section.`;

  if (!hasApiKey || !summaryFacts || summaryFacts.trim().length < 5) {
    return buildFallbackDraft(
      auth,
      language,
      citedSections,
      defaultEvidenceIndex,
      isUrdu ? defaultReliefUr : defaultReliefEn
    );
  }

  try {
    const prompt = isUrdu
      ? `آپ ایک قانونی مسودہ نگار ہیں جو ہراسانی کے خلاف باضابطہ شکایت کا مسودہ (Urdu) تیار کر رہے ہیں۔
اتھارٹی: ${auth.titleUr} (${auth.recipientDesignationUr})
خلاصہ حقائق: ${summaryFacts}
واقعات کی ترتیب: ${JSON.stringify(timelineEvents.slice(0, 10))}
شواہد انڈیکس: ${JSON.stringify(defaultEvidenceIndex)}
${citationsPromptNotice}

براہ کرم مکمل شکایت کا مسودہ باوقار، قانونی اور واضح اردو میں تیار کریں جس میں درج ذیل حصے شامل ہوں:
1. عنوان (موضوع)
2. بخدمت (مخاطب)
3. مستغیثہ (مدعیہ کا نام: [مدعیہ / صیغہ راز])
4. ملزم کے دستیاب کوائف
5. واقعات کی مکمل تفصیل (Chronological Facts)
6. قانونی حوالہ جات (صرف اوپر دی گئی تصدیق شدہ دفعات کا ذکر کریں؛ اگر کوئی نہیں تو کوئی فرضی دفعہ نہ بنائیں)
7. مطلوبہ داد رسی (Relief Requested)
8. منسلک شواہد کی فہرست (Annexures)

آخر میں یہ نوٹ ضرور ہو: "یہ مسودہ معلوماتی مقاصد کے لیے تیار کیا گیا ہے، یہ حتمی قانونی مشورہ نہیں۔"`
      : `You are an expert legal aid specialist drafting a formal harassment complaint application.
Authority: ${auth.titleEn} (${auth.recipientDesignationEn})
Facts Summary: ${summaryFacts}
Key Timeline: ${JSON.stringify(timelineEvents.slice(0, 10))}
Evidence Index: ${JSON.stringify(defaultEvidenceIndex)}
${citationsPromptNotice}

CRITICAL CITATION RULE:
Cite ONLY the verified provisions provided above (act and section). Do NOT invent, assume, or cite any other statutory section or law. If none are provided, state that statutory grounds are reserved for advocate representation.

Draft a complete, highly structured, and formal complaint containing:
1. Subject Header
2. Addressed Authority Designation
3. Complainant Placeholder: [Complainant Name / Redacted for Privacy]
4. Accused Identifiers & Contact Details
5. Chronological Statement of Facts & Intimidation
6. Referenced Legal Categories (strictly using the verified sections above)
7. Specific Relief Requested (immediate inquiry, restraining directives, data preservation)
8. Evidence Index (Annexure list)

Maintain a solemn, objective tone suitable for official submission.`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      }),
      12000,
      'generateComplaintDraft call timed out'
    );

    const fullDraft = response.text?.trim() || '';

    return {
      authority,
      language,
      title: isUrdu
        ? `باضابطہ درخواست برائے انسدادِ بلیک میلنگ و سائبر ہراسانی (${auth.titleUr})`
        : `Formal Complaint regarding Coercive Harassment and Extortion (${auth.titleEn})`,
      complainantPlaceholder: isUrdu ? '[مدعیہ / صیغہ راز]' : '[Complainant Name - Redacted for Privacy]',
      accusedIdentifiers: params.accusedInfo || '[PHONE_1], Associated Accounts & Workplace Identity',
      chronologicalFacts: summaryFacts,
      citedSections,
      reliefRequested: isUrdu ? defaultReliefUr : defaultReliefEn,
      evidenceIndex: defaultEvidenceIndex,
      fullDraftText: fullDraft,
      disclaimer: 'Draft, not legal advice. Information generated for educational filing preparation only.',
      isFallback: false,
    };
  } catch (err) {
    console.warn('Generate complaint failed, returning fallback template:', err);
    return buildFallbackDraft(auth, language, citedSections, defaultEvidenceIndex, isUrdu ? defaultReliefUr : defaultReliefEn);
  }
}

function buildFallbackDraft(
  auth: AuthorityMeta,
  language: 'en' | 'ur',
  citedSections: CitedLegalCard[],
  evidenceIndex: string[],
  reliefList: string[]
): ComplaintDraftResult {
  const isUrdu = language === 'ur';

  // Cite ONLY verified cards (act and section); leave out any section the user removed
  const verifiedCitations = (citedSections || [])
    .filter((s) => s.act && s.section)
    .map((s) => `• ${s.act} (${s.section}): ${s.title}`);

  if (isUrdu) {
    const legalNoticeUr =
      verifiedCitations.length > 0
        ? `\nقانونی حوالہ جات (تصدیق شدہ دفعات):\n${verifiedCitations.join('\n')}\n`
        : '';

    const urduDraft = `بخدمت: ${auth.recipientDesignationUr}
موضوع: باضابطہ شکایت برائے کارروائی انسدادِ غیر قانونی ہراسانی، بلیک میلنگ و بلیک میلنگ دھمکیاں

جنابِ عالی!
مودبانہ گزارش ہے کہ سائلہ کو گزشتہ چند ایام سے ملزم (متعلقہ نمبر: [PHONE_1] / سوشل میڈیا اکاؤنٹ) کی جانب سے سنگین ذہنی و نفسیاتی دباؤ اور دھمکیوں کا سامنا ہے۔

حقائق کا خلاصہ:
1. ملزم کی جانب سے واٹس ایپ اور کالز کے ذریعے بلا اجازت مسلسل پیغامات اور کالز کی گئیں۔
2. سائلہ کو مجبور کیا گیا کہ وہ غیر قانونی مطالبات تسلیم کرے ورنہ نجی معلومات اور تصاویر پھیلائی جائیں گی۔
3. سائلہ کے واضح انکار کے باوجود ملزم نے 24 گھنٹے کا الٹی میٹم دیا اور خوف و ہراس پھیلانے کی کوشش کی۔
${legalNoticeUr}
داد رسی کی استدعا:
${reliefList.map((r, i) => `${i + 1}. ${r}`).join('\n')}

منسلک شواہد کی فہرست:
${evidenceIndex.join('\n')}

العارض:
[مدعیہ / صیغہ راز]
دستخط: __________________
تاریخ: ${new Date().toLocaleDateString('en-GB')}`;

    return {
      authority: auth.id,
      language: 'ur',
      title: `باضابطہ شکایت برائے انسدادِ ہراسانی (${auth.titleUr})`,
      complainantPlaceholder: '[مدعیہ / صیغہ راز]',
      accusedIdentifiers: '[PHONE_1] / ڈیجیٹل اکاونٹ',
      chronologicalFacts: 'مسلسل غیر مطلوبہ پیغامات اور نجی میڈیا جاری کرنے کی دھمکیاں۔',
      citedSections: citedSections.filter((s) => s.act && s.section),
      reliefRequested: reliefList,
      evidenceIndex,
      fullDraftText: urduDraft,
      disclaimer: 'Draft, not legal advice. Information generated for educational filing preparation only.',
      isFallback: true,
    };
  }

  const legalNoticeEn =
    verifiedCitations.length > 0
      ? `LEGAL NOTICE & RELEVANCE (VERIFIED STATUTORY PROVISIONS):
${verifiedCitations.join('\n')}`
      : `LEGAL NOTICE & RELEVANCE:
[No specific statutory sections cited in this draft]`;

  const enDraft = `To:
${auth.recipientDesignationEn}

SUBJECT: FORMAL COMPLAINT REGARDING UNLAWFUL DIGITAL HARASSMENT, BLACKMAIL, AND COERCIVE INTIMIDATION

Respected Authority,

I am writing to formally lodge an urgent complaint against the individual operating contact [PHONE_1] and associated digital accounts for persistent harassment, intimidation, and unlawful coercion.

STATEMENT OF FACTS:
1. The accused initiated continuous, unwelcome communications despite clear objections and instructions to cease.
2. The accused subsequently issued an explicit extortion ultimatum (threatening to disseminate confidential material and private photographs unless non-consensual demands were met within a 24-hour window).
3. The complainant has preserved all digital chat records, time-stamped screenshots, and voice recordings demonstrating the coercive pattern.

${legalNoticeEn}

RELIEF PRAYED FOR:
${reliefList.map((r, i) => `${i + 1}. ${r}`).join('\n')}

ANNEXED EVIDENCE INDEX:
${evidenceIndex.join('\n')}

Submitted in good faith,
[Complainant Name - Redacted for Privacy]
Contact: [Verified Secure Channel]
Date: ${new Date().toLocaleDateString('en-GB')}`;

  return {
    authority: auth.id,
    language: 'en',
    title: `Formal Complaint Application (${auth.titleEn})`,
    complainantPlaceholder: '[Complainant Name - Redacted for Privacy]',
    accusedIdentifiers: '[PHONE_1] and associated profiles',
    chronologicalFacts: 'Persistent intimidation, 24h extortion ultimatum, threats to distribute private media.',
    citedSections: citedSections.filter((s) => s.act && s.section),
    reliefRequested: reliefList,
    evidenceIndex,
    fullDraftText: enDraft,
    disclaimer: 'Draft, not legal advice. Information generated for educational filing preparation only.',
    isFallback: true,
  };
}
