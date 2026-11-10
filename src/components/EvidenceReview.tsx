import React, { useState, useEffect } from 'react';
import { VaultCase, saveRealCase } from '../lib/db.ts';
import { featureFlags } from '../featureFlags.ts';
import { InCaseDuplicateMatch } from '../types/shared.ts';
import {
  findInCaseDuplicates,
  mergeEvidenceItemsInCase,
  keepEvidenceItemsApartInCase,
  undoEvidenceDecisionInCase,
} from '../lib/duplicates.ts';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Plus,
  Save,
  Tag,
  Languages,
  Clock,
  Shield,
  FileCheck,
  Copy,
  ChevronDown,
  ChevronUp,
  GitMerge,
  Split,
  RotateCcw,
} from 'lucide-react';

interface EvidenceReviewProps {
  currentCase: VaultCase;
  activeKey: CryptoKey;
  onCaseUpdated: (c: VaultCase) => void;
  onProceedToLegal: () => void;
}

export const EvidenceReview: React.FC<EvidenceReviewProps> = ({
  currentCase,
  activeKey,
  onCaseUpdated,
  onProceedToLegal,
}) => {
  const review = currentCase.extractedReview;

  // Local state for interactive editing
  const [messages, setMessages] = useState(review?.messages || []);
  const [threats, setThreats] = useState(review?.threats || []);
  const [demands, setDemands] = useState(review?.demands || []);
  const [summaryLines, setSummaryLines] = useState(review?.summary5Lines || []);
  const [labels, setLabels] = useState(review?.classificationLabels || []);

  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgText, setEditMsgText] = useState('');
  const [editMsgSpeaker, setEditMsgSpeaker] = useState('');
  const [editMsgTime, setEditMsgTime] = useState('');

  const [newThreat, setNewThreat] = useState('');
  const [newDemand, setNewDemand] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // Duplicate Detector State (client-side in-case comparison)
  const [activeTab, setActiveTab] = useState<'review' | 'duplicates'>('review');
  const [duplicateMatches, setDuplicateMatches] = useState<InCaseDuplicateMatch[]>([]);
  const [expandedReasons, setExpandedReasons] = useState<Record<string, boolean>>({});
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'pending' | 'merged' | 'kept'>('all');

  useEffect(() => {
    if (review) {
      setMessages(review.messages || []);
      setThreats(review.threats || []);
      setDemands(review.demands || []);
      setSummaryLines(review.summary5Lines || []);
      setLabels(review.classificationLabels || []);
    }
  }, [review]);

  useEffect(() => {
    if (featureFlags.duplicateDetector && currentCase.evidenceItems.length > 1) {
      findInCaseDuplicates(currentCase.evidenceItems, currentCase.duplicateDecisions)
        .then(setDuplicateMatches)
        .catch((err) => console.warn('In-case duplicate detection error:', err));
    } else {
      setDuplicateMatches([]);
    }
  }, [currentCase.evidenceItems, currentCase.duplicateDecisions]);

  const pendingDuplicatesCount = duplicateMatches.filter((m) => !m.decision).length;

  const toggleReasons = (pairId: string) => {
    setExpandedReasons((prev) => ({ ...prev, [pairId]: !prev[pairId] }));
  };

  const handleMergeDuplicate = async (match: InCaseDuplicateMatch) => {
    const updated = mergeEvidenceItemsInCase(currentCase, match.pairId, match.itemAId, match.itemBId);
    await saveRealCase(activeKey, updated);
    onCaseUpdated(updated);
    if (updated.extractedReview?.messages) {
      setMessages(updated.extractedReview.messages);
    }
  };

  const handleKeepDuplicateApart = async (match: InCaseDuplicateMatch) => {
    const updated = keepEvidenceItemsApartInCase(currentCase, match.pairId);
    await saveRealCase(activeKey, updated);
    onCaseUpdated(updated);
  };

  const handleUndoDuplicateDecision = async (match: InCaseDuplicateMatch) => {
    const updated = undoEvidenceDecisionInCase(currentCase, match.pairId);
    await saveRealCase(activeKey, updated);
    onCaseUpdated(updated);
    if (updated.extractedReview?.messages) {
      setMessages(updated.extractedReview.messages);
    }
  };

  // Message Actions
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= messages.length) return;
    const copy = [...messages];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    setMessages(copy);
  };

  const handleDeleteMsg = (id: string) => {
    setMessages(messages.filter((m) => m.id !== id));
  };

  const startEditMsg = (m: (typeof messages)[0]) => {
    setEditingMsgId(m.id);
    setEditMsgText(m.text);
    setEditMsgSpeaker(m.speaker);
    setEditMsgTime(m.timestamp);
  };

  const saveEditMsg = () => {
    if (!editingMsgId) return;
    setMessages(
      messages.map((m) =>
        m.id === editingMsgId
          ? {
              ...m,
              text: editMsgText,
              speaker: editMsgSpeaker,
              timestamp: editMsgTime,
            }
          : m
      )
    );
    setEditingMsgId(null);
  };

  const toggleThreat = (id: string) => {
    setMessages(
      messages.map((m) => (m.id === id ? { ...m, isThreat: !m.isThreat } : m))
    );
  };

  // Threats & Demands
  const handleAddThreat = () => {
    if (!newThreat.trim()) return;
    setThreats([...threats, newThreat.trim()]);
    setNewThreat('');
  };

  const handleDeleteThreat = (index: number) => {
    setThreats(threats.filter((_, i) => i !== index));
  };

  const handleAddDemand = () => {
    if (!newDemand.trim()) return;
    setDemands([...demands, newDemand.trim()]);
    setNewDemand('');
  };

  const handleDeleteDemand = (index: number) => {
    setDemands(demands.filter((_, i) => i !== index));
  };

  // Save all modifications back into encrypted IndexedDB
  const handleSaveChanges = async () => {
    const updatedReview = {
      ...review,
      platform: review?.platform || 'Direct Messages',
      identifiers: review?.identifiers || [],
      messages,
      threats,
      demands,
      summary5Lines: summaryLines,
      classificationLabels: labels,
    };

    const updatedCase: VaultCase = {
      ...currentCase,
      updatedAt: new Date().toISOString(),
      extractedReview: updatedReview,
    };

    await saveRealCase(activeKey, updatedCase);
    onCaseUpdated(updatedCase);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Save Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-teal-400" />
            <span>ثبوت کا جائزہ اور ترمیم / Evidence Review & Editing</span>
          </h2>
          <p className="text-xs text-slate-400">
            Verify, reorder, or edit every message and category before proceeding to legal assessment.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleSaveChanges}
            className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold rounded-xl border border-teal-700/60 transition flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaved ? 'Saved & Encrypted!' : 'Save Review Changes'}</span>
          </button>
          <button
            onClick={onProceedToLegal}
            className="flex-1 sm:flex-none px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl transition shadow-md flex items-center justify-center gap-1.5"
          >
            <span>قانونی جائزہ دیکھیں / Proceed to Legal Review</span>
          </button>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      {featureFlags.duplicateDetector && (
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('review')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'review'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>پیغامات اور ٹائم لائن / Timeline & Messages</span>
          </button>

          <button
            onClick={() => setActiveTab('duplicates')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'duplicates'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate Detector</span>
            {pendingDuplicatesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                {pendingDuplicatesCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* VIEW 1: TIMELINE & MESSAGES REVIEW */}
      {activeTab === 'review' && (
        <>
          {!review ? (
            <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center space-y-3 bg-slate-900/40">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h3 className="text-sm font-semibold text-white">ابھی کوئی ریکارڈ دستیاب نہیں / No Records Available Yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Please analyse evidence first to populate messages, threats, and legal categories.
              </p>
            </div>
          ) : (
            <>
              {/* SECTION 1: EXTRACTED MESSAGES & TIMELINE ORDER */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400" />
            <span>Chronological Messages & Utterances ({messages.length})</span>
          </h3>
          <span className="text-[11px] text-slate-500">
            Use arrows to reorder • Mark threats
          </span>
        </div>

        <div className="space-y-2.5">
          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`p-3.5 rounded-xl border transition ${
                msg.isThreat
                  ? 'bg-red-950/30 border-red-800/60'
                  : 'bg-slate-950/70 border-slate-800'
              }`}
            >
              {editingMsgId === msg.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editMsgSpeaker}
                      onChange={(e) => setEditMsgSpeaker(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                      placeholder="Speaker (e.g. Accused)"
                    />
                    <input
                      type="text"
                      value={editMsgTime}
                      onChange={(e) => setEditMsgTime(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white"
                      placeholder="Timestamp"
                    />
                  </div>
                  <textarea
                    value={editMsgText}
                    onChange={(e) => setEditMsgText(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingMsgId(null)}
                      className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveEditMsg}
                      className="px-3 py-1 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200">
                        {msg.speaker}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {msg.timestamp}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                        {msg.language}
                      </span>
                      {msg.isThreat && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-900/80 text-red-200 border border-red-700">
                          COERCIVE THREAT
                        </span>
                      )}
                      {msg.linkedEvidenceIds && msg.linkedEvidenceIds.length > 1 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-teal-900/80 text-teal-200 border border-teal-700 flex items-center gap-1">
                          <GitMerge className="w-2.5 h-2.5" />
                          <span>Merged ({msg.linkedEvidenceIds.length} sources)</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {msg.text}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleThreat(msg.id)}
                      title="Toggle Threat Marker"
                      className={`p-1 rounded text-xs transition ${
                        msg.isThreat
                          ? 'text-red-400 hover:bg-red-950'
                          : 'text-slate-500 hover:text-red-400 hover:bg-slate-800'
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(idx, 'up')}
                      disabled={idx === 0}
                      title="Move Earlier"
                      className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMove(idx, 'down')}
                      disabled={idx === messages.length - 1}
                      title="Move Later"
                      className="p-1 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => startEditMsg(msg)}
                      title="Edit Message"
                      className="p-1 rounded text-slate-500 hover:text-teal-400"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMsg(msg.id)}
                      title="Delete Message"
                      className="p-1 rounded text-slate-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: THREATS & DEMANDS LISTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Threats */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Coercive Threats ({threats.length})</span>
          </h4>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {threats.map((threat, i) => (
              <div
                key={i}
                className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between gap-2 text-xs text-slate-200"
              >
                <span>{threat}</span>
                <button
                  onClick={() => handleDeleteThreat(i)}
                  className="text-slate-500 hover:text-red-400 p-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add threat manually..."
              value={newThreat}
              onChange={(e) => setNewThreat(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
            <button
              onClick={handleAddThreat}
              className="px-3 py-1.5 bg-red-950/80 border border-red-800 text-red-300 rounded-lg text-xs font-semibold"
            >
              Add
            </button>
          </div>
        </div>

        {/* Demands */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            <span>Extortion Demands ({demands.length})</span>
          </h4>
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            {demands.map((demand, i) => (
              <div
                key={i}
                className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between gap-2 text-xs text-slate-200"
              >
                <span>{demand}</span>
                <button
                  onClick={() => handleDeleteDemand(i)}
                  className="text-slate-500 hover:text-red-400 p-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add demand manually..."
              value={newDemand}
              onChange={(e) => setNewDemand(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
            />
            <button
              onClick={handleAddDemand}
              className="px-3 py-1.5 bg-amber-950/80 border border-amber-800 text-amber-300 rounded-lg text-xs font-semibold"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: MULTI-LABEL CLASSIFICATION CARDS */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-400" />
            <span>قانونی زمرے / Legal Categories</span>
          </h3>
          <span className="text-[11px] text-slate-500">
            Backed by specific quotes from evidence
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {labels.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-xl space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-teal-300 uppercase tracking-wide">
                  {item.category}
                </span>
                <span className="text-[11px] font-mono font-bold text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800/60">
                  {Math.round(item.confidence * 100)}% match
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{item.reason}</p>
              {item.linkedQuotes && item.linkedQuotes.length > 0 && (
                <div className="p-2 bg-slate-900 rounded border border-slate-800/60 text-[11px] text-slate-400 italic">
                  "{item.linkedQuotes[0]}"
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: 5-LINE CASE SUMMARY */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <span>کیس کا خلاصہ / Case Summary</span>
        </h3>
        <div className="space-y-2">
          {summaryLines.map((line, idx) => (
            <div
              key={idx}
              className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed font-sans"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
            </>
          )}
        </>
      )}

      {/* DUPLICATE DETECTOR TAB */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Copy className="w-4 h-4 text-teal-400" />
                <span>In-Case Duplicate Evidence Detector</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Compares text, images, and timestamps across evidence items to find possible duplicates.
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              <button
                onClick={() => setDuplicateFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  duplicateFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({duplicateMatches.length})
              </button>
              <button
                onClick={() => setDuplicateFilter('pending')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  duplicateFilter === 'pending' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Pending ({duplicateMatches.filter((m) => !m.decision).length})
              </button>
              <button
                onClick={() => setDuplicateFilter('merged')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  duplicateFilter === 'merged' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Merged ({duplicateMatches.filter((m) => m.decision === 'merge').length})
              </button>
              <button
                onClick={() => setDuplicateFilter('kept')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                  duplicateFilter === 'kept' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Kept Apart ({duplicateMatches.filter((m) => m.decision === 'keep').length})
              </button>
            </div>
          </div>

          {duplicateMatches.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
              No potential duplicates detected (threshold &ge; 60%). Evidence items appear sufficiently distinct.
            </div>
          ) : (
            <div className="space-y-3">
              {duplicateMatches
                .filter((m) => {
                  if (duplicateFilter === 'pending') return !m.decision;
                  if (duplicateFilter === 'merged') return m.decision === 'merge';
                  if (duplicateFilter === 'kept') return m.decision === 'keep';
                  return true;
                })
                .map((match) => (
                  <div
                    key={match.pairId}
                    className={`bg-slate-900 border rounded-2xl p-4 transition shadow-sm space-y-3 ${
                      match.decision === 'merge'
                        ? 'border-teal-700/80 bg-teal-950/15'
                        : match.decision === 'keep'
                        ? 'border-slate-800 bg-slate-950/40 opacity-75'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* 1. MATCH NN% */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-base font-extrabold text-white font-mono">
                          Match {match.score}%
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-950 text-teal-300 border border-teal-700/80">
                          {match.score >= 80 ? 'High Confidence Duplicate' : 'Moderate Duplicate Risk'}
                        </span>
                        {match.decision && (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                              match.decision === 'merge'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {match.decision === 'merge' ? 'Merged in Timeline' : 'Kept Apart'}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-teal-400">
                          {match.itemALabel}
                        </span>
                        <span className="text-slate-600">vs</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-teal-400">
                          {match.itemBLabel}
                        </span>
                      </div>
                    </div>

                    {/* 2. WHY IT MATCHES */}
                    <div className="space-y-1.5">
                      <button
                        onClick={() => toggleReasons(match.pairId)}
                        className="text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition"
                      >
                        <span>Why it matches</span>
                        {expandedReasons[match.pairId] ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {(expandedReasons[match.pairId] ?? true) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                          {match.reasons.map((reason, rIdx) => (
                            <div
                              key={rIdx}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-300 flex items-center gap-2"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 3 & 4. MERGE & KEEP ACTIONS */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                      <div className="text-[11px] text-slate-500">
                        {match.decision === 'merge'
                          ? 'Items combined into a single timeline event.'
                          : match.decision === 'keep'
                          ? 'Items marked as distinct evidence.'
                          : 'Pending your review decision.'}
                      </div>

                      <div className="flex items-center gap-2">
                        {match.decision ? (
                          <button
                            onClick={() => handleUndoDuplicateDecision(match)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Undo</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => handleMergeDuplicate(match)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                            >
                              <GitMerge className="w-3.5 h-3.5" />
                              <span>Merge</span>
                            </button>
                            <button
                              onClick={() => handleKeepDuplicateApart(match)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 transition"
                            >
                              <Split className="w-3.5 h-3.5" />
                              <span>Keep</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
