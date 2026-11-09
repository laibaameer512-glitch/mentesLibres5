/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Calculator } from './components/Calculator.tsx';
import { SetupModal } from './components/SetupModal.tsx';
import { VaultDashboard } from './components/VaultDashboard.tsx';
import { DecoyVault } from './components/DecoyVault.tsx';
import { CircleCounselorPortal } from './components/CircleCounselorPortal.tsx';
import {
  getStoredAuthConfig,
  loadAllRealCases,
  saveRealCase,
  VaultCase,
} from './lib/db.ts';
import { createDemoCase } from './lib/demoData.ts';

type AppMode = 'calculator' | 'real_vault' | 'decoy_vault';

export default function App() {
  const [mode, setMode] = useState<AppMode>('calculator');
  const [currentPath, setCurrentPath] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [hasAuthConfig, setHasAuthConfig] = useState<boolean>(false);
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [activeRealKey, setActiveRealKey] = useState<CryptoKey | null>(null);
  const [activeDecoyKey, setActiveDecoyKey] = useState<CryptoKey | null>(null);
  const [cases, setCases] = useState<VaultCase[]>([]);

  // Listen to browser navigation popstate
  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigateCounselor = () => {
    window.history.pushState({}, '', '/counselor');
    setCurrentPath('/counselor');
  };

  const handleReturnFromCounselor = () => {
    window.history.pushState({}, '', '/');
    setCurrentPath('/');
  };

  // Check initial setup state on launch
  useEffect(() => {
    checkAuthConfig();
  }, []);

  const checkAuthConfig = async () => {
    try {
      const stored = await getStoredAuthConfig();
      if (stored && stored.real && stored.decoy) {
        setHasAuthConfig(true);
      } else {
        setHasAuthConfig(false);
        // Automatically show setup on first launch
        setShowSetupModal(true);
      }
    } catch (err) {
      console.error('Failed to read auth config:', err);
    }
  };

  // Unlock Real Vault
  const handleUnlockReal = async (key: CryptoKey, _pin: string) => {
    setActiveRealKey(key);
    setActiveDecoyKey(null);
    try {
      let loadedCases = await loadAllRealCases(key);
      if (loadedCases.length === 0) {
        // Seed default initial case if first time opening
        const defaultCase = createDemoCase();
        await saveRealCase(key, defaultCase);
        loadedCases = [defaultCase];
      }
      setCases(loadedCases);
      setMode('real_vault');
    } catch (err) {
      console.error('Failed to load encrypted cases:', err);
      setMode('real_vault');
    }
  };

  // Unlock Decoy Vault
  const handleUnlockDecoy = (key: CryptoKey, _pin: string) => {
    setActiveRealKey(null);
    setActiveDecoyKey(key);
    setMode('decoy_vault');
  };

  // Panic / Auto-lock return to calculator
  const handlePanicLock = () => {
    // 1. Zero out in-memory keys
    setActiveRealKey(null);
    setActiveDecoyKey(null);
    // 2. Clear case state from memory
    setCases([]);
    // 3. Switch back to calculator disguise
    setMode('calculator');
  };

  return (
    <div className="min-h-screen bg-[#080b0f] text-slate-100">
      {/* 0. Counselor Portal Route (/counselor) */}
      {currentPath === '/counselor' ? (
        <CircleCounselorPortal onReturnToApp={handleReturnFromCounselor} />
      ) : (
        <>
          {/* 1. Calculator Screen (Default Disguise) */}
          {mode === 'calculator' && (
            <Calculator
              onUnlockReal={handleUnlockReal}
              onUnlockDecoy={handleUnlockDecoy}
              onOpenSetup={() => setShowSetupModal(true)}
              hasAuthConfig={hasAuthConfig}
              onNavigateCounselor={handleNavigateCounselor}
            />
          )}

          {/* 2. Real Encrypted Vault */}
          {mode === 'real_vault' && activeRealKey && (
            <VaultDashboard
              realKey={activeRealKey}
              cases={cases}
              onCasesUpdated={(updated) => setCases(updated)}
              onPanicLock={handlePanicLock}
              onOpenPinSetup={() => setShowSetupModal(true)}
              onNavigateCounselor={handleNavigateCounselor}
            />
          )}

          {/* 3. Decoy Plausible Deniability Vault */}
          {mode === 'decoy_vault' && activeDecoyKey && (
            <DecoyVault
              decoyKey={activeDecoyKey}
              onPanicLock={handlePanicLock}
            />
          )}

          {/* First Launch or Settings PIN Setup Modal */}
          {showSetupModal && (
            <SetupModal
              isInitialSetup={!hasAuthConfig}
              onComplete={(_real, _decoy) => {
                setHasAuthConfig(true);
                setShowSetupModal(false);
              }}
              onCancel={hasAuthConfig ? () => setShowSetupModal(false) : undefined}
            />
          )}
        </>
      )}
    </div>
  );
}
