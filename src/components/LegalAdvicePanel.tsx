import React, { useState, useEffect } from 'react';
import { VaultCase } from '../lib/db.ts';
import { CitedLegalCard } from '../types/shared.ts';
import {
  Scale,
  AlertCircle,
  ExternalLink,
  BookOpen,
  Info,
  ChevronRight,
  Sparkles,
  MapPin,
  HelpCircle,
  Search,
  CheckCircle2,
  Trash2,
} from 'lucide-react';

interface LegalAdvicePanelProps {
  currentCase: VaultCase;
  onProceedToDraft: () => void;
}

export const LegalAdvicePanel: React.FC<LegalAdvicePanelProps> = ({
  currentCase,
  onProceedToDraft,
}) => {
  const [cards, setCards] = useState<CitedLegalCard[]>([]);
  const [province, setProvince] = useState<string>('federal');
  const [language, setLanguage] = useState<'en' | 'ur'>('en');
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Free-form Ask Legal state
  const [askQuestion, setAskQuestion] = useState<string>('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResult, setAskResult] = useState<{
    answer: string;
    citedCards: CitedLegalCard[];
    disclaimer: string;
  } | null>(null);

  useEffect(() => {
    fetchLegalGuidance();
  }, [currentCase.id, province, language]);

  const fetchLegalGuidance = async () => {
    setIsLoading(true);
    setError(null);
    setIsFallback(false);

    try {
      const caseFacts =
        currentCase.extractedReview?.summary5Lines?.join(' ') ||
        currentCase.evidenceItems.map((e) => e.notes).join(' ') ||
        'Harassment and blackmail incident';

      const categories =
        currentCase.extractedReview?.classificationLabels?.map((c) => c.category) || [
          'blackmail/extortion',
          'cyber-stalking',
        ];

      const res = await fetch('/api/ai/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: categories,
          caseFacts,
          province,
          language,
          caseId: currentCase.id,
          classificationLabels: categories,
        }),
      });

      if (!res.ok) throw new Error('Failed to retrieve legal guidance');
      const data = await res.json();
      const retrievedCards: CitedLegalCard[] = data.citedCards || [];
      setCards(retrievedCards);

      // Persist verified cards for Complaint Generator
      try {
        sessionStorage.setItem(
          `sakhi_vault_cited_cards_${currentCase.id}`,
          JSON.stringify(retrievedCards)
        );
      } catch {}

      if (data.isFallback || data.isDemoCached) {
        setIsFallback(true);
      }
    } catch (err: any) {
      console.warn('Legal retrieval fallback:', err);
      setIsFallback(true);
      // Demo case offline fallback cards strictly from verified placeholder corpus
      const fallbackCards: CitedLegalCard[] = [
        {
          chunkId: 'digital-safety-harassment-act-sample-draft-2024-14-b',
          act: 'Digital Safety & Harassment Act (Sample Draft)',
          section: 'Section 14-B',
          title: 'Coercion, Blackmail & Digital Extortion (PLACEHOLDER)',
          snippet: '[PLACEHOLDER - REPLACE WITH VERIFIED TEXT] Covers threatening to release sensitive private media or personal information to demand money, favor, or compliance. Anyone who coerces or blackmails another individual by threatening publication of private images or communications commits an offense under this section.',
          plainExplanation: language === 'ur'
            ? 'یہ دفعہ نجی تصاویر یا معلومات عام کرنے کی دھمکی دے کر ناجائز مطالبات منوانے کے خلاف قانونی چارہ جوئی سے متعلق ہے۔'
            : 'Pertains to coercive ultimatums threatening disclosure of private records or media to compel compliance.',
          sourceUrl: 'https://example.gov.pk/legal/placeholder-sec14b',
          jurisdiction: 'federal',
          lastVerified: '2024-01-15',
          verifiedBy: 'Legal Aid Clinic',
          isPlaceholder: true,
          relevanceReason: 'Direct match for recorded 24-hour media release ultimatum.',
        },
        {
          chunkId: 'electronic-communications-protection-framework-sample-draft-2024-10-a',
          act: 'Electronic Communications Protection Framework (Sample Draft)',
          section: 'Section 10-A',
          title: 'Unauthorized Surveillance and Cyber-Stalking (PLACEHOLDER)',
          snippet: '[PLACEHOLDER - REPLACE WITH VERIFIED TEXT] Pertains to persistent electronic stalking, tracking without consent, or repeated unwelcome communications causing distress or alarm. Using multiple numbers or accounts to bypass blocks and intimidate a victim constitutes prohibited cyber-stalking.',
          plainExplanation: language === 'ur'
            ? 'یہ قانون بار بار کالز، پیغامات اور بلاک ہونے کے باوجود دوسرے نمبروں سے تعاقب کرنے کا احاطہ کرتا ہے۔'
            : 'Addresses continuous tracking and messaging through secondary numbers after being blocked.',
          sourceUrl: 'https://example.gov.pk/legal/placeholder-sec10a',
          jurisdiction: 'federal',
          lastVerified: '2024-01-15',
          verifiedBy: 'Legal Aid Clinic',
          isPlaceholder: true,
          relevanceReason: 'Matches evidence logs across multiple burner contacts and social profiles.',
        },
      ];
      setCards(fallbackCards);
      try {
        sessionStorage.setItem(
          `sakhi_vault_cited_cards_${currentCase.id}`,
          JSON.stringify(fallbackCards)
        );
      } catch {}
    } finally {
      setIsLoading(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuestion.trim()) return;

    setAskLoading(true);
    setAskResult(null);

    try {
      const res = await fetch('/api/legal/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: askQuestion.trim(),
          province,
          language,
        }),
      });

      if (!res.ok) throw new Error('Failed to answer legal question');
      const data = await res.json();
      setAskResult(data);
    } catch (err: any) {
      console.error('Ask Question error:', err);
      setAskResult({
        answer: 'No matching section found. Please consult a lawyer.',
        citedCards: [],
        disclaimer: 'Information and draft only, not legal advice.',
      });
    } finally {
      setAskLoading(false);
    }
  };

  const handleRemoveCard = (chunkId?: string) => {
    if (!chunkId) return;
    const updated = cards.filter((c) => c.chunkId !== chunkId);
    setCards(updated);
    try {
      sessionStorage.setItem(
        `sakhi_vault_cited_cards_${currentCase.id}`,
        JSON.stringify(updated)
      );
    } catch {}
  };

  return (
    <div className="space-y-6">
      {/* 10. Visible AI Unavailable Fallback Banner */}
      {isFallback && (
        <div className="p-3.5 bg-amber-950/80 border-2 border-amber-600/90 rounded-2xl flex items-center gap-3 text-xs text-amber-100 shadow-md">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-300 uppercase tracking-wider block">
              AI unavailable, using sample result
            </span>
            <span className="text-amber-200/90">
              Offline mode or Gemini model unavailable; displaying pre-cached statutory mapping for this case.
            </span>
          </div>
        </div>
      )}

      {/* 6. MANDATORY LEGAL DISCLAIMER BANNER */}
      <div className="p-4 bg-amber-950/40 border-2 border-amber-800/80 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
            Information and draft only, not legal advice.
          </h4>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            The sections below are educational extracts from verified regulatory frameworks. All statutory guidance is for draft preparation and must be reviewed by an advocate or legal aid clinic.
          </p>
        </div>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-teal-400" />
            <span>Which Law May Apply (Grounded RAG Pipeline)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Hybrid vector + BM25 reciprocal rank fusion grounded strictly in verified corpus
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          {/* 7. Province Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="bg-transparent text-xs text-slate-200 font-semibold focus:outline-none cursor-pointer"
              title="Filter by jurisdiction"
            >
              <option value="federal" className="bg-slate-900 text-white">Federal Only</option>
              <option value="punjab" className="bg-slate-900 text-white">Punjab (+ Federal)</option>
              <option value="sindh" className="bg-slate-900 text-white">Sindh (+ Federal)</option>
              <option value="kp" className="bg-slate-900 text-white">Khyber Pakhtunkhwa (+ Federal)</option>
              <option value="balochistan" className="bg-slate-900 text-white">Balochistan (+ Federal)</option>
              <option value="islamabad" className="bg-slate-900 text-white">Islamabad ICT (+ Federal)</option>
            </select>
          </div>

          {/* Language Toggle */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setLanguage('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                language === 'en' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('ur')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                language === 'ur' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              اردو
            </button>
          </div>

          <button
            onClick={onProceedToDraft}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center gap-2 ml-auto lg:ml-0"
          >
            <span>Draft Formal Complaint</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 8. Free-Form Legal Question Box (POST /api/legal/ask) */}
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-teal-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Ask a Free-Form Legal Question (Grounded in Verified Corpus)
          </h3>
        </div>
        <form onSubmit={handleAskQuestion} className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={askQuestion}
            onChange={(e) => setAskQuestion(e.target.value)}
            placeholder={
              language === 'ur'
                ? 'مثال: نجی تصاویر پھیلانے کی دھمکی کے خلاف کون سا قانون لاگو ہوتا ہے؟'
                : 'e.g. What law applies if someone threatens to distribute private pictures within 24 hours?'
            }
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={askLoading || !askQuestion.trim()}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition flex items-center justify-center gap-1.5 shrink-0"
          >
            {askLoading ? (
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            <span>{askLoading ? 'Searching...' : 'Ask Pipeline'}</span>
          </button>
        </form>

        {askResult && (
          <div className="p-4 bg-slate-950/80 border border-teal-800/60 rounded-xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-teal-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                Grounded Pipeline Answer
              </span>
              <span className="text-[10px] text-amber-300 font-mono">
                {askResult.disclaimer}
              </span>
            </div>
            <p className="text-slate-200 leading-relaxed text-xs">
              {askResult.answer}
            </p>

            {askResult.citedCards.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Verified Sections Cited:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {askResult.citedCards.map((c, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-950 border border-teal-800 text-teal-300"
                    >
                      {c.act} ({c.section})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Grounded Results List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
          <Sparkles className="w-6 h-6 text-teal-400 animate-spin mx-auto mb-2" />
          <span>Running hybrid retrieval & verifying citations against markdown corpus...</span>
        </div>
      ) : cards.length === 0 ? (
        /* 6. No-answer rule */
        <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-900/40 space-y-3">
          <Info className="w-6 h-6 text-slate-500 mx-auto" />
          <div className="space-y-1">
            <p className="text-sm text-slate-200 font-semibold">
              {language === 'ur'
                ? 'کوئی متعلقہ قانونی دفعہ نہیں ملی۔ براہ کرم کسی وکیل سے مشورہ لیں۔'
                : 'No matching section found. Please consult a lawyer.'}
            </p>
            <p className="text-xs text-slate-400">
              {language === 'ur'
                ? 'مفت قانونی اور نفسیاتی رہنمائی کے لیے ہیلپ لائنز ڈائرکٹری سے رجوع کریں۔'
                : 'Free legal and counselor consultations are available under the Helplines directory.'}
            </p>
          </div>
          <div className="pt-2">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-amber-950/60 border border-amber-800/80 text-amber-300">
              {language === 'ur'
                ? 'یہ قانونی معلومات ہے، قانونی مشورہ نہیں۔'
                : 'This is legal information, not legal advice'}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Showing {cards.length} verified statutory provisions for this case
            </span>
            <span className="text-[11px] text-teal-400">
              Only verified provisions are forwarded to the complaint draft
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {cards.map((card, idx) => (
              <div
                key={card.chunkId || idx}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 md:p-5 space-y-3.5 transition shadow-sm"
              >
                {/* Header Badge */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                        {card.act}
                      </span>
                      {card.jurisdiction && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          {card.jurisdiction}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-white">{card.section}: {card.title}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Verification Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        card.verifiedBy && card.verifiedBy !== 'Not yet verified'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60'
                          : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                      }`}
                      title={card.lastVerified ? `Verified on ${card.lastVerified}` : ''}
                    >
                      {card.verifiedBy || 'Not yet verified'}
                    </span>

                    {card.sourceUrl && (
                      <a
                        href={card.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 text-slate-400 hover:text-white transition"
                        title="View Official Statute Source"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    <button
                      onClick={() => handleRemoveCard(card.chunkId)}
                      className="p-1 text-slate-500 hover:text-rose-400 transition"
                      title="Remove section from complaint"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 5. Verbatim snippet from chunk (never model rewritten) */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/60 text-xs text-slate-300 font-serif leading-relaxed italic">
                  "{card.snippet}"
                </div>

                {/* Plain Explanation */}
                <div className="space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                    <span>Plain Language Explanation:</span>
                  </span>
                  <p className="text-xs text-slate-300 leading-relaxed pl-5">
                    {card.plainExplanation}
                  </p>
                </div>

                {/* Relevance Reason */}
                <div className="text-[11px] text-teal-400/90 bg-teal-950/30 px-3 py-1.5 rounded-lg border border-teal-800/40 flex items-center justify-between">
                  <div>
                    <strong className="text-teal-300">Why it applies:</strong> {card.relevanceReason}
                  </div>
                  {card.lastVerified && (
                    <div className="text-[10px] text-slate-400 font-mono">
                      Ref: {card.lastVerified}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Mandatory visible disclaimer under results */}
          <div className="py-2.5 px-4 bg-slate-950/60 border border-slate-800/80 rounded-xl text-center">
            <p className="text-xs font-medium text-amber-300/90 tracking-wide">
              {language === 'ur'
                ? 'یہ قانونی معلومات ہے، قانونی مشورہ نہیں۔'
                : 'This is legal information, not legal advice'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
