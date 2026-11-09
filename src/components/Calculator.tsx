import React, { useState, useRef, useEffect } from 'react';
import {
  verifyPin,
  deriveAesKey,
  PinVerifierData,
  authenticatePinWithConstantCostAndDelay,
} from '../lib/crypto.ts';
import { getStoredAuthConfig, VaultCase, saveRealCase, wipeAllData } from '../lib/db.ts';
import { createDemoCase } from '../lib/demoData.ts';
import { Settings, Sparkles, RotateCcw, Check, AlertCircle, Cpu, Shield } from 'lucide-react';
import { DeveloperHealthModal } from './DeveloperHealthModal.tsx';

interface CalculatorProps {
  onUnlockReal: (key: CryptoKey, pin: string) => void;
  onUnlockDecoy: (key: CryptoKey, pin: string) => void;
  onOpenSetup: () => void;
  hasAuthConfig: boolean;
  onNavigateCounselor?: () => void;
}

export const Calculator: React.FC<CalculatorProps> = ({
  onUnlockReal,
  onUnlockDecoy,
  onOpenSetup,
  hasAuthConfig,
  onNavigateCounselor,
}) => {
  const [display, setDisplay] = useState('0');
  const [prevEquation, setPrevEquation] = useState('');
  const [waitingForOperand, setWaitingForOperand] = useState(false);
  const [operator, setOperator] = useState<string | null>(null);
  const [storedValue, setStoredValue] = useState<number | null>(null);

  // Hidden demo long-press state & Developer health modal
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showDevHealthModal, setShowDevHealthModal] = useState(false);
  const [demoToast, setDemoToast] = useState<string | null>(null);
  const longPressTimerRef = useRef<any>(null);

  // C pressed 5 times gesture tracking
  const cPressCountRef = useRef(0);
  const lastCPressTimeRef = useRef(0);

  // Buffer of typed digits for secret PIN detection
  const typedSequenceRef = useRef<string>('');

  // Handle number input
  const inputDigit = (digit: string) => {
    typedSequenceRef.current += digit;

    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  // Handle decimal point
  const inputDecimal = () => {
    typedSequenceRef.current += '.';
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  // Clear or Emergency Reset
  const handleClear = () => {
    const now = Date.now();
    if (now - lastCPressTimeRef.current < 600) {
      cPressCountRef.current += 1;
    } else {
      cPressCountRef.current = 1;
    }
    lastCPressTimeRef.current = now;

    // Gesture: C pressed 5 times in quick succession
    // CRITICAL REQUIREMENT: ONLY returns to calculator and clears in-memory state.
    // MUST NEVER delete stored data. Stored data is only deleted via Settings > Delete Everything with confirmation.
    if (cPressCountRef.current >= 5) {
      cPressCountRef.current = 0;
      typedSequenceRef.current = '';
      setDisplay('0');
      setPrevEquation('');
      setOperator(null);
      setStoredValue(null);
      setWaitingForOperand(false);
      return;
    }

    setDisplay('0');
    setPrevEquation('');
    setStoredValue(null);
    setOperator(null);
    setWaitingForOperand(false);
    typedSequenceRef.current = '';
  };

  // Backspace
  const handleBackspace = () => {
    if (display.length > 1) {
      setDisplay(display.slice(0, -1));
      typedSequenceRef.current = typedSequenceRef.current.slice(0, -1);
    } else {
      setDisplay('0');
      typedSequenceRef.current = '';
    }
  };

  // Arithmetic operations (+, -, ×, ÷, %)
  const performOperation = (nextOperator: string) => {
    const inputValue = parseFloat(display);

    if (nextOperator === '%') {
      const result = inputValue / 100;
      setDisplay(String(result));
      return;
    }

    if (nextOperator === '+/-') {
      const result = inputValue * -1;
      setDisplay(String(result));
      return;
    }

    typedSequenceRef.current = ''; // Reset typed sequence when normal math op is selected

    if (storedValue === null) {
      setStoredValue(inputValue);
      setPrevEquation(`${inputValue} ${nextOperator}`);
    } else if (operator) {
      const currentValue = storedValue || 0;
      const newValue = calculate(currentValue, inputValue, operator);
      setStoredValue(newValue);
      setDisplay(String(newValue));
      setPrevEquation(`${newValue} ${nextOperator}`);
    }

    setWaitingForOperand(true);
    setOperator(nextOperator);
  };

  const calculate = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '×':
        return a * b;
      case '÷':
        return b !== 0 ? a / b : 0;
      default:
        return b;
    }
  };

  // Silent alert stub called when decoy PIN is entered
  const triggerSilentAlert = async () => {
    console.warn('[SECURITY] triggerSilentAlert() triggered: Decoy PIN unlocked under duress.');
    try {
      await fetch('/api/silent-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          clientHint: navigator.userAgent,
          location: 'approximate_network_cell',
        }),
      });
    } catch {
      // Ignore network errors silently
    }
  };

  // Handle "=" key evaluation AND secret vault detection
  const handleEquals = async () => {
    const candidatePin = typedSequenceRef.current.trim() || display.trim();

    // Minimum 6 digits required for secret PINs
    if (hasAuthConfig && /^\d{6,8}$/.test(candidatePin)) {
      const auth = await getStoredAuthConfig();
      if (auth && (auth.real || auth.decoy)) {
        // Equal derivation cost (both slots derived in parallel) and identical padded transition delay (750ms minimum)
        const authResult = await authenticatePinWithConstantCostAndDelay(candidatePin, auth, 750);

        if (authResult.match === 'real' && authResult.key) {
          typedSequenceRef.current = '';
          onUnlockReal(authResult.key, candidatePin);
          return;
        }

        if (authResult.match === 'decoy' && authResult.key) {
          typedSequenceRef.current = '';
          triggerSilentAlert();
          onUnlockDecoy(authResult.key, candidatePin);
          return;
        }
      }
    }

    // Normal calculation evaluation if not a matching PIN
    typedSequenceRef.current = '';
    const inputValue = parseFloat(display);

    if (operator && storedValue !== null) {
      const result = calculate(storedValue, inputValue, operator);
      setPrevEquation(`${storedValue} ${operator} ${inputValue} =`);
      setDisplay(String(result));
      setStoredValue(null);
      setOperator(null);
      setWaitingForOperand(true);
    }
  };

  // Long-press handlers on "=" button to load demo data
  const handleEqualsMouseDown = () => {
    longPressTimerRef.current = setTimeout(() => {
      setShowDemoModal(true);
    }, 1400); // 1.4s long press
  };

  const handleEqualsMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  };

  // Seed Demo Data into DB
  const handleSeedDemoData = async () => {
    try {
      const auth = await getStoredAuthConfig();
      if (!auth || !auth.real) {
        setDemoToast('Please configure security PINs first via the top settings icon.');
        setShowDemoModal(false);
        return;
      }

      // Default demo PIN is the user's real PIN or prompt
      const demoPin = prompt('Enter your Real PIN to encrypt and seed demo data:') || '';
      if (!demoPin) return;

      const isMatch = await verifyPin(demoPin, auth.real);
      if (!isMatch) {
        alert('PIN did not match stored verifier.');
        return;
      }

      const realKey = await deriveAesKey(demoPin, auth.real.saltHex);
      const demoCase = createDemoCase();
      await saveRealCase(realKey, demoCase);

      setDemoToast('Demo Case with 15 screenshots & 2 audio transcripts loaded!');
      setShowDemoModal(false);
      setTimeout(() => setDemoToast(null), 4000);
    } catch (err: any) {
      alert('Failed to seed demo data: ' + err.message);
    }
  };

  const handleResetEverything = async () => {
    if (window.confirm('Reset all vault databases, cases, and cryptographic verifiers?')) {
      await wipeAllData();
      localStorage.clear();
      setDemoToast('Vault reset to clean state.');
      setShowDemoModal(false);
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b0f] flex flex-col items-center justify-center p-3 select-none">
      {/* Toast */}
      {demoToast && (
        <div className="fixed top-4 z-50 px-4 py-2 bg-teal-900/90 border border-teal-500 text-teal-100 text-xs rounded-xl shadow-lg flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-teal-400" />
          <span>{demoToast}</span>
        </div>
      )}

      {/* Main Calculator Shell: Authentically sized for mobile phones (390px) and desktop */}
      <div className="w-full max-w-[390px] bg-[#121820] border border-slate-800/90 rounded-[32px] p-5 shadow-2xl flex flex-col justify-between aspect-[9/16] max-h-[820px]">
        {/* Top Disguised Header */}
        <div className="flex items-center justify-between text-slate-500 text-xs px-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-wider text-slate-400">CALCULATOR</span>
            <span className="text-[10px] text-slate-600 font-mono">v3.2</span>
          </div>
          <button
            onClick={onOpenSetup}
            title="Calculator Settings & Precision"
            className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800/60 transition"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Display Screen */}
        <div className="flex-1 flex flex-col justify-end items-end px-3 py-6 font-mono text-right overflow-hidden">
          <div className="text-sm text-slate-500 h-6 truncate max-w-full">
            {prevEquation}
          </div>
          <div className="text-5xl font-light text-white tracking-tight break-all max-h-24 overflow-hidden">
            {display}
          </div>
        </div>

        {/* Keypad Grid */}
        <div className="grid grid-cols-4 gap-2.5 pb-2">
          {/* Row 1 */}
          <button
            onClick={handleClear}
            className="h-16 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-600 text-amber-400 font-bold text-lg transition flex items-center justify-center"
          >
            C
          </button>
          <button
            onClick={() => performOperation('+/-')}
            className="h-16 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-medium text-lg transition flex items-center justify-center"
          >
            ±
          </button>
          <button
            onClick={() => performOperation('%')}
            className="h-16 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-slate-600 text-slate-200 font-medium text-lg transition flex items-center justify-center"
          >
            %
          </button>
          <button
            onClick={() => performOperation('÷')}
            className="h-16 rounded-2xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-2xl transition flex items-center justify-center"
          >
            ÷
          </button>

          {/* Row 2 */}
          <button
            onClick={() => inputDigit('7')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            7
          </button>
          <button
            onClick={() => inputDigit('8')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            8
          </button>
          <button
            onClick={() => inputDigit('9')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            9
          </button>
          <button
            onClick={() => performOperation('×')}
            className="h-16 rounded-2xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-2xl transition flex items-center justify-center"
          >
            ×
          </button>

          {/* Row 3 */}
          <button
            onClick={() => inputDigit('4')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            4
          </button>
          <button
            onClick={() => inputDigit('5')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            5
          </button>
          <button
            onClick={() => inputDigit('6')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            6
          </button>
          <button
            onClick={() => performOperation('-')}
            className="h-16 rounded-2xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-2xl transition flex items-center justify-center"
          >
            −
          </button>

          {/* Row 4 */}
          <button
            onClick={() => inputDigit('1')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            1
          </button>
          <button
            onClick={() => inputDigit('2')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            2
          </button>
          <button
            onClick={() => inputDigit('3')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            3
          </button>
          <button
            onClick={() => performOperation('+')}
            className="h-16 rounded-2xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white font-bold text-2xl transition flex items-center justify-center"
          >
            +
          </button>

          {/* Row 5 */}
          <button
            onClick={() => inputDigit('0')}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-medium text-2xl transition flex items-center justify-center"
          >
            0
          </button>
          <button
            onClick={inputDecimal}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-white font-bold text-2xl transition flex items-center justify-center"
          >
            .
          </button>
          <button
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-slate-700 text-slate-400 hover:text-white font-medium text-xl transition flex items-center justify-center"
          >
            ⌫
          </button>
          <button
            onClick={handleEquals}
            onMouseDown={handleEqualsMouseDown}
            onMouseUp={handleEqualsMouseUp}
            onTouchStart={handleEqualsMouseDown}
            onTouchEnd={handleEqualsMouseUp}
            className="h-16 rounded-2xl bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-white font-bold text-2xl shadow-lg shadow-teal-950 transition flex items-center justify-center"
            title="Press = to calculate (or hold 1.5s for demo tools)"
          >
            =
          </button>
        </div>
      </div>

      {/* Hidden Demo Modal (Triggered by long-press on "=") */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-sm font-bold text-teal-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Demo Tooling (Hackathon Jury)</span>
              </h4>
              <button
                onClick={() => setShowDemoModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Long-press trigger recognized. Load 15 fictional dummy screenshots, 2 sample voice transcripts, and a WhatsApp chat into your encrypted vault for live testing.
            </p>
            <div className="space-y-2 pt-1">
              <button
                onClick={handleSeedDemoData}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl transition shadow flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Load 15 Dummy Screenshots & Transcripts</span>
              </button>
              <button
                onClick={() => {
                  setShowDemoModal(false);
                  setShowDevHealthModal(true);
                }}
                className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold rounded-xl border border-teal-800/60 transition flex items-center justify-center gap-2"
              >
                <Cpu className="w-4 h-4 text-teal-400" />
                <span>Model Diagnostics (/api/health)</span>
              </button>
              {onNavigateCounselor && (
                <button
                  onClick={() => {
                    setShowDemoModal(false);
                    onNavigateCounselor();
                  }}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-teal-950/80 text-teal-300 text-xs font-semibold rounded-xl border border-teal-800 transition flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4 text-teal-400" />
                  <span>Open Counselor Portal (/counselor)</span>
                </button>
              )}
              <button
                onClick={handleResetEverything}
                className="w-full py-2.5 px-4 bg-red-950/80 border border-red-800 hover:bg-red-900 text-red-300 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Vault to Factory State</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden Developer Model Health Screen */}
      {showDevHealthModal && (
        <DeveloperHealthModal onClose={() => setShowDevHealthModal(false)} />
      )}
    </div>
  );
};
