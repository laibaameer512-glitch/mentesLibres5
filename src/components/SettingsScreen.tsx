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
  Globe,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { DeveloperHealthModal } from './DeveloperHealthModal.tsx';

interface SettingsScreenProps {
  onOpenPinSetup: () => void;
  onPanicLock: () => void;
  onNavigateCounselor?: () => void;
  language?: 'ur' | 'en';
  onLanguageChange?: (lang: 'ur' | 'en') => void;
  onBack?: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onOpenPinSetup,
  onPanicLock,
  onNavigateCounselor,
  language: initialLanguage = 'ur',
  onLanguageChange,
  onBack,
}) => {
  const [showConfirmWipe, setShowConfirmWipe] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // 1. Language setting
  const [currentLanguage, setCurrentLanguage] = useState<'ur' | 'en'>(() => {
    return (localStorage.getItem('uiLanguage') as 'ur' | 'en') || initialLanguage;
  });

  const handleLanguageSelect = (lang: 'ur' | 'en') => {
    setCurrentLanguage(lang);
    localStorage.setItem('uiLanguage', lang);
    if (onLanguageChange) {
      onLanguageChange(lang);
    }
  };

  // 2. Simple Language Mode
  const [simpleLanguageMode, setSimpleLanguageMode] = useState<boolean>(() => {
    return localStorage.getItem('simpleLanguageMode') === 'true';
  });

  const handleToggleSimpleLanguage = () => {
    setSimpleLanguageMode((prev) => {
      const next = !prev;
      localStorage.setItem('simpleLanguageMode', String(next));
      return next;
    });
  };

  // 3. Configurable Auto-Lock Duration (Default: 60s)
  const [autoLockTimeout, setAutoLockTimeout] = useState(() => {
    return localStorage.getItem('autoLockTimeout') || '60';
  });

  const handleTimeoutChange = (newVal: string) => {
    setAutoLockTimeout(newVal);
    localStorage.setItem('autoLockTimeout', newVal);
  };

  // 4. Duress Alert Status & Channel Test
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
      alert('تمام شواہد اور ڈیٹا مستقل طور پر ختم کر دیے گئے۔ / All evidence and data permanently wiped.');
      onPanicLock();
      window.location.reload();
    } catch (err) {
      alert('ڈیٹا حذف کرنے میں مسئلہ پیش آیا۔ / Failed to complete storage wipe.');
    } finally {
      setIsWiping(false);
    }
  };

  // 5-Line Plain-Language Privacy Notice (English & Urdu matching reality)
  const privacyNoticeLines = [
    {
      ur: '1. ڈیوائس پر محفوظگی: شواہد کا ریکارڈ، اسکرین شاٹس اور نوٹس آپ کے براؤزر میں مضبوط انکرپشن کے ساتھ محفوظ رہتے ہیں۔',
      en: '1. Device Encryption: All evidence records, screenshots, and case notes remain safely encrypted on your device.',
    },
    {
      ur: '2. میڈیا سے متن پڑھنا: اسکرین شاٹس اور آواز کی ریکارڈنگز کا متن سمجھنے کے لیے پروسیسنگ ہوتی ہے؛ مزید تجزیے سے قبل فون نمبر، ای میل اور شناختی کارڈ نمبرز خودکار طور پر چھپا دیے جاتے ہیں۔',
      en: '2. Reading Media Text: Screenshots and voice recordings are processed to read text; phone numbers, emails, and personal IDs are automatically hidden before further analysis.',
    },
    {
      ur: '3. قانونی تجزیہ: کیس کی تفصیلات اور قانونی سوالات کی بنیاد پر متعلقہ قانونی دفعات کی نشاندہی کی جاتی ہے۔ قانون کا اصل متن ہمارے سرور پر محفوظ ہے۔',
      en: '3. Legal Analysis: Based on case facts and questions, relevant legal sections are identified and explained. The legal text is securely stored on our server.',
    },
    {
      ur: '4. قانونی معلومات: دکھائی گئی دفعات اور شکایت کا مسودہ محض معلوماتی رہنمائی ہیں، حتمی قانونی مشورہ نہیں۔',
      en: '4. Legal Information: The law texts and draft complaint are educational information and draft preparation, not official legal advice.',
    },
    {
      ur: '5. سخی سرکل پیٹرن میچنگ: سخی سرکل کے لیے، نمبر یا ہینڈل کو ایک خفیہ اور محفوظ کوڈ میں تبدیل کیا جاتا ہے تاکہ اصل معلومات فون پر ہی محفوظ رہیں۔ پیغامات، تصاویر اور نام کبھی نہیں بھیجے جاتے۔',
      en: '5. Sakhi Circle Matching: For Sakhi Circle, numbers or handles are converted into secure private codes. Messages, images and names are never sent.',
    },
  ];

  return (
    <div className="space-y-8 max-w-xl mx-auto w-full pb-8">
      {/* Top back button for convenience */}
      {onBack && (
        <button
          onClick={onBack}
          className="w-full min-h-[56px] rounded-2xl border border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-teal-300 flex items-center justify-center gap-2 transition px-4 py-3"
        >
          <ArrowLeft className="w-5 h-5 shrink-0" />
          <span className="font-urdu text-lg leading-snug">واپس جائیں</span>
          <span className="text-xs text-slate-400">/ Back</span>
        </button>
      )}

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION A: پرائیویسی اور شرائط / Privacy & Terms */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        {/* Section Header */}
        <div className="border-b border-slate-800 pb-3">
          <h2 className="font-urdu text-2xl text-white font-bold leading-snug flex items-center gap-2">
            <Shield className="w-6 h-6 text-teal-400 shrink-0" />
            <span>پرائیویسی اور شرائط</span>
          </h2>
          <div className="text-sm font-semibold text-slate-400 mt-0.5">
            Privacy &amp; Terms
          </div>
        </div>

        {/* Legal Disclaimer Box */}
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-1.5">
          <div className="font-urdu text-base text-teal-200 leading-snug">
            یہ ایپ قانونی معلومات اور ابتدائی مسودہ فراہم کرتی ہے، حتمی قانونی مشورہ نہیں۔
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            This application provides legal information and automated document drafts, not official legal advice.
          </div>
        </div>

        {/* 5 Plain Privacy Lines */}
        <div className="space-y-3">
          {privacyNoticeLines.map((item, idx) => (
            <div
              key={idx}
              className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-2"
            >
              <div className="font-urdu text-sm text-teal-100 leading-relaxed text-right dir-rtl">
                {item.ur}
              </div>
              <div className="text-xs text-slate-400 leading-relaxed pt-1 border-t border-slate-800/60">
                {item.en}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═════════════════════════════════════════════════════════════════════ */}
      {/* SECTION B: سیٹنگز / Settings */}
      {/* ═════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4 pt-4 border-t border-slate-800">
        {/* Section Header */}
        <div className="border-b border-slate-800 pb-3">
          <h2 className="font-urdu text-2xl text-white font-bold leading-snug flex items-center gap-2">
            <Lock className="w-6 h-6 text-teal-400 shrink-0" />
            <span>سیٹنگز</span>
          </h2>
          <div className="text-sm font-semibold text-slate-400 mt-0.5">
            Settings
          </div>
        </div>

        {/* 1. Language Setting */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div>
            <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
              <Globe className="w-5 h-5 text-teal-400 shrink-0" />
              <span>زبان کا انتخاب</span>
            </div>
            <div className="text-xs text-slate-400">Language Selection</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleLanguageSelect('ur')}
              className={`min-h-[56px] rounded-xl font-bold flex flex-col items-center justify-center transition border ${
                currentLanguage === 'ur'
                  ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span className="font-urdu text-lg leading-tight">اردو</span>
              <span className="text-[11px] opacity-80">Urdu</span>
            </button>
            <button
              type="button"
              onClick={() => handleLanguageSelect('en')}
              className={`min-h-[56px] rounded-xl font-bold flex flex-col items-center justify-center transition border ${
                currentLanguage === 'en'
                  ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              <span className="text-sm leading-tight">English</span>
              <span className="font-urdu text-xs opacity-80">انگریزی</span>
            </button>
          </div>
        </div>

        {/* 2. Auto-Lock Timer */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div>
            <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-400 shrink-0" />
              <span>خودکار لاک کا وقت</span>
            </div>
            <div className="text-xs text-slate-400">Auto-Lock Inactivity Timer</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              غیر فعال رہنے پر ایپ خود بخود بند ہو جاتی ہے / Vault zeroes keys after inactivity
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { val: '30', ur: '30 سیکنڈ', en: '30 seconds' },
              { val: '60', ur: '1 منٹ (ڈیفالٹ)', en: '60s (Default)' },
              { val: '120', ur: '2 منٹ', en: '2 minutes' },
              { val: '300', ur: '5 منٹ', en: '5 minutes' },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => handleTimeoutChange(opt.val)}
                className={`min-h-[56px] rounded-xl p-2.5 flex flex-col items-center justify-center transition border ${
                  autoLockTimeout === opt.val
                    ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span className="font-urdu text-sm leading-snug">{opt.ur}</span>
                <span className="text-[11px] opacity-80">{opt.en}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Simple-Language Mode */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-teal-400 shrink-0" />
                <span>آسان الفاظ کا موڈ</span>
              </div>
              <div className="text-xs text-slate-400">Simple-Language Mode</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                عام فہم اور روزمرہ کے الفاظ استعمال کریں / Use plain, everyday words
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleSimpleLanguage}
            className={`w-full min-h-[56px] rounded-xl px-4 py-3 flex items-center justify-between transition border ${
              simpleLanguageMode
                ? 'bg-teal-600/30 border-teal-500/80 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex flex-col text-left">
              <span className="font-urdu text-sm leading-snug">
                {simpleLanguageMode ? 'فعال ہے (On)' : 'غیر فعال ہے (Off)'}
              </span>
              <span className="text-xs text-slate-400">
                {simpleLanguageMode ? 'Simple mode active' : 'Standard mode active'}
              </span>
            </div>
            <div
              className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${
                simpleLanguageMode ? 'bg-teal-500' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  simpleLanguageMode ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </div>
          </button>
        </div>

        {/* 4. PIN Change */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div>
            <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-teal-400 shrink-0" />
              <span>پن کوڈ تبدیل کریں</span>
            </div>
            <div className="text-xs text-slate-400">Passcode Management</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              اصلی پن یا ڈیکوائے پن کوڈ تبدیل کریں / Update Real PIN or Decoy Duress PIN
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenPinSetup}
            className="w-full min-h-[56px] rounded-xl bg-slate-950 hover:bg-slate-800 text-teal-300 border border-teal-700/60 font-semibold transition flex flex-col items-center justify-center px-4 py-2"
          >
            <span className="font-urdu text-base leading-snug">پن کوڈ تبدیل کریں</span>
            <span className="text-xs text-slate-400">Change PINs</span>
          </button>
        </div>

        {/* 5. Silent Duress Alert Channel */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div>
            <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
              <Radio className="w-5 h-5 text-teal-400 shrink-0" />
              <span>خفیہ خطرے کی الرٹ</span>
            </div>
            <div className="text-xs text-slate-400">Silent Duress Alert Channel</div>
            <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              ڈیکوائے پن درج کرنے پر پسِ پردہ خاموش اطلاع بھیجی جاتی ہے / When decoy PIN is entered under duress, a silent notification is triggered.
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {duressStatus?.includes('dispatched') || duressStatus?.includes('configured') ? (
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="text-xs text-slate-300 font-mono truncate">
                {duressStatus || 'Checking channel status...'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleTestDuressAlert}
              disabled={isTestingDuress}
              className="min-h-[44px] px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition shrink-0"
            >
              {isTestingDuress ? 'Testing...' : 'Test Channel'}
            </button>
          </div>
        </div>

        {/* 6. Emergency Evidence Packet (Feature Gated) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
                <FileArchive className="w-5 h-5 text-teal-400 shrink-0" />
                <span>ہنگامی ثبوت بنڈل</span>
              </div>
              <div className="text-xs text-slate-400">Emergency Evidence Packet</div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 border border-slate-700 text-slate-400 shrink-0">
              {featureFlags.secureSharePacket ? 'Enabled' : 'Gated'}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Standalone encrypted bundle for legal transfer. Requires secure key delivery.
          </p>
        </div>

        {/* 7. System Diagnostics & Counselor Access */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div>
            <div className="font-urdu text-base text-white font-semibold leading-snug flex items-center gap-2">
              <Cpu className="w-5 h-5 text-teal-400 shrink-0" />
              <span>سسٹم کی جانچ اور کاؤنسلر پورٹل</span>
            </div>
            <div className="text-xs text-slate-400">Diagnostics &amp; Counselor Portal</div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setShowHealthModal(true)}
              className="w-full min-h-[56px] rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-semibold transition flex flex-col items-center justify-center px-4 py-2"
            >
              <span className="font-urdu text-base leading-snug">سسٹم کی جانچ</span>
              <span className="text-xs text-slate-400">System Diagnostics</span>
            </button>
            {onNavigateCounselor && (
              <button
                type="button"
                onClick={onNavigateCounselor}
                className="w-full min-h-[56px] rounded-xl bg-slate-950 hover:bg-teal-950/60 text-teal-300 border border-teal-800 font-semibold transition flex flex-col items-center justify-center px-4 py-2"
              >
                <span className="font-urdu text-base leading-snug">کاؤنسلر پورٹل ڈیمو</span>
                <span className="text-xs text-slate-400">Counselor Portal Demo (/counselor)</span>
              </button>
            )}
          </div>
        </div>

        {/* 8. Emergency Wipe Action */}
        <div className="bg-red-950/30 border border-red-900/60 rounded-2xl p-4 space-y-3">
          <div>
            <div className="font-urdu text-base text-red-300 font-semibold leading-snug flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>تمام ڈیٹا حذف کریں</span>
            </div>
            <div className="text-xs text-red-400">Delete All Data Permanently</div>
            <div className="text-[11px] text-red-200/80 mt-1 leading-relaxed">
              تمام کیسز، شواہد اور ریکارڈز ڈیوائس سے ہمیشہ کے لیے ختم ہو جائیں گے۔ یہ عمل واپس نہیں ہو سکتا۔
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowConfirmWipe(true)}
            className="w-full min-h-[56px] rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold transition shadow-lg flex flex-col items-center justify-center px-4 py-2"
          >
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              <span className="font-urdu text-base leading-snug">سب کچھ مستقل حذف کریں</span>
            </div>
            <span className="text-xs opacity-80">Delete Everything Permanently</span>
          </button>
        </div>
      </section>

      {/* Bottom Back Button */}
      {onBack && (
        <button
          onClick={onBack}
          className="w-full min-h-[56px] rounded-2xl border border-slate-800 bg-slate-900/90 hover:bg-slate-800 text-teal-300 flex items-center justify-center gap-2 transition px-4 py-3"
        >
          <ArrowLeft className="w-5 h-5 shrink-0" />
          <span className="font-urdu text-lg leading-snug">واپس جائیں</span>
          <span className="text-xs text-slate-400">/ Back</span>
        </button>
      )}

      {/* Developer Health Modal */}
      {showHealthModal && (
        <DeveloperHealthModal onClose={() => setShowHealthModal(false)} />
      )}

      {/* Big Confirmation Modal for Delete All Data */}
      {showConfirmWipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-red-800/80 rounded-2xl p-6 text-slate-200 shadow-2xl space-y-5">
            <div className="space-y-1">
              <h4 className="font-urdu text-xl font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>کیا آپ واقعی سب کچھ حذف کرنا چاہتے ہیں؟</span>
              </h4>
              <p className="text-xs text-slate-300 font-semibold">
                Permanent Destruction Warning
              </p>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              تمام کیسز اور ثبوت مکمل طور پر ختم ہو جائیں گے اور ایپ ابتدائی کیلکولیٹر کی حالت میں واپس چلی جائے گی۔ یہ عمل ناقابلِ واپسی ہے۔
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={handleWipeEverything}
                disabled={isWiping}
                className="w-full min-h-[56px] rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold transition shadow-md flex flex-col items-center justify-center"
              >
                <span className="font-urdu text-base leading-snug">
                  {isWiping ? 'حذف ہو رہا ہے...' : 'ہاں، سب کچھ مستقل حذف کریں'}
                </span>
                <span className="text-xs opacity-90">
                  {isWiping ? 'Wiping Storage...' : 'Yes, Permanently Delete'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmWipe(false)}
                disabled={isWiping}
                className="w-full min-h-[56px] rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold transition flex flex-col items-center justify-center"
              >
                <span className="font-urdu text-base leading-snug">نہیں، واپس جائیں</span>
                <span className="text-xs opacity-80">Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
