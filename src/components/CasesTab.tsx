/**
 * CasesTab — the "Cases / کیسز" bottom-tab view.
 * Shows all cases as big cards with title, date, item count, and small thumbnails.
 * Tapping a case calls onSelectCase to open CaseScreen.
 */
import React from 'react';
import { VaultCase } from '../lib/db.ts';
import {
  FolderOpen,
  FolderPlus,
  Calendar,
  ChevronRight,
  Mic,
  Image as ImageIcon,
  FileText,
} from 'lucide-react';

interface CasesTabProps {
  cases: VaultCase[];
  onSelectCase: (id: string) => void;
  onCreateCase: () => void;
  language: 'ur' | 'en';
}

export const CasesTab: React.FC<CasesTabProps> = ({
  cases,
  onSelectCase,
  onCreateCase,
  language,
}) => {
  const lbl = (ur: string, en: string) => (language === 'ur' ? ur : en);

  return (
    <div className="space-y-4 pb-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <span className="font-urdu text-xl text-white leading-snug block">میری فائلیں</span>
          <span className="text-sm text-slate-400">My Cases ({cases.length})</span>
        </div>
        <button
          onClick={onCreateCase}
          className="flex items-center gap-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition min-h-[44px]"
        >
          <FolderPlus className="w-4 h-4" />
          <span className="font-urdu leading-snug">نیا</span>
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="p-10 border border-dashed border-slate-800 rounded-2xl text-center space-y-3">
          <FolderPlus className="w-10 h-10 text-slate-700 mx-auto" />
          <p className="font-urdu text-base text-slate-500 leading-relaxed">
            {lbl('ابھی کوئی فائل نہیں۔', 'No cases yet.')}
          </p>
          <p className="text-xs text-slate-600">
            {lbl('اوپر "نیا" دبائیں۔', 'Tap "نیا" above to create one.')}
          </p>
          <button
            onClick={onCreateCase}
            className="mt-2 inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl px-5 py-3 text-sm font-semibold transition min-h-[52px]"
          >
            <FolderPlus className="w-5 h-5" />
            <span className="font-urdu text-base leading-snug">کیس بنائیں</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => {
            // Gather thumbnail items (up to 3)
            const thumbItems = c.evidenceItems.slice(0, 3);
            const hasMore = c.evidenceItems.length > 3;

            return (
              <button
                key={c.id}
                onClick={() => onSelectCase(c.id)}
                className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 text-left transition"
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-5 h-5 text-teal-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">{c.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <Calendar className="w-3 h-3 shrink-0" />
                        <span>{new Date(c.updatedAt).toLocaleDateString('en-PK')}</span>
                        <span className="text-slate-700">·</span>
                        <span>
                          {c.evidenceItems.length}{' '}
                          {lbl('آئٹم', c.evidenceItems.length === 1 ? 'item' : 'items')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 shrink-0 mt-1" />
                </div>

                {/* Thumbnails row */}
                {c.evidenceItems.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {thumbItems.map((item) => (
                      <div
                        key={item.id}
                        className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0"
                      >
                        {item.type === 'screenshot' ? (
                          <img
                            src={item.content}
                            alt=""
                            className="w-full h-full object-cover object-top"
                          />
                        ) : item.type === 'audio' ? (
                          <Mic className="w-5 h-5 text-teal-400" />
                        ) : (
                          <FileText className="w-5 h-5 text-slate-500" />
                        )}
                      </div>
                    ))}
                    {hasMore && (
                      <div className="w-14 h-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                        <span className="text-xs text-slate-400 font-semibold">
                          +{c.evidenceItems.length - 3}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

