/**
 * CaseScreen — shown when a user taps a case on HomeScreen.
 * Goals:
 *   - ONE primary "Analyse My Evidence (AI)" button at the top
 *   - After analysis: 4 big step cards in order
 *   - Evidence list with thumbnails underneath
 *   - "Add more" section: photo, voice, text tabs (existing EvidenceIntake)
 *   - Advanced section (collapsed by default) for Circle, duplicate detector nav
 *   - Every existing feature reachable; nothing removed
 */
import React, { useState } from 'react';
import { VaultCase } from '../lib/db.ts';
import { EvidenceIntake } from './EvidenceIntake.tsx';
import { EvidenceReview } from './EvidenceReview.tsx';
import { LegalAdvicePanel } from './LegalAdvicePanel.tsx';
import { ComplaintGenerator } from './ComplaintGenerator.tsx';
import { CircleModule } from './CircleModule.tsx';
import { featureFlags } from '../featureFlags.ts';
import {
  ArrowLeft,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Clock,
  Scale,
  FileText,
  ShieldCheck,
  Plus,
  Image as ImageIcon,
  Mic,
  FileType,
  AlertCircle,
  AlertTriangle,
  Users,
  Copy,
} from 'lucide-react';

type CaseView =
  | 'home'
  | 'intake_photo'
  | 'intake_audio'
  | 'intake_text'
  | 'review'
  | 'legal'
  | 'complaint'
  | 'circle';

interface CaseScreenProps {
  currentCase: VaultCase;
  activeKey: CryptoKey;
  onCaseUpdated: (c: VaultCase) => void;
  onRunAiPipeline: (c: VaultCase) => Promise<void>;
  isAnalyzing: boolean;
  onBack: () => void;
  language: 'ur' | 'en';
}

export const CaseScreen: React.FC<CaseScreenProps> = ({
  currentCase,
  activeKey,
  onCaseUpdated,
  onRunAiPipeline,
  isAnalyzing,
  onBack,
  language,
}) => {
  const [view, setView] = useState<CaseView>('home');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAddMore, setShowAddMore] = useState(false);

  const lbl = (ur: string, en: string) => (language === 'ur' ? ur : en);

  const hasAnalysis = Boolean(currentCase.extractedReview);

  // ── Step 4 card: determine which next tab to open from Legal
  const handleProceedToLegal = () => {
    if (featureFlags.circle) {
      setView('circle');
    } else {
      setView('legal');
    }
  };

  // ── Sub-view rendering ──────────────────────────────────────────────────
  if (view === 'intake_photo' || view === 'intake_audio' || view === 'intake_text') {
    // We reuse existing EvidenceIntake but default its activeTab
    // We can't easily set internal tab, so we just render EvidenceIntake
    // (all three input modes are reachable via its own tabs)
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        {/* Back bar */}
        <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{lbl('واپس', 'Back')}</span>
          </button>
        </header>
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <EvidenceIntake
            currentCase={currentCase}
            activeKey={activeKey}
            onCaseUpdated={onCaseUpdated}
            onRunAiPipeline={onRunAiPipeline}
            isAnalyzing={isAnalyzing}
            initialTab={
              view === 'intake_photo'
                ? 'photo'
                : view === 'intake_audio'
                ? 'audio'
                : view === 'intake_text'
                ? 'text'
                : 'screenshot'
            }
          />
        </div>
      </div>
    );
  }

  if (view === 'review') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>
              <span className="font-urdu">واپس</span> / Back
            </span>
          </button>
        </header>
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <EvidenceReview
            currentCase={currentCase}
            activeKey={activeKey}
            onCaseUpdated={onCaseUpdated}
            onProceedToLegal={handleProceedToLegal}
          />
        </div>
      </div>
    );
  }

  if (view === 'circle' && featureFlags.circle) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>
              <span className="font-urdu">واپس</span> / Back
            </span>
          </button>
        </header>
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <CircleModule
            currentCase={currentCase}
            activeKey={activeKey}
            onCaseUpdated={onCaseUpdated}
          />
        </div>
      </div>
    );
  }

  if (view === 'legal') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>
              <span className="font-urdu">واپس</span> / Back
            </span>
          </button>
        </header>
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <LegalAdvicePanel
            currentCase={currentCase}
            onProceedToDraft={() => setView('complaint')}
          />
        </div>
      </div>
    );
  }

  if (view === 'complaint') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>
              <span className="font-urdu">واپس</span> / Back
            </span>
          </button>
        </header>
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <ComplaintGenerator currentCase={currentCase} />
        </div>
      </div>
    );
  }

  // ── CASE HOME VIEW ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Back bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-semibold text-teal-300 hover:text-white transition"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-urdu text-base leading-tight">واپس</span>
            <span className="text-xs text-slate-400">/ Back</span>
          </button>
          <span className="text-slate-700 select-none">|</span>
          <h1 className="text-sm font-bold text-white truncate flex-1">{currentCase.title}</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full">
        {/* ── MAIN ACTION: Analyse ── */}
        <div className="space-y-1.5">
          <button
            onClick={() => onRunAiPipeline(currentCase)}
            disabled={isAnalyzing || currentCase.evidenceItems.length === 0}
            className="w-full flex items-center justify-center gap-3 bg-teal-700 hover:bg-teal-600 active:bg-teal-800 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-2xl px-5 py-4 shadow-lg transition min-h-[64px] text-left"
          >
            <Sparkles className={`w-6 h-6 shrink-0 ${isAnalyzing ? 'animate-spin' : ''}`} />
            <div className="flex flex-col items-start">
              <span className="font-urdu text-lg leading-snug">سمجھیں</span>
              <span className="text-sm font-semibold opacity-90">
                {isAnalyzing
                  ? 'کام جاری ہے / Working...'
                  : lbl('شواہد کا جائزہ لیں', 'Analyse My Evidence')}
              </span>
            </div>
          </button>
          <p className="text-xs text-slate-500 text-center">
            {currentCase.evidenceItems.length === 0
              ? lbl('پہلے کوئی آئٹم شامل کریں۔', 'Add at least one item first.')
              : lbl('دبائیں — جائزہ شروع کریں۔', 'Press to analyse your evidence.')}
          </p>
        </div>

        {/* ── 4 STEP CARDS (shown after analysis) ── */}
        {hasAnalysis && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {lbl('نتائج', 'Results')}
            </p>

            {/* Step 1: Timeline */}
            <button
              onClick={() => setView('review')}
              className="w-full flex items-center gap-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-700/60 rounded-2xl px-4 py-4 text-left transition min-h-[64px]"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-900/60 border border-teal-700/40 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-teal-400" />
              </div>
              <div className="flex-1">
                <div className="font-urdu text-base text-white leading-snug">ٹائم لائن</div>
                <div className="text-xs text-slate-400">1 · Timeline</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-600 rotate-[-90deg]" />
            </button>

            {/* Step 2: Which laws */}
            <button
              onClick={() => setView('legal')}
              className="w-full flex items-center gap-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-700/60 rounded-2xl px-4 py-4 text-left transition min-h-[64px]"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-900/60 border border-teal-700/40 flex items-center justify-center shrink-0">
                <Scale className="w-5 h-5 text-teal-400" />
              </div>
              <div className="flex-1">
                <div className="font-urdu text-base text-white leading-snug">کون سے قانون</div>
                <div className="text-xs text-slate-400">2 · Which laws may apply</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-600 rotate-[-90deg]" />
            </button>

            {/* Step 3: Complaint draft */}
            <button
              onClick={() => setView('complaint')}
              className="w-full flex items-center gap-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-700/60 rounded-2xl px-4 py-4 text-left transition min-h-[64px]"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-900/60 border border-teal-700/40 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-teal-400" />
              </div>
              <div className="flex-1">
                <div className="font-urdu text-base text-white leading-snug">شکایت کا مسودہ</div>
                <div className="text-xs text-slate-400">3 · Complaint draft</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-600 rotate-[-90deg]" />
            </button>

            {/* Step 4: Safety help */}
            <button
              onClick={() => setView('review')}
              className="w-full flex items-center gap-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-700/60 rounded-2xl px-4 py-4 text-left transition min-h-[64px]"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-900/60 border border-teal-700/40 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-teal-400" />
              </div>
              <div className="flex-1">
                <div className="font-urdu text-base text-white leading-snug">مدد اور حفاظت</div>
                <div className="text-xs text-slate-400">4 · Safety help</div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-600 rotate-[-90deg]" />
            </button>
          </div>
        )}

        {/* ── EVIDENCE LIST ── */}
        {currentCase.evidenceItems.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              {lbl('شواہد', 'Evidence')} ({currentCase.evidenceItems.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {currentCase.evidenceItems.slice(0, 9).map((item) => (
                <div
                  key={item.id}
                  className="aspect-square bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex items-center justify-center"
                >
                  {item.type === 'screenshot' ? (
                    <img
                      src={item.content}
                      alt="Evidence screenshot"
                      className="w-full h-full object-cover object-top"
                    />
                  ) : item.type === 'audio' ? (
                    <div className="flex flex-col items-center gap-1 text-teal-400">
                      <Mic className="w-5 h-5" />
                      <span className="text-[9px] text-slate-500">{item.platform}</span>
                    </div>
                  ) : (
                    <div className="p-1.5 text-[9px] text-slate-500 font-mono line-clamp-4 text-left">
                      {item.content?.slice(0, 60)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {currentCase.evidenceItems.length > 9 && (
              <p className="text-xs text-slate-500 text-center mt-1">
                +{currentCase.evidenceItems.length - 9} more
              </p>
            )}
          </section>
        )}

        {/* ── ADD MORE (collapsible) ── */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAddMore((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-4 text-left min-h-[56px]"
          >
            <div className="flex items-center gap-3">
              <Plus className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <span className="font-urdu text-base text-white leading-snug block">مزید شامل کریں</span>
                <span className="text-xs text-slate-400">Add more / upload evidence</span>
              </div>
            </div>
            {showAddMore ? (
              <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {showAddMore && (
            <div className="border-t border-slate-800">
              {/* Quick-access buttons for each intake type */}
              <div className="grid grid-cols-3 gap-2 p-3">
                <button
                  onClick={() => setView('intake_photo')}
                  className="flex flex-col items-center gap-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl py-3 px-2 transition"
                >
                  <ImageIcon className="w-5 h-5 text-teal-400" />
                  <span className="font-urdu text-xs text-slate-300 leading-snug">تصویر</span>
                  <span className="text-[10px] text-slate-500">Photo</span>
                </button>
                <button
                  onClick={() => setView('intake_audio')}
                  className="flex flex-col items-center gap-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl py-3 px-2 transition"
                >
                  <Mic className="w-5 h-5 text-teal-400" />
                  <span className="font-urdu text-xs text-slate-300 leading-snug">آواز</span>
                  <span className="text-[10px] text-slate-500">Voice</span>
                </button>
                <button
                  onClick={() => setView('intake_text')}
                  className="flex flex-col items-center gap-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl py-3 px-2 transition"
                >
                  <FileType className="w-5 h-5 text-teal-400" />
                  <span className="font-urdu text-xs text-slate-300 leading-snug">متن</span>
                  <span className="text-[10px] text-slate-500">Text / Chat</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── ADVANCED (collapsed by default) ── */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left min-h-[52px]"
          >
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {lbl('مزید اختیارات', 'Advanced / مزید اختیارات')}
            </span>
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
            )}
          </button>

          {showAdvanced && (
            <div className="border-t border-slate-800 p-3 space-y-2">
              {/* Review / Timeline / Messages */}
              <button
                onClick={() => setView('review')}
                className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-3 text-left transition"
              >
                <Clock className="w-4 h-4 text-teal-400 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-slate-200">Review &amp; Edit</div>
                  <div className="text-[10px] text-slate-500">
                    Edit messages, threats, demands, labels
                  </div>
                </div>
              </button>

              {/* Circle (flag-gated) */}
              {featureFlags.circle && (
                <button
                  onClick={() => setView('circle')}
                  className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-3 text-left transition"
                >
                  <Users className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <div className="font-urdu text-sm text-slate-200 leading-snug">سخی سرکل</div>
                    <div className="text-[10px] text-slate-500">
                      Sakhi Circle — pattern matching
                    </div>
                  </div>
                </button>
              )}

              {/* Duplicate Detector (flag-gated) */}
              {featureFlags.duplicateDetector && (
                <button
                  onClick={() => setView('review')}
                  className="w-full flex items-center gap-3 bg-slate-800 hover:bg-slate-700 rounded-xl px-3 py-3 text-left transition"
                >
                  <Copy className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Duplicate Detector</div>
                    <div className="text-[10px] text-slate-500">
                      Find similar evidence items
                    </div>
                  </div>
                </button>
              )}

              <p className="text-[10px] text-slate-600 px-1">
                Tags, metadata fields, escalation indicator, threat highlights, severity, and
                Circle opt-in are inside the AI Review screen above.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

