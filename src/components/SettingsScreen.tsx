import React, { useState, useEffect } from 'react';
import { wipeAllData } from '../lib/db.ts';
import { featureFlags } from '../featureFlags.ts';
import {
  Shield,
  Trash2,
  KeyRound,
  AlertTriangle,
  Lock,
  Cpu,
  Clock,
  Radio,
  FileArchive,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { DeveloperHealthModal } from './DeveloperHealthModal.tsx';

interface SettingsScreenProps {
  onOpenPinSetup: () => void;
  onPanicLock: () => void;
  onNavigateCounselor?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onOpenPinSetup,
  onPanicLock,
  onNavigateCounselor,
}) => {
  const [showConfirmWipe, setShowConfirmWipe] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // 1. Configurable Auto-Lock Duration (Default: 60s)
  const [autoLockTimeout, setAutoLockTimeout] = useState(() => {
    return localStorage.getItem('autoLockTimeout') || '60';
  });

  const handleTimeoutChange = (newVal: string) => {
    setAutoLockTimeout(newVal);
    localStorage.setItem('autoLockTimeout', newVal);
  };

  // 2. Duress Alert Status & Channel Test
  const [duressStatus, setDuressStatus] = useState<string | null>(null);
  const [isTestingDuress, setIsTestingDuress] = useState(false);

  useEffect(() => {
    fetch('/api/duress/status')
      .then((res) => res.json())
      .then((data) => {
        if (data.configured) {
          setDuressStatus('Channel configured: Telegram Bot API');
        } else {
          setDuressStatus('Simulated alert (no channel configured)');
        }
      })
      .catch(() => {
        setDuressStatus('Simulated alert (no channel configured)');
      });
  }, []);

  const handleTestDuressAlert = async () => {
    setIsTestingDuress(true);
    try {
      const res = await fetch('/api/duress/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.status === 'dispatched') {
        setDuressStatus('Alert dispatched via configured channel');
      } else {
        setDuressStatus('Simulated alert (no channel configured)');
      }
    } catch {
      setDuressStatus('Simulated alert (no channel configured)');
    } finally {
      setIsTestingDuress(false);
    }
  };

  const handleWipeEverything = async () => {
    setIsWiping(true);
    try {
      await wipeAllData();
      localStorage.clear();
      sessionStorage.clear();
      alert('All evidence, cryptographic keys, and vault databases have been permanently wiped.');
      onPanicLock();
      window.location.reload();
    } catch (err) {
      alert('Failed to complete storage wipe.');
    } finally {
      setIsWiping(false);
    }
  };

  // 5-Line Plain-Language Privacy Notice (English & Urdu matching reality)
  const privacyNoticeLines = [
    {
      en: '1. Device Encryption: All evidence records, screenshots, and case notes remain encrypted on your device with client-side AES-GCM 256-bit cryptography.',
      ur: '1. ڈیوائس پر محفوظگی: شواہد کا ریکارڈ، اسکرین شاٹس اور نوٹس آپ کے براؤزر میں کلائنٹ سائڈ AES-GCM 256-bit انکرپشن کے ساتھ محفوظ رہتے ہیں۔',
    },
    {
      en: '2. Media Extraction: Screenshots are processed on our server (OCR runs on our server with Tesseract) and voice recordings are sent for transcription; Pakistani phone numbers, emails, and CNICs are redacted on the client before further AI analysis.',
      ur: '2. میڈیا سے متن نکالنا: اسکرین شاٹس ہمارے سرور پر پروسیس ہوتے ہیں (OCR ہمارے سرور پر Tesseract کے ذریعے چلتا ہے) اور آواز کی ریکارڈنگز ٹرانسکرپشن کے لیے بھیجی جاتی ہیں؛ مزید تجزیے سے قبل فون نمبر، ای میل اور شناختی کارڈ نمبرز کلائنٹ پر خودکار طور پر چھپا دیے جاتے ہیں۔',
    },
    {
      en: '3. AI Analysis: Redacted case facts and legal search queries are sent to the Gemini AI service to write search queries, create embeddings and explain the retrieved sections. The law text itself is stored on our server.',
      ur: '3. AI تجزیہ: چھپائی گئی کیس کی تفصیلات اور قانونی تلاش کے سوالات جیمنی (Gemini) AI سروس کو بھیجے جاتے ہیں تاکہ تلاش کے سوالات تیار کیے جائیں، ایمبیڈنگز بنائی جائیں اور حاصل شدہ دفعات کی وضاحت کی جا سکے۔ قانون کا اصل متن خود ہمارے سرور پر محفوظ ہے۔',
    },
    {
      en: '4. Legal Information: The law texts have not been reviewed by a lawyer unless a section is marked Verified. The sections shown are legal information, not legal advice.',
      ur: '4. قانونی معلومات: قوانین کے متن کا کسی وکیل کی جانب سے جائزہ نہیں لیا گیا جب تک کہ متعلقہ دفعہ پر Verified کا نشان نہ ہو۔ دکھائی گئی دفعات قانونی معلومات ہیں، قانونی مشورہ نہیں۔',
    },
    {
      en: '5. Sakhi Circle Matching: For Sakhi Circle, the normalized number or handle is sent over HTTPS to our server, which turns it into an irreversible code and discards the original immediately. Messages, images and names are never sent.',
      ur: '5. سخی سرکل پیٹرن میچنگ: سخی سرکل کے لیے، نارملائزڈ نمبر یا ہینڈل HTTPS کے ذریعے ہمارے سرور پر بھیجا جاتا ہے، جو اسے ایک ناقابلِ واپسی کوڈ میں تبدیل کر کے اصل کو فوراً تلف کر دیتا ہے۔ پیغامات، تصاویر اور نام کبھی نہیں بھیجے جاتے۔',
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-teal-400" />
          <span>Vault Security & Privacy Controls</span>
        </h2>
        <p className="text-xs text-slate-400">
          Cryptographic settings, privacy guarantees, and emergency data destruction
        </p>
      </div>

      {/* 5-Line Plain-Language Privacy Notice (Bilingual) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3.5 shadow-sm">
        <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <span>Plain-Language Privacy Notice / پرائیویسی کی وضاحتی شرائط</span>
        </h3>
        <div className="space-y-3">
          {privacyNoticeLines.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-1.5 text-xs font-sans"
            >
              <div className="text-slate-200 leading-relaxed">{item.en}</div>
              <div className="text-teal-300/90 font-urdu text-[13px] leading-relaxed text-right dir-rtl">
                {item.ur}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Passcode & Auto-Lock Configuration */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-teal-400" />
              <span>Passcode Management</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Update Real PIN or Decoy Duress PIN. Stored using Web Crypto PBKDF2 with 600,000 hashing rounds.
            </p>
          </div>
          <button
            onClick={onOpenPinSetup}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold rounded-xl border border-teal-700/60 transition whitespace-nowrap"
          >
            Change PINs
          </button>
        </div>

        {/* Auto-Lock Inactivity Setting */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-teal-400" />
              <span>Auto-Lock Inactivity Timer</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Vault automatically zeroes in-memory keys and returns to calculator after inactivity
            </p>
          </div>
          <select
            value={autoLockTimeout}
            onChange={(e) => handleTimeoutChange(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500 w-full sm:w-auto"
          >
            <option value="30">30 seconds</option>
            <option value="60">60 seconds (Default)</option>
            <option value="120">2 minutes</option>
            <option value="300">5 minutes</option>
          </select>
        </div>
      </div>

      {/* Duress Silent Alert Channel */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-teal-400" />
          <span>Silent Duress Alert Channel</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          When the decoy PIN is entered under duress, a silent background notification is sent. If Telegram credentials are configured in server env, an alert is dispatched; otherwise, status remains simulated.
        </p>
        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            {duressStatus?.includes('dispatched') || duressStatus?.includes('configured') ? (
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-xs text-slate-300 font-mono">
              {duressStatus || 'Checking channel status...'}
            </span>
          </div>
          <button
            onClick={handleTestDuressAlert}
            disabled={isTestingDuress}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            {isTestingDuress ? 'Testing...' : 'Test Channel'}
          </button>
        </div>
      </div>

      {/* Emergency Evidence Share Packet (Feature Gated) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-teal-400" />
              <span>Emergency Evidence Packet</span>
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standalone encrypted bundle for legal transfer. Requires AES-GCM encryption with out-of-band key delivery.
            </p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 border border-slate-700 text-slate-400">
            {featureFlags.secureSharePacket ? 'Enabled' : 'Gated by Flag'}
          </span>
        </div>
        <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400">
          Feature is currently {featureFlags.secureSharePacket ? 'active' : 'hidden behind src/featureFlags.ts (secureSharePacket: false)'}. Exported packets must always be encrypted with AES-GCM using a separate out-of-band key, never stored plain.
        </div>
      </div>

      {/* Diagnostic & Counselor Tools */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-teal-400" />
          <span>System Diagnostics & Counselor Access</span>
        </h3>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setShowHealthModal(true)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5"
          >
            <Cpu className="w-3.5 h-3.5 text-teal-400" />
            <span>AI Model Diagnostics</span>
          </button>
          {onNavigateCounselor && (
            <button
              onClick={onNavigateCounselor}
              className="px-4 py-2 bg-slate-800 hover:bg-teal-950/80 text-teal-300 hover:text-teal-200 text-xs font-semibold rounded-xl border border-teal-800 transition flex items-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5 text-teal-400" />
              <span>Counselor Portal Demo (/counselor)</span>
            </button>
          )}
        </div>
      </div>

      {showHealthModal && (
        <DeveloperHealthModal onClose={() => setShowHealthModal(false)} />
      )}

      {/* Emergency Wipe Action */}
      <div className="bg-red-950/30 border border-red-800/60 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="text-sm font-bold">Emergency "Delete Everything" Action</h3>
        </div>
        <p className="text-xs text-red-200/90 leading-relaxed">
          Irreversibly deletes the IndexedDB vault database, deletes all encrypted cases, wipes decoy records, and clears all cryptographic verifiers from this browser.
        </p>
        <button
          onClick={() => setShowConfirmWipe(true)}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete Everything Permanently</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {showConfirmWipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-red-800/80 rounded-2xl p-6 text-slate-200 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <span>Permanent Destruction Warning</span>
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will completely destroy all evidence records and reset the app back to the initial calculator state.
              This operation cannot be undone. Are you sure?
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowConfirmWipe(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleWipeEverything}
                disabled={isWiping}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-md"
              >
                {isWiping ? 'Wiping Storage...' : 'Yes, Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
