import React, { useState } from 'react';
import { Shield, KeyRound, AlertCircle, CheckCircle2 } from 'lucide-react';
import { createPinVerifier } from '../lib/crypto.ts';
import { storeAuthConfig } from '../lib/db.ts';

interface SetupModalProps {
  onComplete: (realPin: string, decoyPin: string) => void;
  onCancel?: () => void;
  isInitialSetup?: boolean;
}

export const SetupModal: React.FC<SetupModalProps> = ({
  onComplete,
  onCancel,
  isInitialSetup = true,
}) => {
  const [realPin, setRealPin] = useState('');
  const [confirmRealPin, setConfirmRealPin] = useState('');
  const [decoyPin, setDecoyPin] = useState('');
  const [confirmDecoyPin, setConfirmDecoyPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (realPin.length < 6 || realPin.length > 8) {
      setError('Primary PIN must be at least 6 digits (6 to 8 digits).');
      return;
    }
    if (realPin !== confirmRealPin) {
      setError('Primary PIN confirmation does not match.');
      return;
    }
    if (decoyPin.length < 6 || decoyPin.length > 8) {
      setError('Decoy PIN must be at least 6 digits (6 to 8 digits).');
      return;
    }
    if (decoyPin !== confirmDecoyPin) {
      setError('Decoy PIN confirmation does not match.');
      return;
    }
    if (realPin === decoyPin) {
      setError('Real PIN and Decoy PIN must be strictly different.');
      return;
    }

    setIsSaving(true);
    try {
      // Derive salted verifiers via Web Crypto PBKDF2 (600,000 rounds)
      const realVerifier = await createPinVerifier(realPin);
      const decoyVerifier = await createPinVerifier(decoyPin);

      // Store only the verifiers, never the plain PIN
      await storeAuthConfig(realVerifier, decoyVerifier);
      onComplete(realPin, decoyPin);
    } catch (err) {
      setError('Failed to securely initialize cryptographic verifiers. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-slate-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-teal-950/80 border border-teal-800/60 flex items-center justify-center text-teal-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">
              {isInitialSetup ? 'Security Setup' : 'Update Security PINs'}
            </h2>
            <p className="text-xs text-slate-400">
              Configure dual-passcode protection with plausible deniability
            </p>
          </div>
        </div>

        {/* Short Security Note required by prompt */}
        <div className="mb-4 p-2.5 bg-teal-950/40 border border-teal-800/50 rounded-xl flex items-center gap-2 text-xs text-teal-300">
          <Shield className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="font-medium">Longer PINs are harder to guess.</span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-start gap-2.5 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Real PIN */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> 1. Real Vault PIN
              </label>
              <span className="text-[11px] text-slate-400 font-medium">6-8 digits</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Opens your real, encrypted evidence vault. Never reveal this PIN.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="Real PIN (e.g. 789012)"
                value={realPin}
                onChange={(e) => setRealPin(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="Confirm Real PIN"
                value={confirmRealPin}
                onChange={(e) => setConfirmRealPin(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Decoy PIN */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> 2. Decoy / Duress PIN
              </label>
              <span className="text-[11px] text-slate-400 font-medium">6-8 digits (differs)</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              If coerced to unlock, entering this opens an innocuous fake vault (recipes & notes). The real evidence is never decrypted.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="Decoy PIN (e.g. 123456)"
                value={decoyPin}
                onChange={(e) => setDecoyPin(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                placeholder="Confirm Decoy PIN"
                value={confirmDecoyPin}
                onChange={(e) => setConfirmDecoyPin(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="pt-2 flex gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-semibold shadow-lg shadow-teal-900/30 transition flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isSaving ? 'Encrypting & Initializing...' : 'Save & Lock Calculator'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
