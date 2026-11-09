import React, { useState, useRef } from 'react';
import {
  VaultCase,
  EvidenceItem,
  saveRealCase,
} from '../lib/db.ts';
import { redactTextLocally } from '../lib/redact.ts';
import {
  Upload,
  Mic,
  FileText,
  Trash2,
  Calendar,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Square,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

interface EvidenceIntakeProps {
  currentCase: VaultCase;
  activeKey: CryptoKey;
  onCaseUpdated: (updatedCase: VaultCase) => void;
  onRunAiPipeline: (currentCase: VaultCase) => Promise<void>;
  isAnalyzing: boolean;
}

export const EvidenceIntake: React.FC<EvidenceIntakeProps> = ({
  currentCase,
  activeKey,
  onCaseUpdated,
  onRunAiPipeline,
  isAnalyzing,
}) => {
  // Intake Form States
  const [activeTab, setActiveTab] = useState<'screenshot' | 'audio' | 'text'>('screenshot');
  const [platform, setPlatform] = useState<EvidenceItem['platform']>('WhatsApp');
  const [incidentDateTime, setIncidentDateTime] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [personLabel, setPersonLabel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [selectedImageFile, setSelectedImageFile] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string>('image/png');

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Status feedback
  const [itemStatusMsg, setItemStatusMsg] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // 1. File Upload (Image)
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageFile(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 2. Audio File Upload
  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setRecordedAudioBase64(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 3. In-Browser Voice Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          setRecordedAudioBase64(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      alert('Microphone access unavailable or denied. You can also upload pre-recorded audio files.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  // 4. Save Evidence Item
  const handleAddEvidence = async (e: React.FormEvent) => {
    e.preventDefault();

    let contentPayload = '';
    let mime = 'text/plain';

    if (activeTab === 'screenshot') {
      if (!selectedImageFile) {
        alert('Please select or upload a screenshot.');
        return;
      }
      contentPayload = selectedImageFile;
      mime = selectedImageMime;
    } else if (activeTab === 'audio') {
      if (!recordedAudioBase64) {
        alert('Please record audio or upload an audio voice note.');
        return;
      }
      contentPayload = recordedAudioBase64;
      mime = 'audio/webm';
    } else {
      if (!pastedText.trim()) {
        alert('Please paste message transcript text.');
        return;
      }
      contentPayload = pastedText.trim();
      mime = 'text/plain';
    }

    const newItem: EvidenceItem = {
      id: `ev-${Date.now()}`,
      type: activeTab,
      platform,
      incidentDateTime,
      personLabel: personLabel.trim() || 'Unidentified Contact',
      notes: notes.trim(),
      content: contentPayload,
      mimeType: mime,
    };

    const updatedCase: VaultCase = {
      ...currentCase,
      updatedAt: new Date().toISOString(),
      evidenceItems: [newItem, ...currentCase.evidenceItems],
    };

    await saveRealCase(activeKey, updatedCase);
    onCaseUpdated(updatedCase);

    // Reset Form
    setSelectedImageFile(null);
    setRecordedAudioBase64(null);
    setPastedText('');
    setNotes('');
    setPersonLabel('');
    setItemStatusMsg('Evidence record securely encrypted and added.');
    setTimeout(() => setItemStatusMsg(null), 3500);
  };

  // 5. Delete Evidence Item
  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    const filtered = currentCase.evidenceItems.filter((i) => i.id !== itemToDelete);
    const updatedCase: VaultCase = {
      ...currentCase,
      updatedAt: new Date().toISOString(),
      evidenceItems: filtered,
    };
    await saveRealCase(activeKey, updatedCase);
    onCaseUpdated(updatedCase);
    setItemToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Local Encryption & Honest Redaction Notice */}
      <div className="p-3.5 bg-teal-950/40 border border-teal-800/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-teal-200">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            Screenshots and audio are sent to an AI provider for text extraction. Phone numbers, emails and CNICs are redacted from text before further AI analysis. Names are redacted only if you mark them.
          </span>
        </div>
        <span className="text-[11px] text-teal-400/80 font-mono shrink-0 hidden md:inline">
          {currentCase.evidenceItems.length} records preserved
        </span>
      </div>

      {/* Visible AI Unavailable Fallback Banner if case has fallback AI outputs */}
      {currentCase.extractedReview?.isFallback && (
        <div className="p-3.5 bg-amber-950/80 border-2 border-amber-600/90 rounded-2xl flex items-center gap-3 text-xs text-amber-100 shadow-md">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-bold text-amber-300 uppercase tracking-wider block">
              AI unavailable, using sample result
            </span>
            <span className="text-amber-200/90">
              Offline mode or Gemini model unavailable; displaying pre-cached sample extraction outputs.
            </span>
          </div>
        </div>
      )}

      {itemStatusMsg && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-800 rounded-xl text-xs text-emerald-200 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{itemStatusMsg}</span>
        </div>
      )}

      {/* INTAKE FORM */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <span>Add New Evidence Item</span>
        </h2>

        {/* Tab Buttons */}
        <div className="flex gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-4">
          <button
            type="button"
            onClick={() => setActiveTab('screenshot')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'screenshot'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Screenshot</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audio')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'audio'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice / Call</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              activeTab === 'text'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Pasted Chat</span>
          </button>
        </div>

        <form onSubmit={handleAddEvidence} className="space-y-4">
          {/* TAB 1: Screenshot Upload */}
          {activeTab === 'screenshot' && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                Upload Chat Screenshot / Image (WhatsApp, Instagram, etc.)
              </label>
              <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-xl p-4 text-center bg-slate-950/60 transition">
                {selectedImageFile ? (
                  <div className="space-y-2">
                    <img
                      src={selectedImageFile}
                      alt="Uploaded screenshot"
                      className="max-h-52 mx-auto rounded-lg shadow-md border border-slate-800 object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedImageFile(null)}
                      className="text-xs text-red-400 hover:underline"
                    >
                      Remove and choose another
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-7 h-7 text-slate-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-400 mb-2">
                      Drop screenshot or browse file (PNG, JPG, WebP)
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white hover:file:bg-teal-600"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Audio Recording & Upload */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-300">
                Voice Note (Urdu / English) or Audio Call Record
              </label>
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-red-600/30 border-2 border-red-500 animate-pulse flex items-center justify-center text-red-400">
                        <Square className="w-5 h-5 fill-current" />
                      </div>
                      <span className="text-xs text-red-400 font-mono font-bold">
                        Recording in progress: {recordingSeconds}s
                      </span>
                      <p className="text-[11px] text-slate-400 font-urdu">
                        اردو یا رومن اردو میں پیغام ریکارڈ کریں
                      </p>
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition"
                      >
                        Finish Recording
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                      >
                        <Mic className="w-4 h-4" />
                        <span>Record Voice Note (Urdu)</span>
                      </button>
                      <span className="text-[11px] text-slate-500">
                        Or upload audio file (.ogg, .m4a, .mp3, .wav)
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <input
                    type="file"
                    accept="audio/*,.ogg,.m4a,.mp3,.wav"
                    onChange={handleAudioFileChange}
                    className="text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                  />
                  {recordedAudioBase64 && (
                    <div className="mt-2 text-xs text-emerald-400 flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Audio voice note ready to attach</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Pasted Text */}
          {activeTab === 'text' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                Paste Chat Transcript or Threatening Messages
              </label>
              <textarea
                placeholder="e.g. 15/10/2026, 10:14 PM - Accused: Agar kal meeting mein..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono resize-none"
              />
            </div>
          )}

          {/* Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as EvidenceItem['platform'])}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="Instagram">Instagram</option>
                <option value="SMS">SMS / Text</option>
                <option value="Call">Phone Call</option>
                <option value="Other">Other / Email</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Incident Date / Time (Editable)
              </label>
              <input
                type="datetime-local"
                value={incidentDateTime}
                onChange={(e) => setIncidentDateTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Person Involved (Label / Identifier)
              </label>
              <input
                type="text"
                placeholder="e.g. +92 300... or Handle"
                value={personLabel}
                onChange={(e) => setPersonLabel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Context Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Received following missed calls; threats to disclose private media"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Encrypt & Attach to Case</span>
            </button>
          </div>
        </form>
      </div>

      {/* ACTION: RUN AI PIPELINE */}
      <div className="p-4 bg-gradient-to-r from-teal-950/70 via-slate-900 to-slate-900 border border-teal-800/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span>AI Evidence Processing Pipeline</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Runs OCR, Urdu audio transcription, chronological timeline normalization, and multi-label legal classification.
          </p>
        </div>
        <button
          onClick={() => onRunAiPipeline(currentCase)}
          disabled={isAnalyzing || currentCase.evidenceItems.length === 0}
          className="w-full sm:w-auto px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-xl shadow-lg transition flex items-center justify-center gap-2 shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>{isAnalyzing ? 'Analyzing Evidence...' : 'Run Analysis Pipeline'}</span>
        </button>
      </div>

      {/* SAVED EVIDENCE ITEMS LIST */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center justify-between">
          <span>Attached Evidence Records ({currentCase.evidenceItems.length})</span>
          <span className="text-[11px] text-slate-500 font-normal">Sorted newest first</span>
        </h3>

        {currentCase.evidenceItems.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-500">
            No evidence items attached to this case yet. Use the form above or load demo records.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {currentCase.evidenceItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 flex flex-col justify-between gap-2.5 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-teal-400 border border-slate-700">
                      {item.platform}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 truncate max-w-[170px]">
                      {item.personLabel}
                    </span>
                  </div>
                  <button
                    onClick={() => setItemToDelete(item.id)}
                    className="text-slate-500 hover:text-red-400 p-1 transition"
                    title="Delete item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {item.type === 'screenshot' && (
                  <div className="h-32 w-full bg-slate-950 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                    <img
                      src={item.content}
                      alt="Screenshot evidence"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                )}

                {item.type === 'audio' && (
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-xs text-teal-300 font-mono">
                    🎵 Audio Voice Recording ({item.platform})
                  </div>
                )}

                {item.type === 'text' && (
                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-300 font-mono line-clamp-3">
                    {item.content}
                  </div>
                )}

                {item.ocrOrTranscriptText && (
                  <div className="p-2 bg-slate-950/70 border border-slate-800/80 rounded text-[11px] text-slate-400">
                    <span className="font-semibold text-teal-400 text-[10px] uppercase block mb-0.5">
                      Extracted Text / Transcript:
                    </span>
                    <p className="line-clamp-2">{item.ocrOrTranscriptText}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-800/60">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {item.incidentDateTime.replace('T', ' ')}
                  </span>
                  {item.notes && <span className="truncate max-w-[130px] italic">{item.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Delete */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-200 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span>Confirm Delete Evidence Item</span>
            </h4>
            <p className="text-xs text-slate-400">
              Are you sure you want to permanently delete this encrypted evidence record? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteItem}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
