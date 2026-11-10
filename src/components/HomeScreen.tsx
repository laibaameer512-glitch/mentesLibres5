/**
 * HomeScreen — first screen shown after unlocking the real vault.
 *
 * Section 1: 2 big main cards
 *   1. "کیس بنائیں / Create Case" -> create new case flow
 *   2. "ثبوت شامل کریں / Add Evidence" -> opens Add New Evidence Item page
 * Section 2: "مدد اور سیٹنگز / Help & Settings" — 2-column grid with Helplines,
 *   Sakhi Circle, Privacy Notice, Settings, Delete All Data.
 *
 * Hard rules followed:
 *   - Min 56px touch targets.
 *   - Bilingual labels: Urdu first, English smaller below.
 *   - No three-dots menu.
 *   - No logic changes.
 */
import React from 'react';
import { VaultCase } from '../lib/db.ts';
import {
  FolderPlus,
  PlusCircle,
  PhoneCall,
  Shield,
  Users,
  Trash2,
} from 'lucide-react';

interface HomeScreenProps {
  cases: VaultCase[];
  onCreateCase: () => void;
  onAddEvidence: () => void;
  onGoHelplines: () => void;
  onGoSettings: () => void;
  onGoCircle: () => void;
  onGoPrivacyNotice?: () => void;
  onDeleteAll: () => void;
  onPanicLock: () => void;
  language: 'ur' | 'en';
  circleEnabled: boolean;
  noCaseOpen: boolean;
  onNoCaseForEvidence: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  cases: _cases,
  onCreateCase,
  onAddEvidence,
  onGoHelplines,
  onGoSettings,
  onGoCircle,
  onGoPrivacyNotice,
  onDeleteAll,
  onPanicLock: _onPanicLock,
  language,
  circleEnabled,
  noCaseOpen,
  onNoCaseForEvidence,
}) => {
  const lbl = (ur: string, en: string) => (language === 'ur' ? ur : en);

  const handleAddEvidenceClick = () => {
    if (noCaseOpen) {
      onNoCaseForEvidence();
    } else {
      onAddEvidence();
    }
  };

  // ── Help & Settings grid items ────────────────────────────────────────
  const helpItems: Array<{
    icon: React.FC<{ className?: string }>;
    ur: string;
    en: string;
    action: () => void;
    color: string;
    danger?: boolean;
  }> = [
    { icon: PhoneCall, ur: 'ہیلپ لائن', en: 'Helplines', action: onGoHelplines, color: 'text-teal-400' },
    ...(circleEnabled
      ? [{ icon: Users, ur: 'سخی سرکل', en: 'Sakhi Circle', action: onGoCircle, color: 'text-purple-400' }]
      : []),
    {
      icon: Shield,
      ur: 'پرائیویسی، شرائط اور سیٹنگز',
      en: 'Privacy, Terms & Settings',
      action: onGoSettings || onGoPrivacyNotice,
      color: 'text-teal-400',
    },
    { icon: Trash2, ur: 'سب حذف کریں', en: 'Delete All Data', action: onDeleteAll, color: 'text-red-400', danger: true },
  ];

  return (
    <div className="space-y-6 pb-4">
      {/* ── Section 1: 2 big main cards ─────────────────────────────────── */}
      <section className="space-y-3">
        {/* Card 1: Create Case */}
        <button
          onClick={onCreateCase}
          className="w-full flex items-center gap-4 bg-teal-700 hover:bg-teal-600 active:bg-teal-800 text-white rounded-2xl px-5 py-4 shadow-lg transition min-h-[72px] text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-teal-600/60 flex items-center justify-center shrink-0">
            <FolderPlus className="w-6 h-6" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-urdu text-lg leading-snug">کیس بنائیں</span>
            <span className="text-sm font-semibold opacity-90">Create Case</span>
            <span className="text-xs opacity-70 mt-0.5">
              {lbl('نئی فائل شروع کریں', 'Start a new record file')}
            </span>
          </div>
        </button>

        {/* Card 2: Add Evidence */}
        <button
          onClick={handleAddEvidenceClick}
          className="w-full flex items-center gap-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-2xl px-5 py-4 shadow-md border border-slate-700 transition min-h-[72px] text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-teal-900/60 border border-teal-700/50 flex items-center justify-center shrink-0">
            <PlusCircle className="w-6 h-6 text-teal-400" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-urdu text-lg leading-snug text-teal-200">ثبوت شامل کریں</span>
            <span className="text-sm font-semibold text-slate-200">Add Evidence</span>
            <span className="text-xs text-slate-400 mt-0.5">
              {lbl('تصاویر، آواز یا پیغامات محفوظ کریں', 'Add photos, voice notes, or chat')}
            </span>
          </div>
        </button>
      </section>

      {/* ── Section 2: Help & Settings grid ─────────────────────────────── */}
      <section>
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="font-urdu text-sm text-slate-300 normal-case tracking-normal leading-snug">مدد اور سیٹنگز</span>
          <span className="text-slate-600">/</span>
          <span>Help &amp; Settings</span>
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {helpItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.en}
                onClick={item.action}
                className={`flex flex-col items-start gap-2 rounded-2xl px-4 py-4 text-left transition min-h-[80px] border ${
                  item.danger
                    ? 'bg-red-950/30 border-red-900/50 hover:bg-red-950/60'
                    : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <Icon className={`w-5 h-5 ${item.color}`} />
                <div>
                  <div className={`font-urdu text-sm leading-snug ${item.danger ? 'text-red-300' : 'text-white'}`}>
                    {item.ur}
                  </div>
                  <div className="text-[11px] text-slate-400">{item.en}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
