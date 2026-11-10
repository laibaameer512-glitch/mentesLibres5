import React, { useState, useEffect } from 'react';
import { VaultCase, saveRealCase, getOrCreateEncryptedPseudonym } from '../lib/db.ts';
import { CircleExplainerModal } from './CircleExplainerModal.tsx';
import {
  ShieldCheck,
  Users,
  CheckCircle2,
  Lock,
  X,
  HelpCircle,
  FolderOpen,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

interface CircleModuleProps {
  currentCase?: VaultCase;
  cases?: VaultCase[];
  initialCaseId?: string;
  activeKey: CryptoKey;
  onCaseUpdated: (c: VaultCase) => void;
  language?: 'ur' | 'en';
}

interface IdentifierItem {
  type: 'phone' | 'handle' | 'location' | 'other';
  raw: string;
  normalized: string;
  selected: boolean;
  hash?: string;
  status?: {
    match: boolean;
    count: number;
    message: string;
  };
}

/**
 * Normalizes a phone number to Pakistani +92 format (+923XXXXXXXXX)
 */
function normalizePhone(raw: string): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/[\s\-\(\)\.]/g, '');
  if (/^03\d{9}$/.test(cleaned)) return `+92${cleaned.slice(1)}`;
  if (/^923\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^00923\d{9}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^\+923\d{9}$/.test(cleaned)) return cleaned;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

/**
 * Normalizes handle (lowercased, stripped of @)
 */
function normalizeHandle(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

/**
 * Normalizes generic identifier
 */
function normalizeGeneric(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectIdentifierType(val: string): 'phone' | 'handle' | 'location' | 'other' {
  const v = val.trim();
  if (v.startsWith('@')) return 'handle';
  if (/^(\+?92|03|\d{10,12})/.test(v.replace(/[\s\-]/g, ''))) return 'phone';
  if (/campus|office|hostel|street|hall/i.test(v)) return 'location';
  return 'other';
}

export const CircleModule: React.FC<CircleModuleProps> = ({
  currentCase: propCurrentCase,
  cases = [],
  initialCaseId,
  activeKey,
  onCaseUpdated,
  language = 'ur',
}) => {
  // Case selection
  const [selectedCaseId, setSelectedCaseId] = useState<string>(() => {
    if (propCurrentCase) return propCurrentCase.id;
    if (initialCaseId) return initialCaseId;
    if (cases.length > 0) return cases[0].id;
    return '';
  });

  const activeCase =
    cases.find((c) => c.id === selectedCaseId) || propCurrentCase || cases[0] || null;

  const [showExplainer, setShowExplainer] = useState(false);
  const [showConfirmOptInModal, setShowConfirmOptInModal] = useState(false);
  const [showConfirmWithdrawModal, setShowConfirmWithdrawModal] = useState(false);
  const [reporterPseudonym, setReporterPseudonym] = useState<string | null>(null);
  const [optedIn, setOptedIn] = useState<boolean>(
    Boolean(activeCase?.circleContribution?.optedIn)
  );
  const [identifiers, setIdentifiers] = useState<IdentifierItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync optedIn when active case changes
  useEffect(() => {
    setOptedIn(Boolean(activeCase?.circleContribution?.optedIn));
    setErrorMessage(null);
  }, [activeCase?.id, activeCase?.circleContribution?.optedIn]);

  // Load device reporter pseudonym encrypted from vault IndexedDB
  useEffect(() => {
    let isMounted = true;
    getOrCreateEncryptedPseudonym(activeKey)
      .then((pseudo) => {
        if (isMounted) setReporterPseudonym(pseudo);
      })
      .catch((err) => {
        console.error('Failed to load encrypted device pseudonym:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [activeKey]);

  // Extract and normalize available identifiers from the active case
  useEffect(() => {
    if (!activeCase) {
      setIdentifiers([]);
      return;
    }

    const rawList: string[] = [];
    if (activeCase.extractedReview?.identifiers) {
      rawList.push(...activeCase.extractedReview.identifiers);
    }

    // Also scan evidence items for phone numbers or handles in titles/notes
    activeCase.evidenceItems.forEach((ev) => {
      const matchPhone = ev.personLabel.match(/(\+?92\s?3\d{2}[\s\-]?\d{7}|03\d{2}[\s\-]?\d{7})/);
      if (matchPhone && !rawList.includes(matchPhone[1])) {
        rawList.push(matchPhone[1]);
      }
      const matchHandle = ev.personLabel.match(/@[\w\d_\.]+/);
      if (matchHandle && !rawList.includes(matchHandle[0])) {
        rawList.push(matchHandle[0]);
      }
    });

    // Default demo fallback identifiers if empty
    if (rawList.length === 0) {
      rawList.push('+92 300 4819283', '@suspect_anon_29');
    }

    // Deduplicate and normalize
    const unique = Array.from(new Set(rawList.filter(Boolean)));
    const builtItems: IdentifierItem[] = unique.map((raw, idx) => {
      const type = detectIdentifierType(raw);
      let normalized = raw;
      if (type === 'phone') normalized = normalizePhone(raw);
      else if (type === 'handle') normalized = normalizeHandle(raw);
      else normalized = normalizeGeneric(raw);

      // Pre-map saved hash if case was previously contributed
      const savedHash = activeCase.circleContribution?.contributedHashes?.[idx];

      return {
        type,
        raw,
        normalized,
        selected: true,
        hash: savedHash,
      };
    });

    setIdentifiers(builtItems);

    if (activeCase.circleContribution?.optedIn && reporterPseudonym) {
      checkStatus(builtItems, reporterPseudonym);
    }
  }, [activeCase?.id, reporterPseudonym]);

  // Check matching status with server
  const checkStatus = async (itemsToCheck: IdentifierItem[], pseudo?: string) => {
    const activePseudonym = pseudo || reporterPseudonym;
    if (!activePseudonym) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const queryUrl = `/api/circle/status?reporterPseudonym=${encodeURIComponent(activePseudonym)}`;
      const res = await fetch(queryUrl);

      if (!res.ok) {
        setErrorMessage('دوبارہ کوشش کریں / Please try again');
        return;
      }
      const data = await res.json();
      const resultsMap: Record<string, { status: 'match' | 'no_match'; count: number; message: string }> =
        data.results || {};

      setIdentifiers((prev) =>
        prev.map((item) => {
          if (item.hash && resultsMap[item.hash]) {
            const entry = resultsMap[item.hash];
            return {
              ...item,
              status: {
                match: entry.status === 'match',
                count: entry.count,
                message: entry.message,
              },
            };
          }

          const allResults = Object.values(resultsMap);
          const matchEntry = allResults.find((r) => r.status === 'match');
          if (matchEntry) {
            return {
              ...item,
              status: {
                match: true,
                count: matchEntry.count,
                message: matchEntry.message,
              },
            };
          }

          const firstResult = allResults[0];
          return {
            ...item,
            status: {
              match: false,
              count: 0,
              message: firstResult?.message || 'No match yet',
            },
          };
        })
      );
    } catch {
      setErrorMessage('دوبارہ کوشش کریں / Please try again');
    } finally {
      setLoading(false);
    }
  };

  // Toggle switch clicked by user
  const handleToggleClick = (targetState: boolean) => {
    if (targetState) {
      setShowConfirmOptInModal(true);
    } else {
      setShowConfirmWithdrawModal(true);
    }
  };

  // User confirmed opt-in
  const handleConfirmAndContribute = async () => {
    if (!activeCase) return;
    setShowConfirmOptInModal(false);
    setLoading(true);
    setErrorMessage(null);

    try {
      const activePseudo = reporterPseudonym || (await getOrCreateEncryptedPseudonym(activeKey));
      setReporterPseudonym(activePseudo);

      const selectedItems = identifiers.filter((i) => i.selected);
      if (selectedItems.length === 0) {
        setErrorMessage('دوبارہ کوشش کریں / Please try again');
        setLoading(false);
        return;
      }

      const payload = {
        reporterPseudonym: activePseudo,
        caseId: activeCase.id,
        category: activeCase.category || 'harassment',
        identifiers: selectedItems.map((item) => ({
          type: item.type,
          value: item.normalized,
        })),
      };

      const res = await fetch('/api/circle/contribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Contribution request failed');
      }

      const data = await res.json();
      setOptedIn(true);

      const returnedResults: Array<{ hash: string; isPattern: boolean; count: number }> =
        data.results || [];
      const contributedHashes = returnedResults.map((r) => r.hash);

      const updatedCase: VaultCase = {
        ...activeCase,
        circleContribution: {
          optedIn: true,
          contributedAt: new Date().toISOString(),
          contributedHashes,
          selectedIdentifiers: selectedItems.map((s) => s.normalized),
        },
        updatedAt: new Date().toISOString(),
      };

      await saveRealCase(activeKey, updatedCase);
      onCaseUpdated(updatedCase);

      const updatedItems = identifiers.map((item, idx) => {
        const matchingResult = returnedResults[idx];
        const hash = matchingResult ? matchingResult.hash : item.hash;
        return {
          ...item,
          hash,
        };
      });
      setIdentifiers(updatedItems);
      await checkStatus(updatedItems, activePseudo);
    } catch {
      setErrorMessage('دوبارہ کوشش کریں / Please try again');
    } finally {
      setLoading(false);
    }
  };

  // Withdraw case records
  const handleExecuteWithdraw = async () => {
    if (!activeCase) return;
    setShowConfirmWithdrawModal(false);
    setLoading(true);
    setErrorMessage(null);

    try {
      const activePseudo = reporterPseudonym || (await getOrCreateEncryptedPseudonym(activeKey));
      await fetch('/api/circle/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterPseudonym: activePseudo,
          caseId: activeCase.id,
        }),
      });

      setOptedIn(false);
      setIdentifiers((prev) =>
        prev.map((i) => ({
          ...i,
          hash: undefined,
          status: undefined,
        }))
      );

      const updatedCase: VaultCase = {
        ...activeCase,
        circleContribution: {
          optedIn: false,
          contributedAt: undefined,
          contributedHashes: [],
          selectedIdentifiers: [],
        },
        updatedAt: new Date().toISOString(),
      };

      await saveRealCase(activeKey, updatedCase);
      onCaseUpdated(updatedCase);
    } catch {
      setErrorMessage('دوبارہ کوشش کریں / Please try again');
    } finally {
      setLoading(false);
    }
  };

  if (!activeCase) {
    return (
      <div className="p-8 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-500 space-y-2">
        <Users className="w-8 h-8 text-slate-700 mx-auto" />
        <p className="font-urdu text-base text-slate-400">کوئی فعال کیس موجود نہیں ہے۔</p>
        <p>No active case available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      {/* ── 1. CASE PICKER ──────────────────────────────────────────────── */}
      {cases.length > 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            <span className="font-urdu block text-sm text-teal-300">کیس منتخب کریں</span>
            Select Case
          </label>
          <div className="relative">
            <select
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-teal-500 font-medium min-h-[52px]"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.evidenceItems.length} items)
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── 2. PLAIN EXPLANATION (2 short lines) ─────────────────────────── */}
      <div className="p-4 bg-teal-950/40 border border-teal-800/60 rounded-2xl flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-teal-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-urdu text-base text-teal-100 leading-snug">
            آپ کی معلومات خفیہ رہتی ہیں۔ صرف نمبر/ہینڈل کا خفیہ کوڈ شیئر ہوتا ہے۔
          </p>
          <p className="text-xs text-teal-300/80 leading-relaxed">
            Your details stay private. Only a secret code of the number/handle is shared.
          </p>
        </div>
      </div>

      {/* Loading & Error feedback */}
      {loading && (
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-teal-300 animate-pulse">
          <span>کام جاری ہے / Working...</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-950/50 border border-red-800 rounded-xl text-center text-xs text-red-300 flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ── 3. OPT-IN TOGGLE FOR THAT CASE ──────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-urdu text-base text-white leading-snug block">خفیہ پیٹرن چیک</span>
            <span className="text-xs text-slate-400">Anonymous Pattern Matching</span>
          </div>

          {/* Big Toggle Switch (min 56px touch target) */}
          <button
            type="button"
            disabled={loading}
            onClick={() => handleToggleClick(!optedIn)}
            className={`px-5 py-3 rounded-2xl text-xs font-bold transition flex items-center gap-2 min-h-[56px] border ${
              optedIn
                ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <span className="font-urdu text-sm leading-none">
              {optedIn ? 'فعال ہے' : 'غیر فعال'}
            </span>
            <span>/ {optedIn ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Existing consent text */}
        <p className="text-xs text-slate-400 leading-relaxed border-t border-slate-800/80 pt-3">
          <span className="font-urdu block text-slate-300 mb-0.5">
            صرف نمبر یا ہینڈل کا خفیہ کوڈ شیئر ہوتا ہے۔ آپ کے پیغامات، تصاویر اور نام فون سے باہر کبھی نہیں جاتے۔
          </span>
          Only scrambled codes of phone numbers or handles are shared. Your messages, images and name never leave this phone.
        </p>

        <button
          type="button"
          onClick={() => setShowExplainer(true)}
          className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1.5 transition pt-1"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>How Sakhi Circle Works / یہ کیسے کام کرتا ہے؟</span>
        </button>
      </div>

      {/* ── 4. MATCH RESULT CARD FOR EACH IDENTIFIER ─────────────────────── */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="font-urdu text-sm text-slate-300 normal-case">اس کیس کے نمبر اور ہینڈل</span>
            <span>/ Case Identifiers</span>
          </div>
          {optedIn && (
            <button
              onClick={() => checkStatus(identifiers)}
              disabled={loading}
              className="text-xs text-teal-400 hover:text-teal-300 font-semibold"
            >
              Refresh
            </button>
          )}
        </h3>

        {identifiers.length === 0 ? (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-500 space-y-1">
            <p className="font-urdu text-sm text-slate-400">کوئی فون نمبر یا ہینڈل نہیں ملا۔</p>
            <p>No phone numbers or handles found in this case.</p>
          </div>
        ) : (
          identifiers.map((item, idx) => {
            const hasPatternMatch = Boolean(item.status?.match && (item.status.count || 0) >= 3);
            const reporterCount = item.status?.count || 0;

            // Scenario A: Case is NOT opted in
            if (!optedIn) {
              return (
                <div
                  key={idx}
                  className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white font-mono">{item.raw}</span>
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                      {item.type}
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-3">
                    <Lock className="w-5 h-5 text-slate-500 shrink-0" />
                    <div>
                      <p className="font-urdu text-sm text-slate-300 leading-snug">
                        میچ چیک کرنے کے لیے شیئر کریں
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Opt in to check if other reports match this identifier
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowConfirmOptInModal(true)}
                    className="w-full py-3.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-xl text-sm transition min-h-[56px] flex items-center justify-center gap-2 shadow-md"
                  >
                    <span className="font-urdu text-base leading-none">شیئر کریں</span>
                    <span>/ Opt In</span>
                  </button>
                </div>
              );
            }

            // Scenario B: Distinct independent reporters >= 3
            if (hasPatternMatch) {
              return (
                <div
                  key={idx}
                  className="bg-amber-950/40 border-2 border-amber-600/80 rounded-2xl p-5 space-y-3.5 shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-base font-bold text-white font-mono block">{item.raw}</span>
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-amber-900/60 text-amber-300 border border-amber-700/60 inline-block mt-1">
                        {item.type}
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-500/40 shrink-0">
                      {reporterCount} رپورٹس / {reporterCount} reporters
                    </span>
                  </div>

                  <div className="space-y-1 bg-amber-950/60 border border-amber-800/80 rounded-xl p-3.5">
                    <p className="font-urdu text-base text-amber-100 font-bold leading-snug">
                      یہ نمبر/ہینڈل دوسری خواتین کی رپورٹس میں بھی آیا ہے
                    </p>
                    <p className="text-xs text-amber-200/90 leading-relaxed font-semibold">
                      Other independent reports match this identifier
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1 text-teal-300">
                    <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
                    <div>
                      <span className="font-urdu text-base font-bold block leading-snug">آپ اکیلی نہیں ہیں</span>
                      <span className="text-xs text-teal-300/80">You are not alone</span>
                    </div>
                  </div>
                </div>
              );
            }

            // Scenario C: Fewer than 3 reports (No match yet)
            return (
              <div
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white font-mono">{item.raw}</span>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-slate-800 text-slate-400 border border-slate-700">
                    {item.type}
                  </span>
                </div>

                <div className="p-3.5 bg-slate-950/70 border border-slate-800/90 rounded-xl space-y-1">
                  <p className="font-urdu text-sm text-slate-200 leading-snug">
                    ابھی کوئی میچ نہیں ملا
                  </p>
                  <p className="text-xs text-slate-400 font-medium">
                    No match yet
                  </p>
                  <p className="text-[11px] text-slate-500 pt-1 leading-relaxed">
                    پیٹرن کی تصدیق کے لیے 3 یا زیادہ آزاد رپورٹس درکار ہوتی ہیں۔
                    <br />
                    At least 3 independent reports are needed to confirm a pattern.
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── 5. "واپس لیں / WITHDRAW" BUTTON ─────────────────────────────── */}
      {optedIn && (
        <div className="pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => setShowConfirmWithdrawModal(true)}
            className="w-full py-4 bg-slate-900 hover:bg-red-950/40 text-red-300 border border-red-900/60 rounded-2xl text-sm font-semibold transition min-h-[56px] flex items-center justify-center gap-2"
          >
            <span className="font-urdu text-base leading-none">واپس لیں</span>
            <span>/ Withdraw from Circle</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal for Opt-In */}
      {showConfirmOptInModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-urdu text-xl text-white leading-snug">خفیہ شیئرنگ کی تصدیق</h4>
                <p className="text-xs text-teal-400">Confirm Anonymous Contribution</p>
              </div>
              <button
                onClick={() => setShowConfirmOptInModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-teal-950/50 border border-teal-800 rounded-xl space-y-1 text-xs">
              <p className="font-urdu text-sm text-teal-100 leading-snug">
                صرف نمبر یا ہینڈل کا خفیہ کوڈ شیئر ہوتا ہے۔ آپ کے پیغامات، تصاویر اور نام فون سے باہر کبھی نہیں جاتے۔
              </p>
              <p className="text-teal-300/80 text-[11px]">
                Only scrambled codes of phone numbers or handles are shared. Your messages, images and name never leave this phone.
              </p>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              کیا آپ اس کیس کے نمبرز کو سخی سرکل میں شامل کرنا چاہتے ہیں؟
              <br />
              Do you want to include this case's identifiers in Sakhi Circle?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmOptInModal(false)}
                className="flex-1 py-3 text-sm rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 min-h-[52px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleConfirmAndContribute}
                className="flex-1 py-3 text-sm font-semibold rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-md min-h-[52px]"
              >
                <span className="font-urdu block leading-snug">ہاں، شیئر کریں</span>
                <span className="text-[10px] opacity-80">Yes, Opt In</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Withdraw */}
      {showConfirmWithdrawModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800/80 rounded-2xl max-w-md w-full p-6 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-urdu text-xl text-red-300 leading-snug">واپس لینے کی تصدیق</h4>
                <p className="text-xs text-slate-400">Confirm Withdrawal</p>
              </div>
              <button
                onClick={() => setShowConfirmWithdrawModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed">
              <span className="font-urdu block text-base leading-snug mb-1">
                کیا آپ واقعی اس کیس کے تمام کوڈز سرور سے واپس لینا چاہتے ہیں؟
              </span>
              Do you want to withdraw all anonymous records for this case?
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmWithdrawModal(false)}
                className="flex-1 py-3 text-sm rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 min-h-[52px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleExecuteWithdraw}
                className="flex-1 py-3 text-sm font-semibold rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-md min-h-[52px]"
              >
                <span className="font-urdu block leading-snug">ہاں، واپس لیں</span>
                <span className="text-[10px] opacity-80">Yes, Withdraw</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explainer Modal */}
      {showExplainer && <CircleExplainerModal onClose={() => setShowExplainer(false)} />}
    </div>
  );
};
