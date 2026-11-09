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
  const [isLoading, setIsLoading] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLegalGuidance();
  }, [currentCase.id]);

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
        body: JSON.stringify({ queries: categories, caseFacts }),
      });

      if (!res.ok) throw new Error('Failed to retrieve legal guidance');
      const data = await res.json();
      setCards(data.citedCards || []);
      if (data.isFallback) setIsFallback(true);
    } catch (err: any) {
      console.warn('Legal retrieval fallback:', err);
      setIsFallback(true);
      // Fallback placeholder cards
      setCards([
        {
          act: 'Digital Safety & Harassment Act (Sample Draft)',
          section: 'Section 14-B (PLACEHOLDER - REPLACE WITH VERIFIED TEXT)',
          title: 'Coercion, Blackmail & Digital Extortion (PLACEHOLDER)',
          snippet: '[PLACEHOLDER - REPLACE WITH VERIFIED TEXT] Covers threatening to release sensitive private media or personal information to demand money, favor, or compliance.',
          plainExplanation: 'This provisional draft section pertains to ultimatums demanding submission under threat of distributing private records.',
          sourceUrl: 'https://example.gov.pk/legal/placeholder-sec14b',
          isPlaceholder: true,
          relevanceReason: 'Direct match for recorded 24-hour media release ultimatum.',
        },
        {
          act: 'Electronic Communications Protection Framework (Sample Draft)',
          section: 'Section 10-A (PLACEHOLDER - REPLACE WITH VERIFIED TEXT)',
          title: 'Unauthorized Surveillance and Cyber-Stalking (PLACEHOLDER)',
          snippet: '[PLACEHOLDER - REPLACE WITH VERIFIED TEXT] Pertains to persistent electronic stalking, tracking without consent, or repeated unwelcome communications causing distress.',
          plainExplanation: 'Addresses continuous tracking and messaging through secondary numbers after being blocked.',
          sourceUrl: 'https://example.gov.pk/legal/placeholder-sec10a',
          isPlaceholder: true,
          relevanceReason: 'Matches evidence logs across multiple burner contacts and social profiles.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Visible AI Unavailable Fallback Banner */}
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

      {/* MANDATORY LEGAL DISCLAIMER BANNER */}
      <div className="p-4 bg-amber-950/40 border-2 border-amber-800/80 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
            Information and draft only, not legal advice.
          </h4>
          <p className="text-xs text-amber-200/90 leading-relaxed">
            The sections below are educational placeholders from sample regulatory frameworks. All citations are marked for subsequent verification by an advocate or legal aid clinic.
          </p>
        </div>
      </div>

      {/* Header and Proceed Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Scale className="w-5 h-5 text-teal-400" />
            <span>Which Law May Apply (Educational Grounding)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Automated statutory mapping based on verified evidence indicators
          </p>
        </div>
        <button
          onClick={onProceedToDraft}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center gap-2"
        >
          <span>Draft Formal Complaint</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800">
          <Sparkles className="w-6 h-6 text-teal-400 animate-spin mx-auto mb-2" />
          <span>Retrieving statutory categories and generating plain explanations...</span>
        </div>
      ) : cards.length === 0 ? (
        <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center bg-slate-900/40 space-y-2">
          <Info className="w-6 h-6 text-slate-500 mx-auto" />
          <p className="text-xs text-slate-300 font-medium">
            No matching section found. Please consult a lawyer.
          </p>
          <p className="text-[11px] text-slate-500">
            Free helpline consultations are available under the Helplines directory.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {cards.map((card, idx) => (
            <div
              key={idx}
              className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 md:p-5 space-y-3.5 transition shadow-sm"
            >
              {/* Header Badge */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    {card.act}
                  </span>
                  <h3 className="text-sm font-bold text-white">{card.section}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-amber-950/80 text-amber-300 border border-amber-800/60">
                    PLACEHOLDER - REPLACE WITH VERIFIED TEXT
                  </span>
                  <a
                    href={card.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-slate-400 hover:text-white transition"
                    title="External Source"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Legal snippet */}
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
              <div className="text-[11px] text-teal-400/90 bg-teal-950/30 px-3 py-1.5 rounded-lg border border-teal-800/40">
                <strong className="text-teal-300">Why it applies:</strong> {card.relevanceReason}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
