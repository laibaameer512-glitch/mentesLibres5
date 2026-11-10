/**
 * VaultDashboard — top-level container for the real vault.
 *
 * Navigation model:
 *   Bottom tab bar: "Home / ہوم" | "Cases / کیسز"
 *
 *   Top level (tabs):
 *     home_tab  → HomeScreen   (3 action cards + Help & Settings grid)
 *     cases_tab → CasesTab     (case list)
 *
 *   Push views (replace full screen, back button returns):
 *     'voice'      → voice/audio intake (EvidenceIntake, audio tab pre-selected)
 *     'case'       → CaseScreen
 *     'helplines'  → HelplinesScreen
 *     'settings'   → SettingsScreen
 *     'privacy'    → SettingsScreen (scrolled, same component)
 *
 * Hard rules:
 *   - All handlers (runAiPipeline, handleCreateCase, handleDeleteCase,
 *     handleCaseUpdated) are IDENTICAL to the originals.
 *   - No server/, crypto.ts, db.ts, feature flags, PIN logic touched.
 *   - PanicBar rendered at this level, appears on every screen.
 */
import React, { useState, useEffect, useRef } from 'react';
import { VaultCase, saveRealCase, deleteRealCase } from '../lib/db.ts';
import { PanicBar } from './PanicBar.tsx';
import { HomeScreen } from './HomeScreen.tsx';
import { CasesTab } from './CasesTab.tsx';
import { CaseScreen } from './CaseScreen.tsx';
import { HelplinesScreen } from './HelplinesScreen.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { EvidenceIntake } from './EvidenceIntake.tsx';
import { CircleModule } from './CircleModule.tsx';
import { featureFlags } from '../featureFlags.ts';
import { redactTextLocally, restoreTextLocally } from '../lib/redact.ts';
import { findInCaseDuplicates } from '../lib/duplicates.ts';
import {
  Home,
  FolderOpen,
  ArrowLeft,
  FolderPlus,
  X,
  Shield,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
interface VaultDashboardProps {
  realKey: CryptoKey;
  cases: VaultCase[];
  onCasesUpdated: (cases: VaultCase[]) => void;
  onPanicLock: () => void;
  onOpenPinSetup: () => void;
  onNavigateCounselor?: () => void;
}

/** Retained for backward-compatibility with any module importing VaultTab */
export type VaultTab = 'intake' | 'review' | 'circle' | 'legal' | 'complaint' | 'helplines' | 'settings';

type BottomTab = 'home_tab' | 'cases_tab';
type PushView = 'intake' | 'case' | 'circle' | 'helplines' | 'settings' | 'privacy' | null;

// ── Component ──────────────────────────────────────────────────────────────
export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  realKey,
  cases,
  onCasesUpdated,
  onPanicLock,
  onOpenPinSetup,
  onNavigateCounselor,
}) => {
  const [bottomTab, setBottomTab] = useState<BottomTab>('home_tab');
  const [pushView, setPushView] = useState<PushView>(null);
  const [activeCaseId, setActiveCaseId] = useState<string>(
    cases.length > 0 ? cases[0].id : ''
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [language, setLanguage] = useState<'ur' | 'en'>(() => {
    return (localStorage.getItem('uiLanguage') as 'ur' | 'en') || 'ur';
  });

  const currentCase = cases.find((c) => c.id === activeCaseId) || cases[0] || null;

  // ── Duplicate count badge (unchanged logic) ────────────────────────────
  const [pendingDuplicatesCount, setPendingDuplicatesCount] = useState(0);
  useEffect(() => {
    if (featureFlags.duplicateDetector && currentCase && currentCase.evidenceItems.length > 1) {
      findInCaseDuplicates(currentCase.evidenceItems, currentCase.duplicateDecisions)
        .then((matches) => setPendingDuplicatesCount(matches.filter((m) => !m.decision).length))
        .catch(() => setPendingDuplicatesCount(0));
    } else {
      setPendingDuplicatesCount(0);
    }
  }, [currentCase?.evidenceItems, currentCase?.duplicateDecisions]);

  // ── Language toggle ────────────────────────────────────────────────────
  const toggleLanguage = () => {
    setLanguage((prev) => {
      const next = prev === 'ur' ? 'en' : 'ur';
      localStorage.setItem('uiLanguage', next);
      return next;
    });
  };

  const lbl = (ur: string, en: string) => (language === 'ur' ? ur : en);

  // ── Create new case (identical logic) ─────────────────────────────────
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseTitle.trim()) return;

    const newCase: VaultCase = {
      id: `case-${Date.now()}`,
      title: newCaseTitle.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      evidenceItems: [],
    };

    await saveRealCase(realKey, newCase);
    const updated = [newCase, ...cases];
    onCasesUpdated(updated);
    setActiveCaseId(newCase.id);
    setShowNewCaseModal(false);
    setNewCaseTitle('');
    setPushView('case');
  };

  // ── Update case (identical logic) ─────────────────────────────────────
  const handleCaseUpdated = (updatedCase: VaultCase) => {
    const updatedList = cases.map((c) => (c.id === updatedCase.id ? updatedCase : c));
    onCasesUpdated(updatedList);
  };

  // ── Delete case (identical logic) ─────────────────────────────────────
  const handleDeleteCase = async (caseId: string) => {
    if (!window.confirm('Are you sure you want to delete this entire case and its evidence?')) return;
    await deleteRealCase(caseId);
    const filtered = cases.filter((c) => c.id !== caseId);
    onCasesUpdated(filtered);
    if (filtered.length > 0) setActiveCaseId(filtered[0].id);
    setPushView(null);
  };

  // ── Run AI Pipeline (identical logic) ─────────────────────────────────
  const runAiPipeline = async (c: VaultCase) => {
    setIsAnalyzing(true);
    try {
      const processedItems = [...c.evidenceItems];
      let cumulativeText = '';

      for (let i = 0; i < processedItems.length; i++) {
        const item = processedItems[i];
        if (item.type === 'screenshot' && (!item.ocrOrTranscriptText || item.ocrOrTranscriptText.length < 5)) {
          try {
            const ocrRes = await fetch('/api/ai/ocr', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageBase64: item.content, mimeType: item.mimeType }),
            });
            const ocrData = await ocrRes.json();
            item.ocrOrTranscriptText = ocrData.extractedText || '';
            item.confidence = ocrData.confidence || 0.95;
          } catch {
            console.warn('OCR processing fallback for item:', item.id);
          }
        } else if (item.type === 'audio' && (!item.ocrOrTranscriptText || item.ocrOrTranscriptText.length < 5)) {
          try {
            const trRes = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: item.content, mimeType: item.mimeType }),
            });
            const trData = await trRes.json();
            item.ocrOrTranscriptText = trData.transcript || '';
            item.confidence = trData.confidence || 0.94;
          } catch {
            console.warn('Audio transcribe fallback for item:', item.id);
          }
        }

        const itemContent = item.ocrOrTranscriptText || item.content || item.notes || '';
        cumulativeText += `\n[${item.incidentDateTime}] ${item.platform} - ${item.personLabel}:\n${itemContent}\n`;
      }

      const userNames = [c.title, ...c.evidenceItems.map((e) => e.personLabel)];
      const { redactedText, mapping } = redactTextLocally(cumulativeText, userNames);

      const extractRes = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: redactedText, platform: 'WhatsApp' }),
      });
      const extractData = await extractRes.json();

      const classifyRes = await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: redactedText,
          threats: extractData.threats || [],
          demands: extractData.demands || [],
        }),
      });
      const classifyData = await classifyRes.json();

      const summarizeRes = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: redactedText,
          language: 'en',
          threats: extractData.threats || [],
          demands: extractData.demands || [],
        }),
      });
      const summarizeData = await summarizeRes.json();

      const timelineRes = await fetch('/api/ai/timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: processedItems.map((pi) => ({
            id: pi.id,
            type: pi.type,
            platform: pi.platform,
            incidentDateTime: pi.incidentDateTime,
            rawText: pi.ocrOrTranscriptText || pi.content,
          })),
        }),
      });
      await timelineRes.json();

      const unredactedMessages = (extractData.messages || []).map((m: any) => ({
        ...m,
        text: restoreTextLocally(m.text, mapping),
      }));

      const isAnyFallback = Boolean(
        extractData.isFallback || classifyData.isFallback || summarizeData.isFallback
      );

      const reviewPayload = {
        messages: unredactedMessages,
        threats: extractData.threats || [],
        demands: extractData.demands || [],
        platform: extractData.platform || 'WhatsApp',
        identifiers: extractData.identifiers || [],
        summary5Lines: summarizeData.lines || [],
        classificationLabels: classifyData.labels || [],
        customRedactionMapping: mapping,
        isFallback: isAnyFallback,
      };

      const updatedCase: VaultCase = {
        ...c,
        evidenceItems: processedItems,
        extractedReview: reviewPayload,
        updatedAt: new Date().toISOString(),
      };

      await saveRealCase(realKey, updatedCase);
      handleCaseUpdated(updatedCase);
    } catch (err) {
      console.error('AI Pipeline error:', err);
      alert('دوبارہ کوشش کریں / Please try again');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ── Shared back bar helper ─────────────────────────────────────────────
  const BackHeader: React.FC<{ onBack: () => void; title?: string }> = ({ onBack, title }) => (
    <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-teal-300 hover:text-white transition min-h-[44px]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-urdu text-base leading-tight">واپس</span>
          <span className="text-xs text-slate-500">/ Back</span>
        </button>
        {title && (
          <>
            <span className="text-slate-700 select-none">|</span>
            <span className="text-sm font-bold text-white truncate flex-1">{title}</span>
          </>
        )}
      </div>
    </header>
  );

  // ── Push view rendering (full-screen, replaces tabs) ───────────────────
  if (pushView === 'intake' && currentCase) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <PanicBar onPanicLock={onPanicLock} vaultType="real" />
        <BackHeader onBack={() => setPushView(null)} title={currentCase.title} />
        <div className="flex-1 p-4 max-w-lg mx-auto w-full">
          <EvidenceIntake
            currentCase={currentCase}
            activeKey={realKey}
            onCaseUpdated={handleCaseUpdated}
            onRunAiPipeline={runAiPipeline}
            isAnalyzing={isAnalyzing}
          />
        </div>
      </div>
    );
  }

  if (pushView === 'circle') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <PanicBar onPanicLock={onPanicLock} vaultType="real" />
        <BackHeader onBack={() => setPushView(null)} title={language === 'ur' ? 'سخی سرکل' : 'Sakhi Circle'} />
        <div className="flex-1 p-4 max-w-lg mx-auto w-full">
          <CircleModule
            cases={cases}
            initialCaseId={activeCaseId}
            activeKey={realKey}
            onCaseUpdated={handleCaseUpdated}
            language={language}
          />
        </div>
      </div>
    );
  }

  if (pushView === 'helplines') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <PanicBar onPanicLock={onPanicLock} vaultType="real" />
        <BackHeader onBack={() => setPushView(null)} />
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <HelplinesScreen />
        </div>
      </div>
    );
  }

  if (pushView === 'settings' || pushView === 'privacy') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <PanicBar onPanicLock={onPanicLock} vaultType="real" />
        <BackHeader
          onBack={() => setPushView(null)}
          title={language === 'ur' ? 'پرائیویسی، شرائط اور سیٹنگز' : 'Privacy, Terms & Settings'}
        />
        <div className="flex-1 p-4 max-w-xl mx-auto w-full">
          <SettingsScreen
            onOpenPinSetup={onOpenPinSetup}
            onPanicLock={onPanicLock}
            onNavigateCounselor={onNavigateCounselor}
            language={language}
            onLanguageChange={(l) => {
              setLanguage(l);
              localStorage.setItem('uiLanguage', l);
            }}
            onBack={() => setPushView(null)}
          />
        </div>
      </div>
    );
  }

  if (pushView === 'case' && currentCase) {
    return (
      <CaseScreen
        currentCase={currentCase}
        activeKey={realKey}
        onCaseUpdated={handleCaseUpdated}
        onRunAiPipeline={runAiPipeline}
        isAnalyzing={isAnalyzing}
        onBack={() => setPushView(null)}
        language={language}
      />
    );
  }

  // ── Main layout with bottom tab bar ────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Panic-hide tap area */}
      <PanicBar onPanicLock={onPanicLock} vaultType="real" />

      {/* Top bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto w-full">
          {/* App icon + name */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-950 border border-teal-700/80 flex items-center justify-center text-teal-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold text-white">Sakhi Vault</span>
          </div>

          {/* Language toggle — no three-dots menu */}
          <button
            onClick={toggleLanguage}
            className="px-3 py-1.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition min-h-[36px]"
            aria-label="Toggle language"
          >
            {language === 'ur' ? 'English' : 'اردو'}
          </button>
        </div>
      </header>

      {/* Scrollable content area (leaves room for bottom bar) */}
      <main className="flex-1 overflow-y-auto px-4 py-5 max-w-lg mx-auto w-full pb-24">
        {bottomTab === 'home_tab' && (
          <HomeScreen
            cases={cases}
            onCreateCase={() => setShowNewCaseModal(true)}
            onAddEvidence={() => {
              if (!currentCase) {
                setShowNewCaseModal(true);
              } else {
                setPushView('intake');
              }
            }}
            onGoHelplines={() => setPushView('helplines')}
            onGoSettings={() => setPushView('settings')}
            onGoCircle={() => {
              if (cases.length === 0) {
                setShowNewCaseModal(true);
              } else {
                setPushView('circle');
              }
            }}
            onGoPrivacyNotice={() => setPushView('privacy')}
            onDeleteAll={() => setPushView('settings')}
            onPanicLock={onPanicLock}
            language={language}
            circleEnabled={featureFlags.circle}
            noCaseOpen={!currentCase}
            onNoCaseForEvidence={() => setShowNewCaseModal(true)}
          />
        )}

        {bottomTab === 'cases_tab' && (
          <CasesTab
            cases={cases}
            onSelectCase={(id) => {
              setActiveCaseId(id);
              setPushView('case');
            }}
            onCreateCase={() => setShowNewCaseModal(true)}
            language={language}
          />
        )}
      </main>

      {/* ── Bottom tab bar ─────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md safe-area-inset-bottom">
        <div className="max-w-lg mx-auto flex">
          {/* Home tab */}
          {(
            [
              { id: 'home_tab' as BottomTab, ur: 'ہوم', en: 'Home', Icon: Home, badge: 0 },
              { id: 'cases_tab' as BottomTab, ur: 'کیسز', en: 'Cases', Icon: FolderOpen, badge: cases.length },
            ]
          ).map(({ id, ur, en, Icon, badge }) => {
            const active = bottomTab === id;
            return (
              <button
                key={id}
                onClick={() => setBottomTab(id)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition min-h-[60px] ${
                  active ? 'text-teal-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <div className="relative">
                  <Icon className="w-6 h-6" />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2 w-4 h-4 rounded-full bg-teal-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-center leading-none">
                  <span className="font-urdu text-sm leading-snug">{ur}</span>
                  <span className="text-[10px] opacity-75">{en}</span>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── New Case Creation Modal ───────────────────────────────────── */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateCase}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-urdu text-xl text-white leading-snug">نئی فائل بنائیں</h3>
                <p className="text-sm text-slate-400 mt-0.5">Create New Case</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCaseModal(false)}
                className="text-slate-500 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              <span className="font-urdu block text-right text-slate-300 mb-1">
                ایک عام سا نام لکھیں — کوئی اصلی نام نہ ہو۔
              </span>
              Give this file a neutral or coded name (e.g. "Workplace Inquiry #104") to protect your privacy.
            </p>

            <input
              type="text"
              placeholder="e.g. Workplace Inquiry Ref #104"
              value={newCaseTitle}
              onChange={(e) => setNewCaseTitle(e.target.value)}
              required
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-teal-500 min-h-[48px]"
            />

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowNewCaseModal(false)}
                className="flex-1 py-3 text-sm rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 min-h-[56px] flex flex-col items-center justify-center"
              >
                <span className="font-urdu leading-snug">منسوخ</span>
                <span className="text-xs opacity-70">Cancel</span>
              </button>
              <button
                type="submit"
                className="flex-1 py-3 text-sm font-semibold rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-md min-h-[56px] flex flex-col items-center justify-center"
              >
                <span className="font-urdu leading-snug">بنائیں</span>
                <span className="text-xs opacity-80">Create</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
