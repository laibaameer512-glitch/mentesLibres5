export interface TimelineEvent {
  id: string;
  timestamp: string; // ISO string or standardized format
  rawTimestamp: string;
  speaker: string;
  text: string;
  platform: string;
  sourceEvidenceId: string;
  sourceType: 'screenshot' | 'audio' | 'text';
  isThreat?: boolean;
  hasGapBefore?: boolean;
  gapDurationDescription?: string;
  isDateUncertain?: boolean;
}

export interface CitedLegalCard {
  act: string;
  section: string;
  title: string;
  snippet: string;
  plainExplanation: string;
  sourceUrl: string;
  isPlaceholder: boolean;
  relevanceReason: string;
  chunkId?: string;
  jurisdiction?: string;
  lastVerified?: string;
  verifiedBy?: string;
  score?: number;
}

export interface LegalSection {
  id: string;
  act: string;
  section: string;
  title: string;
  snippet: string;
  category?: string;
  sourceUrl: string;
  isPlaceholder: boolean;
  jurisdiction?: string;
  lastVerified?: string;
  verifiedBy?: string;
  score?: number;
}

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

export interface CircleIdentifierInput {
  type: 'phone' | 'handle' | 'location' | 'other';
  raw: string;
  normalized: string;
}

export interface CircleStatusItem {
  status: 'match' | 'no_match';
  count: number;
  message: string;
}

export interface CircleStatusResponse {
  results: Record<string, CircleStatusItem>;
}

export interface CircleContributeResponse {
  success: boolean;
  contributedCount: number;
  results: Array<{ hash: string; isPattern: boolean; count: number }>;
}

export interface CounselorPatternItem {
  shortHash: string;
  distinctReporterCount: number;
  firstSeenMonth: string;
  lastSeenMonth: string;
  category: string;
  isPattern: boolean;
}

export interface CircleAuditLogItem {
  actor: string;
  action: string;
  time: string;
}

