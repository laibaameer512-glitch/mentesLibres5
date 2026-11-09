import React, { useState } from 'react';
import { VaultCase, saveRealCase } from '../lib/db.ts';
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

  if (!review) {
    return (
      <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center space-y-3 bg-slate-900/40">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <h3 className="text-sm font-semibold text-white">No AI Extraction Records Available Yet</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          Please run the AI Evidence Processing Pipeline from the Evidence Intake tab or load the demo dataset to populate parsed messages, threats, and legal classifications.
        </p>
      </div>
    );
  }

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
      {/* Visible AI Unavailable Fallback Banner */}
      {review?.isFallback && (
        <div className="p-3.5 bg-amber-950/80 border-2 border-amber-600/90 rounded-2xl flex items-center gap-3 text-xs text-amber-100 shadow-md">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-300 uppercase tracking-wider block">
              AI unavailable, using sample result
            </span>
            <span className="text-amber-200/90">
              Offline mode or Gemini model unavailable; displaying pre-cached sample extraction for this case.
            </span>
          </div>
        </div>
      )}

      {/* Top Banner with Save Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm">
        <div>
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-teal-400" />
            <span>Interactive Evidence Review & Sanitization</span>
          </h2>
          <p className="text-xs text-slate-400">
            Verify, reorder, or edit every extracted message and label before proceeding to legal assessment.
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
            <span>Proceed to Legal Grounding</span>
          </button>
        </div>
      </div>

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
            <span>Extracted Coercive Threats ({threats.length})</span>
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
            <span>Extracted Extortion Demands ({demands.length})</span>
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
            <span>AI Multi-Label Classification Tags</span>
          </h3>
          <span className="text-[11px] text-slate-500">
            Backed by specific evidentiary quotes
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
          <span>5-Line Plain-Language Case Facts Summary</span>
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
    </div>
  );
};
