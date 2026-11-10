import React, { useState, useRef } from 'react';
import {
  VaultCase,
  EvidenceItem,
  saveRealCase,
} from '../lib/db.ts';
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
  Camera,
  Square,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface EvidenceIntakeProps {
  currentCase: VaultCase;
  activeKey: CryptoKey;
  onCaseUpdated: (updatedCase: VaultCase) => void;
  onRunAiPipeline: (currentCase: VaultCase) => Promise<void>;
  isAnalyzing: boolean;
  initialTab?: 'screenshot' | 'photo' | 'audio' | 'text';
}

export const EvidenceIntake: React.FC<EvidenceIntakeProps> = ({
  currentCase,
  activeKey,
  onCaseUpdated,
  onRunAiPipeline,
  isAnalyzing,
  initialTab = 'screenshot',
}) => {
  // Intake Form States
  const [activeTab, setActiveTab] = useState<'screenshot' | 'photo' | 'audio' | 'text'>(initialTab);
  const [platform, setPlatform] = useState<EvidenceItem['platform']>(
    initialTab === 'photo' ? 'Other' : 'WhatsApp'
  );
  const [incidentDateTime, setIncidentDateTime] = useState<string>(
    new Date().toISOString().slice(0, 16)
  );
  const [personLabel, setPersonLabel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [selectedImageFile, setSelectedImageFile] = useState<string | null>(null);
  const [selectedImageMime, setSelectedImageMime] = useState<string>('image/png');

  // Collapsible metadata section
  const [showDetails, setShowDetails] = useState(false);

  // Audio Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);

  // Hidden file input refs for Photo tab
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Status feedback
  const [itemStatusMsg, setItemStatusMsg] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Handle Tab Switch
  const handleTabChange = (newTab: 'screenshot' | 'photo' | 'audio' | 'text') => {
    setActiveTab(newTab);
    if (newTab === 'photo' && platform === 'WhatsApp') {
      setPlatform('Other');
    } else if (newTab === 'screenshot' && platform === 'Other') {
      setPlatform('WhatsApp');
    }
  };

  // 1. File Upload (Image)
  const handleImageFile = (file: File) => {
    setSelectedImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImageFile(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
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
    } catch {
      alert('Microphone access unavailable or denied. You can also upload audio files.');
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

    if (activeTab === 'screenshot' || activeTab === 'photo') {
      if (!selectedImageFile) {
        alert(
          activeTab === 'photo'
            ? 'براہ کرم تصویر منتخب کریں / Please select or take a photo.'
            : 'براہ کرم اسکرین شاٹ منتخب کریں / Please select or upload a screenshot.'
        );
        return;
      }
      contentPayload = selectedImageFile;
      mime = selectedImageMime;
    } else if (activeTab === 'audio') {
      if (!recordedAudioBase64) {
        alert('براہ کرم آواز ریکارڈ کریں یا آڈیو فائل اپلوڈ کریں / Please record or upload audio.');
        return;
      }
      contentPayload = recordedAudioBase64;
      mime = 'audio/webm';
    } else {
      if (!pastedText.trim()) {
        alert('براہ کرم میسج کا متن درج کریں / Please paste message text.');
        return;
      }
      contentPayload = pastedText.trim();
      mime = 'text/plain';
    }

    // Notice: Both 'screenshot' and 'photo' store as 'screenshot' in the existing db schema
    const itemType: EvidenceItem['type'] =
      activeTab === 'audio' ? 'audio' : activeTab === 'text' ? 'text' : 'screenshot';

    const newItem: EvidenceItem = {
      id: `ev-${Date.now()}`,
      type: itemType,
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
    setItemStatusMsg('ثبوت محفوظ کر لیا گیا ہے / Evidence record encrypted & saved.');
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
      {/* Shortened Plain-Language Bilingual Privacy Notice */}
      <div className="p-3.5 bg-teal-950/40 border border-teal-800/60 rounded-2xl flex items-start gap-3 text-xs text-teal-200">
        <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-urdu text-sm text-teal-100 leading-snug">
            آپ کا ڈیٹا ڈیوائس پر محفوظ اور انکرپٹڈ رہتا ہے۔ حساس معلومات (فون نمبرز، شناختی کارڈ) خودکار طور پر چھپائی جاتی ہیں۔
          </p>
          <p className="text-[11px] text-teal-300/80 leading-relaxed">
            Your evidence stays encrypted on your device. Phone numbers and personal IDs are automatically protected.
          </p>
        </div>
      </div>

      {itemStatusMsg && (
        <div className="p-3.5 bg-emerald-950/70 border border-emerald-800 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{itemStatusMsg}</span>
        </div>
      )}

      {/* INTAKE FORM */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-sm space-y-4">
        <div>
          <h2 className="font-urdu text-lg text-white leading-snug">نیا ثبوت شامل کریں</h2>
          <span className="text-xs text-slate-400">Add New Evidence Item</span>
        </div>

        {/* 4 Tabs in exact order: Screenshot, Photo, Voice/Call, Pasted Chat */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
          {/* Tab 1: Screenshot */}
          <button
            type="button"
            onClick={() => handleTabChange('screenshot')}
            className={`py-2.5 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition min-h-[56px] ${
              activeTab === 'screenshot'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="font-urdu leading-tight text-sm">اسکرین شاٹ</span>
            </div>
            <span className="text-[10px] opacity-80">Screenshot</span>
          </button>

          {/* Tab 2: Photo (NEW) */}
          <button
            type="button"
            onClick={() => handleTabChange('photo')}
            className={`py-2.5 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition min-h-[56px] ${
              activeTab === 'photo'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              <span className="font-urdu leading-tight text-sm">تصویر</span>
            </div>
            <span className="text-[10px] opacity-80">Photo</span>
          </button>

          {/* Tab 3: Voice / Call */}
          <button
            type="button"
            onClick={() => handleTabChange('audio')}
            className={`py-2.5 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition min-h-[56px] ${
              activeTab === 'audio'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" />
              <span className="font-urdu leading-tight text-sm">آواز</span>
            </div>
            <span className="text-[10px] opacity-80">Voice / Call</span>
          </button>

          {/* Tab 4: Pasted Chat */}
          <button
            type="button"
            onClick={() => handleTabChange('text')}
            className={`py-2.5 px-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center gap-0.5 transition min-h-[56px] ${
              activeTab === 'text'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span className="font-urdu leading-tight text-sm">چیٹ ٹیکسٹ</span>
            </div>
            <span className="text-[10px] opacity-80">Pasted Chat</span>
          </button>
        </div>

        {/* Short help line under active tab */}
        <p className="text-xs text-slate-400 px-1">
          {activeTab === 'screenshot' && (
            <span>
              <span className="font-urdu block text-slate-300">چیٹ میسجز کے اسکرین شاٹ (واٹس ایپ، انسٹاگرام وغیرہ)</span>
              Chat screenshots of messages, threats, or profile pages
            </span>
          )}
          {activeTab === 'photo' && (
            <span>
              <span className="font-urdu block text-slate-300">نوٹ، جگہ، تحریر یا کسی چیز کی تصویر</span>
              Photo of a note, letter, place, damaged item, or printed document
            </span>
          )}
          {activeTab === 'audio' && (
            <span>
              <span className="font-urdu block text-slate-300">صوتی پیغام یا کال ریکارڈنگ (اردو یا انگلش)</span>
              Voice note or recorded call audio (Urdu or English)
            </span>
          )}
          {activeTab === 'text' && (
            <span>
              <span className="font-urdu block text-slate-300">کاپی شدہ پیغامات یا چیٹ کا متن</span>
              Pasted chat text transcript or messages
            </span>
          )}
        </p>

        <form onSubmit={handleAddEvidence} className="space-y-4">
          {/* TAB 1: Screenshot Upload */}
          {activeTab === 'screenshot' && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-slate-800 hover:border-slate-700 rounded-2xl p-5 text-center bg-slate-950/60 transition">
                {selectedImageFile ? (
                  <div className="space-y-2">
                    <img
                      src={selectedImageFile}
                      alt="Uploaded screenshot"
                      className="max-h-56 mx-auto rounded-xl shadow-md border border-slate-800 object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedImageFile(null)}
                      className="text-xs text-red-400 hover:underline pt-1 block mx-auto min-h-[36px]"
                    >
                      <span className="font-urdu">ہٹائیں اور دوسری تصویر چنیں</span> / Remove and choose another
                    </button>
                  </div>
                ) : (
                  <div>
                    <Upload className="w-8 h-8 text-teal-400 mx-auto mb-2" />
                    <p className="text-xs text-slate-300 font-medium mb-3">
                      <span className="font-urdu block text-sm mb-0.5">اسکرین شاٹ فائل منتخب کریں</span>
                      Choose screenshot file (PNG, JPG, WebP)
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-teal-700 file:text-white hover:file:bg-teal-600"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Photo Upload (Camera / Gallery) */}
          {activeTab === 'photo' && (
            <div className="space-y-3">
              {selectedImageFile ? (
                <div className="border border-slate-800 rounded-2xl p-4 text-center bg-slate-950/60 space-y-2">
                  <img
                    src={selectedImageFile}
                    alt="Captured photo"
                    className="max-h-56 mx-auto rounded-xl shadow-md border border-slate-800 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedImageFile(null)}
                    className="text-xs text-red-400 hover:underline pt-1 block mx-auto min-h-[36px]"
                  >
                    <span className="font-urdu">ہٹائیں اور دوسری تصویر لیں</span> / Remove and retake
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Take Photo with Camera */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-2xl transition min-h-[90px] text-center"
                  >
                    <div className="w-11 h-11 rounded-xl bg-teal-950 border border-teal-800/60 flex items-center justify-center text-teal-400">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-urdu text-base text-white leading-snug block">کیمرے سے تصویر</span>
                      <span className="text-xs text-slate-400">Take Photo</span>
                    </div>
                  </button>

                  {/* Choose from Gallery */}
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 p-5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 rounded-2xl transition min-h-[90px] text-center"
                  >
                    <div className="w-11 h-11 rounded-xl bg-teal-950 border border-teal-800/60 flex items-center justify-center text-teal-400">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-urdu text-base text-white leading-snug block">گیلری سے</span>
                      <span className="text-xs text-slate-400">Choose from Gallery</span>
                    </div>
                  </button>

                  {/* Hidden inputs */}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleImageChange}
                  />
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageChange}
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Audio Recording & Upload */}
          {activeTab === 'audio' && (
            <div className="space-y-3">
              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4 text-center">
                <div className="flex flex-col items-center justify-center gap-2">
                  {isRecording ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-14 h-14 rounded-full bg-red-600/30 border-2 border-red-500 animate-pulse flex items-center justify-center text-red-400">
                        <Square className="w-6 h-6 fill-current" />
                      </div>
                      <span className="text-xs text-red-400 font-mono font-bold">
                        Recording: {recordingSeconds}s
                      </span>
                      <p className="text-xs text-slate-400 font-urdu">
                        اردو یا رومن اردو میں پیغام ریکارڈ کریں
                      </p>
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition min-h-[48px]"
                      >
                        <span className="font-urdu">ریکارڈنگ مکمل کریں</span> / Finish Recording
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={startRecording}
                        className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white text-sm font-semibold rounded-2xl shadow-sm transition min-h-[56px]"
                      >
                        <Mic className="w-5 h-5" />
                        <span className="font-urdu text-base leading-snug">آواز ریکارڈ کریں</span>
                        <span className="text-xs opacity-80">/ Record</span>
                      </button>
                      <span className="text-xs text-slate-500 mt-1">
                        یا فائل اپلوڈ کریں / Or upload audio file (.ogg, .m4a, .mp3, .wav)
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <input
                    type="file"
                    accept="audio/*,.ogg,.m4a,.mp3,.wav"
                    onChange={handleAudioFileChange}
                    className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700"
                  />
                  {recordedAudioBase64 && (
                    <div className="mt-2.5 text-xs text-emerald-400 flex items-center justify-center gap-1.5 font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>آواز منسلک ہونے کے لیے تیار ہے / Audio note ready to attach</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Pasted Text */}
          {activeTab === 'text' && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                <span className="font-urdu block text-sm">پیغامات کا متن پیسٹ کریں</span>
                Paste Chat Transcript or Threatening Messages
              </label>
              <textarea
                placeholder="15/10/2026, 10:14 PM - Accused: Agar kal meeting mein..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={5}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Collapsible "مزید تفصیل / More details" section */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="w-full flex items-center justify-between p-3.5 text-left text-xs font-semibold text-slate-300 hover:bg-slate-900 transition min-h-[48px]"
            >
              <div className="flex items-center gap-2">
                <span className="font-urdu text-sm text-teal-300 leading-snug">مزید تفصیل</span>
                <span className="text-slate-500">/</span>
                <span className="text-slate-400">More details (Platform, Person, Date, Notes)</span>
              </div>
              {showDetails ? (
                <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              )}
            </button>

            {showDetails && (
              <div className="p-4 pt-1 space-y-3.5 border-t border-slate-800/80">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      <span className="font-urdu block text-xs">پلیٹ فارم</span>
                      Platform
                    </label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value as EvidenceItem['platform'])}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 min-h-[40px]"
                    >
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Instagram">Instagram</option>
                      <option value="SMS">SMS / Text</option>
                      <option value="Call">Phone Call</option>
                      <option value="Other">Other / Email / Physical</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      <span className="font-urdu block text-xs">تاریخ اور وقت</span>
                      Incident Date / Time
                    </label>
                    <input
                      type="datetime-local"
                      value={incidentDateTime}
                      onChange={(e) => setIncidentDateTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 min-h-[40px]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      <span className="font-urdu block text-xs">متعلقہ شخص</span>
                      Person Involved (Label / Identifier)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. +92 300... or Handle"
                      value={personLabel}
                      onChange={(e) => setPersonLabel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 min-h-[40px]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    <span className="font-urdu block text-xs">اضافی نوٹس</span>
                    Context Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Threatening messages received after blocking caller"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500 min-h-[40px]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              type="submit"
              className="w-full py-3.5 px-5 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-semibold rounded-2xl shadow-md transition flex items-center justify-center gap-2 min-h-[56px]"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="font-urdu text-base leading-snug">محفوظ کریں اور منسلک کریں</span>
              <span className="text-xs opacity-85">/ Encrypt &amp; Attach to Case</span>
            </button>
          </div>
        </form>
      </div>

      {/* ACTION: EVIDENCE PROCESSING CARD */}
      <div className="p-4 bg-gradient-to-r from-teal-950/70 via-slate-900 to-slate-900 border border-teal-800/80 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span className="font-urdu text-base leading-snug">شواہد کا جائزہ</span>
            <span className="text-xs text-slate-400 font-normal">/ Evidence Processing</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            <span className="font-urdu block text-slate-300">
              شواہد کا جائزہ لیں، ٹائم لائن ترتیب دیں اور متعلقہ قوانین دیکھیں۔
            </span>
            Review your evidence, organize timeline, and see applicable laws.
          </p>
        </div>
        <button
          onClick={() => onRunAiPipeline(currentCase)}
          disabled={isAnalyzing || currentCase.evidenceItems.length === 0}
          className="w-full sm:w-auto px-6 py-3 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded-2xl shadow-lg transition flex items-center justify-center gap-2 shrink-0 min-h-[56px]"
        >
          <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
          <div className="flex flex-col items-center">
            <span className="font-urdu text-sm leading-tight">
              {isAnalyzing ? 'کام جاری ہے…' : 'سمجھیں'}
            </span>
            <span className="text-[11px] opacity-80">
              {isAnalyzing ? 'Working...' : 'Analyse My Evidence'}
            </span>
          </div>
        </button>
      </div>

      {/* SAVED EVIDENCE ITEMS LIST (Single-column layout for 360px phones) */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-urdu text-base leading-tight">منسلک شواہد</span>
            <span className="text-xs text-slate-400 font-normal">
              ({currentCase.evidenceItems.length} items)
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-normal">Newest first</span>
        </h3>

        {currentCase.evidenceItems.length === 0 ? (
          <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-500 space-y-1">
            <p className="font-urdu text-sm text-slate-400">ابھی اس کیس میں کوئی ثبوت منسلک نہیں ہے۔</p>
            <p>No evidence items attached yet. Use the form above to add items.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {currentCase.evidenceItems.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between gap-3 transition shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-teal-400 border border-slate-700">
                      {item.platform}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 truncate max-w-[200px]">
                      {item.personLabel}
                    </span>
                  </div>
                  <button
                    onClick={() => setItemToDelete(item.id)}
                    className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Delete item"
                    aria-label="Delete evidence item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {item.type === 'screenshot' && (
                  <div className="h-44 w-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                    <img
                      src={item.content}
                      alt="Evidence media"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                )}

                {item.type === 'audio' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-teal-300 font-mono flex items-center gap-2">
                    <Mic className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>Audio Voice Recording ({item.platform})</span>
                  </div>
                )}

                {item.type === 'text' && (
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-300 font-mono line-clamp-3">
                    {item.content}
                  </div>
                )}

                {item.ocrOrTranscriptText && (
                  <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-xl text-[11px] text-slate-400">
                    <span className="font-semibold text-teal-400 text-[10px] uppercase block mb-0.5">
                      Extracted Text / Transcript:
                    </span>
                    <p className="line-clamp-2">{item.ocrOrTranscriptText}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-800/60">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {item.incidentDateTime.replace('T', ' ')}
                  </span>
                  {item.notes && <span className="truncate max-w-[150px] italic">{item.notes}</span>}
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
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <span className="font-urdu block text-base text-red-300">کیا آپ یہ ثبوت حذف کرنا چاہتے ہیں؟</span>
                <span>Confirm Delete Evidence Item</span>
              </div>
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Are you sure you want to permanently delete this encrypted evidence record? This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteItem}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition min-h-[44px]"
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
