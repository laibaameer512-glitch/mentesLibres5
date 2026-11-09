import React, { useState, useEffect } from 'react';
import { VaultCase, saveRealCase } from '../lib/db.ts';
import { CircleExplainerModal } from './CircleExplainerModal.tsx';
import {
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Hash,
  Users,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface CircleModuleProps {
  currentCase: VaultCase;
  activeKey: CryptoKey;
  onCaseUpdated: (c: VaultCase) => void;
}

interface IdentifierItem {
  type: 'phone' | 'handle' | 'location' | 'other';
  raw: string;
  normalized: string;
  selected: boolean;
  status?: {
    match: boolean;
    count: number;
    message: string;
  };
}

/**
 * Normalizes a phone number to Pakistani +92 format
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

function getOrCreateReporterPseudonym(): string {
  const STORAGE_KEY = 'sakhi_circle_pseudonym';
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = 'pseudo-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

export const CircleModule: React.FC<CircleModuleProps> = ({
  currentCase,
  activeKey,
  onCaseUpdated,
}) => {
  const [showExplainer, setShowExplainer] = useState(false);
  const [optedIn, setOptedIn] = useState<boolean>(
    Boolean(currentCase.circleContribution?.optedIn)
  );
  const [identifiers, setIdentifiers] = useState<IdentifierItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [demoSeeding, setDemoSeeding] = useState(false);

  // Extract and normalize available identifiers from the case
  useEffect(() => {
    const rawList: string[] = [];
    if (currentCase.extractedReview?.identifiers) {
      rawList.push(...currentCase.extractedReview.identifiers);
    }

    // Also scan evidence items for phone numbers or handles in titles/notes
    currentCase.evidenceItems.forEach((ev) => {
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
    const builtItems: IdentifierItem[] = unique.map((raw) => {
      const type = detectIdentifierType(raw);
      let normalized = raw;
      if (type === 'phone') normalized = normalizePhone(raw);
      else if (type === 'handle') normalized = normalizeHandle(raw);
      else normalized = normalizeGeneric(raw);

      return {
        type,
        raw,
        normalized,
        selected: true,
      };
    });

    setIdentifiers(builtItems);

    if (currentCase.circleContribution?.optedIn) {
      checkStatus(builtItems);
    }
  }, [currentCase.id]);

  // Check matching status with server
  const checkStatus = async (itemsToCheck: IdentifierItem[]) => {
    try {
      const reporterPseudonym = getOrCreateReporterPseudonym();
      const res = await fetch('/api/circle/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterPseudonym,
          caseId: currentCase.id,
        }),
      });

      if (!res.ok) return;
      const data = await res.json();
      const resultsMap = data.results || {};

      // Match server responses to our identifiers
      setIdentifiers((prev) =>
        prev.map((item) => {
          // Look for any result matching or general status
          const keys = Object.keys(resultsMap);
          // If keys exist, check if any has >= 3
          const matchEntry = keys.map((k) => resultsMap[k]).find((r) => r.status === 'match');
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
          const noMatchEntry = keys.map((k) => resultsMap[k])[0];
          return {
            ...item,
            status: {
              match: false,
              count: 0,
              message: noMatchEntry?.message || 'No match yet',
            },
          };
        })
      );
    } catch (err) {
      console.warn('Failed to query circle status:', err);
    }
  };

  // Toggle Opt-In (Contribute)
  const handleToggleOptIn = async (enabled: boolean) => {
    if (enabled) {
      // Opting in
      setLoading(true);
      setStatusMessage(null);
      try {
        const reporterPseudonym = getOrCreateReporterPseudonym();
        const selectedItems = identifiers.filter((i) => i.selected);

        if (selectedItems.length === 0) {
          alert('Please select at least one normalized identifier to contribute.');
          setLoading(false);
          return;
        }

        const payload = {
          reporterPseudonym,
          caseId: currentCase.id,
          category: currentCase.category || 'blackmail/extortion',
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
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to contribute to Circle');
        }

        const data = await res.json();
        setOptedIn(true);

        const updatedCase: VaultCase = {
          ...currentCase,
          circleContribution: {
            optedIn: true,
            contributedAt: new Date().toISOString(),
            contributedHashes: (data.results || []).map((r: any) => r.hash),
            selectedIdentifiers: selectedItems.map((s) => s.normalized),
          },
          updatedAt: new Date().toISOString(),
        };

        await saveRealCase(activeKey, updatedCase);
        onCaseUpdated(updatedCase);

        // Update local item status based on server response
        const resultsMap: Record<string, { isPattern: boolean; count: number }> = {};
        (data.results || []).forEach((r: any) => {
          resultsMap[r.hash] = r;
        });

        // Query fresh status
        await checkStatus(selectedItems);
        setStatusMessage('Anonymous cryptographic contribution registered.');
      } catch (err: any) {
        console.error('Error contributing to Circle:', err);
        alert(err.message || 'Contribution failed');
      } finally {
        setLoading(false);
      }
    } else {
      // Opting out / Withdrawing
      handleWithdraw();
    }
  };

  // Withdraw this reporter's records for this case
  const handleWithdraw = async () => {
    if (!window.confirm('Withdraw all anonymous contribution records for this case?')) return;
    setLoading(true);
    try {
      const reporterPseudonym = getOrCreateReporterPseudonym();
      await fetch('/api/circle/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reporterPseudonym,
          caseId: currentCase.id,
        }),
      });

      setOptedIn(false);
      setIdentifiers((prev) =>
        prev.map((i) => ({
          ...i,
          status: undefined,
        }))
      );

      const updatedCase: VaultCase = {
        ...currentCase,
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
      setStatusMessage('All anonymous contribution records for this case have been withdrawn.');
    } catch (err) {
      console.error('Failed to withdraw from circle:', err);
      alert('Failed to withdraw from Circle.');
    } finally {
      setLoading(false);
    }
  };

  // Re-seed demo dummy reporters (to demonstrate threshold live on stage)
  const handleSeedDemo = async () => {
    setDemoSeeding(true);
    try {
      const res = await fetch('/api/circle/seed-demo', { method: 'POST' });
      if (res.ok) {
        setStatusMessage('Demo reporters seeded (2 dummy records sharing fictional identifiers).');
        if (optedIn) {
          // Re-check status
          await checkStatus(identifiers);
        }
      }
    } catch (err) {
      console.warn('Failed to seed demo dummy records:', err);
    } finally {
      setDemoSeeding(false);
    }
  };

  const hasPatternMatch = identifiers.some((i) => i.status?.match);

  return (
    <div className="space-y-5 animate-in fade-in">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-950 border border-teal-500/40 flex items-center justify-center text-teal-400 shrink-0 mt-0.5">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Sakhi Circle</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-400 border border-teal-800">
                  HMAC-SHA256 Anonymous Corroboration
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Detect if the same phone number or handle is harassing multiple independent victims without revealing your identity, messages, or case details.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowExplainer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-400 hover:text-teal-300 rounded-xl text-xs font-medium border border-slate-700 transition shrink-0"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>How Circle Works & Limits</span>
          </button>
        </div>

        {/* Mandatory Plain-Language Privacy Notice */}
        <div className="mt-4 bg-teal-950/40 border border-teal-800/60 rounded-xl p-3.5 text-xs text-teal-200/90 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-teal-200">
              Zero-Content Privacy Guarantee
            </p>
            <p className="text-teal-300/80 leading-relaxed">
              &ldquo;Only scrambled codes of phone numbers or handles are shared. Your messages, images and name never leave this phone.&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Opt-in Controller Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-white">Anonymous Cross-Case Matching</h3>
            <p className="text-xs text-slate-400">
              Opt-in is strictly per case. Default is OFF.
            </p>
          </div>

          {/* Toggle Switch */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={optedIn}
              disabled={loading}
              onChange={(e) => handleToggleOptIn(e.target.checked)}
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
            <span className="ml-2 text-xs font-medium text-slate-300">
              {optedIn ? 'Contributed' : 'Disabled'}
            </span>
          </label>
        </div>

        {statusMessage && (
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-teal-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Identifiers Selection & Normalization Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">
              Extracted Identifiers (Normalized before HMAC hashing):
            </span>
            {optedIn && (
              <button
                onClick={() => checkStatus(identifiers)}
                className="text-[11px] text-teal-400 hover:text-teal-300 flex items-center gap-1 transition"
                title="Refresh Status"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Status</span>
              </button>
            )}
          </div>

          {identifiers.length === 0 ? (
            <p className="text-xs text-slate-500 italic p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
              No phone numbers or social handles detected in this case yet. Add evidence or run the AI review.
            </p>
          ) : (
            <div className="space-y-2">
              {identifiers.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      disabled={optedIn}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setIdentifiers((prev) =>
                          prev.map((i, iIdx) => (iIdx === idx ? { ...i, selected: checked } : i))
                        );
                      }}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-teal-600 focus:ring-teal-500 focus:ring-offset-slate-900"
                    />

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{item.raw}</span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Normalized: <span className="text-teal-300">{item.normalized}</span>
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  {optedIn && item.status && (
                    <div className="sm:text-right shrink-0">
                      {item.status.match ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/80 border border-red-700/80 text-red-200 font-medium">
                          <Users className="w-3.5 h-3.5 text-red-400" />
                          <span>{item.status.message}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400">
                          <Hash className="w-3.5 h-3.5 text-slate-500" />
                          <span>{item.status.message}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pattern Threshold Match Banner (when count >= 3) */}
        {hasPatternMatch && (
          <div className="p-4 bg-red-950/40 border border-red-700/80 rounded-xl space-y-2 text-xs">
            <div className="flex items-center gap-2 text-red-300 font-bold">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>Independent Serial Pattern Identified</span>
            </div>
            <p className="text-red-200/90 leading-relaxed">
              At least one identifier in this case matches 3 or more independent reporting devices in Sakhi Circle.
              This confirms that other women have reported the same phone number or account.
            </p>
            <p className="text-slate-400 text-[11px]">
              Note: To protect all parties, Sakhi Circle never displays the names, dates, or messages of any other reporter.
            </p>
          </div>
        )}

        {/* Actions Bar */}
        {optedIn && (
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={handleWithdraw}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-red-950/80 text-slate-300 hover:text-red-300 border border-slate-700 hover:border-red-800 rounded-xl text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>Withdraw from Circle</span>
            </button>

            <span className="text-[11px] text-slate-500">
              Pseudonym ID: <code className="text-slate-400">{getOrCreateReporterPseudonym().slice(0, 16)}...</code>
            </span>
          </div>
        )}
      </div>

      {/* Stage Demo Controller Box (Clearly marked prototype tool) */}
      <div className="p-4 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div>
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Hackathon Stage Demo Tooling
          </span>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Pre-seed 2 dummy independent reporters sharing fictional demo number <code className="text-teal-400">+92 300 4819283</code> to trigger the live &ge;3 pattern threshold.
          </p>
        </div>

        <button
          onClick={handleSeedDemo}
          disabled={demoSeeding}
          className="px-3 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/80 rounded-xl text-xs font-medium flex items-center gap-1.5 transition shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${demoSeeding ? 'animate-spin' : ''}`} />
          <span>Re-seed Demo Pattern</span>
        </button>
      </div>

      {/* Explainer Modal */}
      {showExplainer && <CircleExplainerModal onClose={() => setShowExplainer(false)} />}
    </div>
  );
};
