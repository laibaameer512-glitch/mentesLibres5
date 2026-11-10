import React, { useEffect, useRef, useState } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';

interface PanicBarProps {
  onPanicLock: () => void;
  vaultType: 'real' | 'decoy';
}

export const PanicBar: React.FC<PanicBarProps> = ({ onPanicLock, vaultType }) => {
  const getTimeoutDuration = () => {
    const saved = parseInt(localStorage.getItem('autoLockTimeout') || '60', 10);
    return Number.isNaN(saved) || saved <= 0 ? 60 : saved;
  };

  const [secondsRemaining, setSecondsRemaining] = useState(getTimeoutDuration);
  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const timeoutDuration = getTimeoutDuration();
    setSecondsRemaining(timeoutDuration);

    // 1. Reset timer on user interaction
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      setSecondsRemaining(getTimeoutDuration());
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    // 2. Interval check for inactivity
    timerRef.current = setInterval(() => {
      const duration = getTimeoutDuration();
      const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, duration - elapsed);
      setSecondsRemaining(remaining);

      if (remaining <= 0) {
        onPanicLock();
      }
    }, 1000);

    // 3. Tab visibility check: if tab hidden or window blurred, lock immediately!
    const handleVisibilityChange = () => {
      if (document.hidden) {
        onPanicLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [onPanicLock]);

  // Hidden tap area click counter (e.g. 1 click or double click on top-left corner)
  const handleSecretCornerTap = () => {
    onPanicLock();
  };

  return (
    <>
      {/* Invisible secret tap zone in top-left corner of viewport */}
      <div
        onClick={handleSecretCornerTap}
        title="Quick Exit"
        className="fixed top-0 left-0 w-14 h-14 z-[9999] cursor-pointer opacity-0 hover:opacity-10 transition-opacity bg-red-500/20"
      />

      {/* Vault Status & Panic Bar */}
      <div className="w-full bg-slate-950/80 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          {/* Secret Corner visual dot */}
          <button
            onClick={handleSecretCornerTap}
            className="w-2.5 h-2.5 rounded-full bg-teal-500/80 hover:bg-red-500 transition-colors"
            title="Tap to instant lock"
          />
          <span className="font-medium text-slate-300">
            {vaultType === 'real' ? 'Secure Vault' : 'Personal Notes'}
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            • Auto-locks in {secondsRemaining}s
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onPanicLock}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/70 border border-red-800/70 hover:bg-red-900/80 text-red-200 text-xs font-semibold transition active:scale-95 shadow-sm"
            title="Instantly wipes in-memory keys and returns to calculator"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Panic Hide</span>
          </button>
        </div>
      </div>
    </>
  );
};
