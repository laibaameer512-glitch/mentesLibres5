import React, { useState } from 'react';
import { wipeAllData } from '../lib/db.ts';
import { Shield, Trash2, KeyRound, AlertTriangle, CheckCircle2, Lock, Cpu } from 'lucide-react';
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

  const privacyNoticeLines = [
    '1. All evidence records, chat screenshots, and audio transcripts are encrypted locally on your device with AES-GCM 256-bit cryptography.',
    '2. Screenshots and audio are sent to an AI provider for text extraction. Phone numbers, emails and CNICs are redacted from text before further AI analysis. Names are redacted only if you mark them.',
    '3. Plausible deniability PINs ensure your real vault cannot be decrypted, inferred, or unlocked under physical coercion.',
    '4. An innocuous decoy vault opens when the secondary PIN is entered, protecting your real evidence from forced discovery.',
    '5. You retain unilateral sovereign control to instantly purge all stored records and verifiers in a single irreversible action.',
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

      {/* 5-Line Plain-Language Privacy Notice */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3.5 shadow-sm">
        <h3 className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-2">
          <Lock className="w-4 h-4" />
          <span>Plain-Language Privacy Notice</span>
        </h3>
        <div className="space-y-2.5">
          {privacyNoticeLines.map((line, idx) => (
            <div
              key={idx}
              className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-200 leading-relaxed font-sans"
            >
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Passcode Configuration */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-teal-400" />
          <span>Passcode Management</span>
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Update your Real PIN or Decoy Duress PIN. Stored using Web Crypto PBKDF2 with 600,000 hashing rounds.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={onOpenPinSetup}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold rounded-xl border border-teal-700/60 transition"
          >
            Change Security PINs
          </button>
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
