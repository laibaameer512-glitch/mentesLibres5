import React, { useState, useEffect } from 'react';
import { VaultCase, saveRealCase, deleteRealCase } from '../lib/db.ts';
import { PanicBar } from './PanicBar.tsx';
import { EvidenceIntake } from './EvidenceIntake.tsx';
import { EvidenceReview } from './EvidenceReview.tsx';
import { LegalAdvicePanel } from './LegalAdvicePanel.tsx';
import { ComplaintGenerator } from './ComplaintGenerator.tsx';
import { HelplinesScreen } from './HelplinesScreen.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { CircleModule } from './CircleModule.tsx';
import { featureFlags } from '../featureFlags.ts';
import { redactTextLocally, restoreTextLocally } from '../lib/redact.ts';
import { findInCaseDuplicates } from '../lib/duplicates.ts';
import {
  Shield,
  FolderOpen,
  FileCheck,
  Scale,
  FileText,
  PhoneCall,
  Settings,
  Plus,
  Trash2,
  FolderPlus,
  Users,
} from 'lucide-react';

interface VaultDashboardProps {
  realKey: CryptoKey;
  cases: VaultCase[];
  onCasesUpdated: (cases: VaultCase[]) => void;
  onPanicLock: () => void;
  onOpenPinSetup: () => void;
  onNavigateCounselor?: () => void;
}

export type VaultTab = 'intake' | 'review' | 'circle' | 'legal' | 'complaint' | 'helplines' | 'settings';

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  realKey,
  cases,
  onCasesUpdated,
  onPanicLock,
  onOpenPinSetup,
  onNavigateCounselor,
}) => {
  const [activeTab, setActiveTab] = useState<VaultTab>('intake');
  const [activeCaseId, setActiveCaseId] = useState<string>(
    cases.length > 0 ? cases[0].id : ''
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [newCaseTitle, setNewCaseTitle] = useState('');

  const currentCase = cases.find((c) => c.id === activeCaseId) || cases[0] || null;

  // Pending duplicate count badge for Evidence Review screen
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

  // Create new case
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
    setActiveTab('intake');
  };

  // Update case
  const handleCaseUpdated = (updatedCase: VaultCase) => {
    const updatedList = cases.map((c) => (c.id === updatedCase.id ? updatedCase : c));
    onCasesUpdated(updatedList);
  };

  // Delete case
  const handleDeleteCase = async (caseId: string) => {
    if (!window.confirm('Are you sure you want to delete this entire case and its evidence?')) return;
    await deleteRealCase(caseId);
    const filtered = cases.filter((c) => c.id !== caseId);
    onCasesUpdated(filtered);
    if (filtered.length > 0) setActiveCaseId(filtered[0].id);
  };

  // Run AI Pipeline
  const runAiPipeline = async (c: VaultCase) => {
    setIsAnalyzing(true);
    try {
      // 1. Process items needing OCR or Transcription
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
          } catch (err) {
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
          } catch (err) {
            console.warn('Audio transcribe fallback for item:', item.id);
          }
        }

        const itemContent = item.ocrOrTranscriptText || item.content || item.notes || '';
        cumulativeText += `\n[${item.incidentDateTime}] ${item.platform} - ${item.personLabel}:\n${itemContent}\n`;
      }

      // 2. Client-side local redaction before sending to server extract/classify
      const userNames = [c.title, ...c.evidenceItems.map((e) => e.personLabel)];
      const { redactedText, mapping } = redactTextLocally(cumulativeText, userNames);

      // 3. Entity & Message Extraction
      const extractRes = await fetch('/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: redactedText, platform: 'WhatsApp' }),
      });
      const extractData = await extractRes.json();

      // 4. Classification
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

      // 5. 5-Line Summarization
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

      // 6. Chronological Timeline Merger
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
      const timelineData = await timelineRes.json();

      // Re-fill local placeholders for messages
      const unredactedMessages = (extractData.messages || []).map((m: any) => ({
        ...m,
        text: restoreTextLocally(m.text, mapping),
      }));

      const isAnyFallback = Boolean(
        extractData.isFallback ||
        classifyData.isFallback ||
        summarizeData.isFallback
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
      setActiveTab('review');
    } catch (err) {
      console.error('AI Pipeline error:', err);
      alert('AI Pipeline encountered an issue. Demo fallback records were preserved.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <PanicBar onPanicLock={onPanicLock} vaultType="real" />

      {/* Main Top Header */}
      <header className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-950 border border-teal-700/80 flex items-center justify-center text-teal-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
                <span>Sakhi Vault</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-teal-900/80 text-teal-300 border border-teal-700">
                  AES-GCM 256
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Encrypted evidence vault & complaint preparation system
              </p>
            </div>
          </div>

          {/* Case Selector Dropdown & New Case Button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <select
                value={activeCaseId}
                onChange={(e) => setActiveCaseId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500 font-medium"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.evidenceItems.length} items)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowNewCaseModal(true)}
              className="p-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-sm transition"
              title="Create New Case"
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            {currentCase && cases.length > 1 && (
              <button
                onClick={() => handleDeleteCase(currentCase.id)}
                className="p-1.5 bg-slate-800 hover:bg-red-900/80 text-slate-400 hover:text-red-300 rounded-xl border border-slate-700 transition"
                title="Delete Current Case"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs (Mobile-friendly horizontal scroll) */}
        <div className="max-w-5xl mx-auto mt-3 flex gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'intake', label: '1. Evidence Intake', icon: FolderOpen },
            { id: 'review', label: '2. AI Review', icon: FileCheck },
            ...(featureFlags.circle
              ? [{ id: 'circle', label: '3. Sakhi Circle', icon: Users }]
              : []),
            {
              id: 'legal',
              label: featureFlags.circle ? '4. Which Law May Apply' : '3. Which Law May Apply',
              icon: Scale,
            },
            {
              id: 'complaint',
              label: featureFlags.circle ? '5. Complaint Draft' : '4. Complaint Draft',
              icon: FileText,
            },
            { id: 'helplines', label: 'Helplines', icon: PhoneCall },
            { id: 'settings', label: 'Privacy & Wipe', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as VaultTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === 'review' && featureFlags.duplicateDetector && pendingDuplicatesCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                    {pendingDuplicatesCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-6">
        {currentCase ? (
          <>
            {activeTab === 'intake' && (
              <EvidenceIntake
                currentCase={currentCase}
                activeKey={realKey}
                onCaseUpdated={handleCaseUpdated}
                onRunAiPipeline={runAiPipeline}
                isAnalyzing={isAnalyzing}
              />
            )}

            {activeTab === 'review' && (
              <EvidenceReview
                currentCase={currentCase}
                activeKey={realKey}
                onCaseUpdated={handleCaseUpdated}
                onProceedToLegal={() => setActiveTab(featureFlags.circle ? 'circle' : 'legal')}
              />
            )}

            {activeTab === 'circle' && featureFlags.circle && (
              <CircleModule
                currentCase={currentCase}
                activeKey={realKey}
                onCaseUpdated={handleCaseUpdated}
              />
            )}

            {activeTab === 'legal' && (
              <LegalAdvicePanel
                currentCase={currentCase}
                onProceedToDraft={() => setActiveTab('complaint')}
              />
            )}

            {activeTab === 'complaint' && (
              <ComplaintGenerator currentCase={currentCase} />
            )}

            {activeTab === 'helplines' && <HelplinesScreen />}

            {activeTab === 'settings' && (
              <SettingsScreen
                onOpenPinSetup={onOpenPinSetup}
                onPanicLock={onPanicLock}
                onNavigateCounselor={onNavigateCounselor}
              />
            )}
          </>
        ) : (
          <div className="p-12 text-center text-xs text-slate-500">
            No active case selected. Click + to create a case.
          </div>
        )}
      </main>

      {/* New Case Creation Modal */}
      {showNewCaseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateCase}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-teal-400" />
              <span>Create New Case (Neutral Title)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Give this case record a neutral or coded reference title (e.g. "Workplace Inquiry #104", "Office Memo Notes") for privacy.
            </p>
            <input
              type="text"
              placeholder="e.g. Workplace Inquiry Ref #104"
              value={newCaseTitle}
              onChange={(e) => setNewCaseTitle(e.target.value)}
              required
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowNewCaseModal(false)}
                className="px-3.5 py-2 text-xs rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-md"
              >
                Create Case
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
