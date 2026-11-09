import React from 'react';
import { Shield, AlertCircle, Cpu, FileCheck2, X, Lock } from 'lucide-react';

interface CircleExplainerModalProps {
  onClose: () => void;
}

export const CircleExplainerModal: React.FC<CircleExplainerModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 text-slate-200 shadow-2xl relative my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-teal-950 border border-teal-500/40 flex items-center justify-center text-teal-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">How Sakhi Circle Works & Its Limits</h2>
            <p className="text-xs text-teal-400">Cryptographic Anonymous Pattern Matching</p>
          </div>
        </div>

        <div className="space-y-4 text-xs leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
          {/* Core Concept */}
          <section className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <h3 className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              Zero-Knowledge Disconnect
            </h3>
            <p className="text-slate-300">
              Sakhi Circle solves a critical paradox: how can victims know if the same serial harasser or extortionist is targeting others, without exposing their identities, reading their chats, or maintaining a public registry?
            </p>
            <p className="text-slate-400">
              Only canonical normalized codes (e.g. phone numbers or handles) are sent. The server instantly computes an irreversible HMAC-SHA256 hash using a server-side secret key, records only the scrambled hash and a device pseudonym, and immediately discards the raw number. Your messages, images, notes, and identity never leave this device.
            </p>
          </section>

          {/* Prototype Disclosure */}
          <section className="bg-amber-950/30 border border-amber-800/60 rounded-xl p-3.5 space-y-2">
            <h3 className="font-semibold text-amber-300 flex items-center gap-1.5 text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              Prototype Status & Non-Guilt Principle
            </h3>
            <p className="text-amber-200/90">
              <strong>This is a research prototype.</strong> Sakhi Circle does not decide guilt, establish criminal culpability, or replace institutional investigation or judicial due process.
            </p>
            <p className="text-amber-300/80">
              A match indicates only that multiple independent devices submitted reports matching the same identifier. It provides institutional counselors and legal advocates corroborating context to prioritize urgent cases.
            </p>
          </section>

          {/* Production Path */}
          <section className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <h3 className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              Production Roadmap: Verified Onboarding & PSI
            </h3>
            <p className="text-slate-300">
              A production deployment beyond this hackathon architecture requires:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li>
                <strong className="text-slate-300">Private Set Intersection (PSI):</strong> Multi-party computation where matching occurs without even the server knowing which hashes collided.
              </li>
              <li>
                <strong className="text-slate-300">Verified Institutional Onboarding:</strong> Integration with accredited crisis NGO caseworkers or digital notary keys to prevent Sybil attacks.
              </li>
              <li>
                <strong className="text-slate-300">Blind Signatures:</strong> Zero-knowledge anonymous credentials to decouple authentication from reporting.
              </li>
            </ul>
          </section>

          {/* Explicit Assumptions */}
          <section className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <h3 className="font-semibold text-white flex items-center gap-1.5 text-xs">
              <FileCheck2 className="w-3.5 h-3.5 text-teal-400" />
              Explicit Technical & Operational Assumptions
            </h3>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400 pl-1">
              <li>
                <strong className="text-slate-300">PTA SIM Registration:</strong> Assumes Pakistani cell numbers correspond to persistent identity SIMs under Pakistan's PTA DIRBS biometric framework.
              </li>
              <li>
                <strong className="text-slate-300">Identifier Normalization:</strong> Assumes phone numbers (+92) and social handles can be reliably formatted to prevent unintentional hash divergence.
              </li>
              <li>
                <strong className="text-slate-300">No False Coordination:</strong> Assumes reporting devices act independently without organized malicious collusion against arbitrary individuals.
              </li>
              <li>
                <strong className="text-slate-300">Local Device Cleanliness:</strong> Assumes the victim's physical handset is free of active rootkits or keyloggers that could capture keystrokes locally.
              </li>
              <li>
                <strong className="text-slate-300">Server Secret Integrity:</strong> Assumes server-side <code className="text-teal-400 bg-slate-900 px-1 py-0.5 rounded font-mono">CIRCLE_SECRET</code> remains confidential against dictionary attacks on telephone number space.
              </li>
            </ol>
          </section>
        </div>

        <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl text-xs transition"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};
