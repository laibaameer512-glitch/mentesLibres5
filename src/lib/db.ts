/**
 * IndexedDB persistence layer for Sakhi Vault
 * Encrypts all real and decoy records using AES-GCM before writing to storage.
 */
import {
  PinVerifierData,
  EncryptedPayload,
  encryptData,
  decryptData,
} from './crypto.ts';

const DB_NAME = 'SakhiVault_Storage';
const DB_VERSION = 1;

export interface VaultCase {
  id: string;
  title: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
  evidenceItems: EvidenceItem[];
  extractedReview?: {
    messages: Array<{
      id: string;
      speaker: string;
      timestamp: string;
      text: string;
      language: string;
      isThreat?: boolean;
      sourceEvidenceId?: string;
      linkedEvidenceIds?: string[];
    }>;
    threats: string[];
    demands: string[];
    platform: string;
    identifiers: string[];
    summary5Lines: string[];
    classificationLabels: Array<{
      category: string;
      confidence: number;
      reason: string;
      linkedQuotes: string[];
    }>;
    customRedactionMapping?: Record<string, string>;
    isFallback?: boolean;
  };
  complaintDraft?: {
    authority: string;
    language: 'en' | 'ur';
    title: string;
    text: string;
    relief: string[];
  };
  circleContribution?: {
    optedIn: boolean;
    contributedAt?: string;
    contributedHashes?: string[];
    selectedIdentifiers?: string[];
  };
  duplicateDecisions?: Record<string, {
    decision: 'merge' | 'keep';
    timestamp: string;
  }>;
  mergedEvidenceClusters?: Array<string[]>;
}

export interface EvidenceItem {
  id: string;
  type: 'screenshot' | 'audio' | 'text';
  platform: 'WhatsApp' | 'Instagram' | 'SMS' | 'Call' | 'Other';
  incidentDateTime: string;
  personLabel: string;
  notes: string;
  // content payload: base64 for image/audio or string for text
  content: string;
  mimeType?: string;
  ocrOrTranscriptText?: string;
  confidence?: number;
}

export interface DecoyNote {
  id: string;
  title: string;
  category: 'Recipe' | 'Grocery' | 'Study Notes' | 'Formulas';
  content: string;
  updatedAt: string;
}

let dbInstance: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('auth_config')) {
        db.createObjectStore('auth_config', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('real_cases')) {
        db.createObjectStore('real_cases', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('decoy_items')) {
        db.createObjectStore('decoy_items', { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Auth Verifier Management
export async function getStoredAuthConfig(): Promise<{
  real?: PinVerifierData;
  decoy?: PinVerifierData;
} | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('auth_config', 'readonly');
    const store = tx.objectStore('auth_config');
    const req = store.get('pin_verifiers');
    req.onsuccess = () => {
      resolve(req.result ? req.result.data : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function storeAuthConfig(
  real: PinVerifierData,
  decoy: PinVerifierData
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('auth_config', 'readwrite');
    const store = tx.objectStore('auth_config');
    const req = store.put({
      id: 'pin_verifiers',
      data: { real, decoy },
      savedAt: new Date().toISOString(),
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Real Vault Encrypted Cases
export async function saveRealCase(key: CryptoKey, caseData: VaultCase): Promise<void> {
  const db = await openDB();
  const encryptedPayload = await encryptData(key, caseData);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('real_cases', 'readwrite');
    const store = tx.objectStore('real_cases');
    const record = {
      id: caseData.id,
      encryptedPayload,
      updatedAt: caseData.updatedAt || new Date().toISOString(),
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllRealCases(key: CryptoKey): Promise<VaultCase[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('real_cases', 'readonly');
    const store = tx.objectStore('real_cases');
    const req = store.getAll();

    req.onsuccess = async () => {
      const records = req.result || [];
      try {
        const decryptedCases: VaultCase[] = [];
        for (const r of records) {
          const decrypted = await decryptData<VaultCase>(key, r.encryptedPayload);
          decryptedCases.push(decrypted);
        }
        decryptedCases.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        resolve(decryptedCases);
      } catch (err) {
        reject(new Error('Failed to decrypt case records with active key: ' + (err as Error).message));
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRealCase(caseId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('real_cases', 'readwrite');
    const store = tx.objectStore('real_cases');
    const req = store.delete(caseId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Decoy Vault Encrypted Items
export async function saveDecoyNote(decoyKey: CryptoKey, note: DecoyNote): Promise<void> {
  const db = await openDB();
  const encryptedPayload = await encryptData(decoyKey, note);

  return new Promise((resolve, reject) => {
    const tx = db.transaction('decoy_items', 'readwrite');
    const store = tx.objectStore('decoy_items');
    const record = {
      id: note.id,
      encryptedPayload,
      updatedAt: note.updatedAt || new Date().toISOString(),
    };
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllDecoyNotes(decoyKey: CryptoKey): Promise<DecoyNote[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('decoy_items', 'readonly');
    const store = tx.objectStore('decoy_items');
    const req = store.getAll();

    req.onsuccess = async () => {
      const records = req.result || [];
      try {
        const list: DecoyNote[] = [];
        for (const r of records) {
          const dec = await decryptData<DecoyNote>(decoyKey, r.encryptedPayload);
          list.push(dec);
        }
        if (list.length === 0) {
          // Provide default boring initial notes if first time
          const defaults = getDefaultDecoyNotes();
          for (const d of defaults) {
            await saveDecoyNote(decoyKey, d);
          }
          resolve(defaults);
          return;
        }
        resolve(list);
      } catch (err) {
        reject(err);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export function getDefaultDecoyNotes(): DecoyNote[] {
  return [
    {
      id: 'decoy-1',
      title: 'Monthly Grocery List (Supermarket)',
      category: 'Grocery',
      content: '1. Basmati Rice (5kg)\n2. Canola Oil (2 cans)\n3. Daal Chana & Masoor (1kg each)\n4. Red Tea / Chai leaves (tapal)\n5. Dishwashing liquid & sponges\n6. Onions, potatoes, ginger garlic paste',
      updatedAt: '2026-11-04T12:00:00Z',
    },
    {
      id: 'decoy-2',
      title: 'Family Chicken Biryani Recipe',
      category: 'Recipe',
      content: 'Ingredients: 1kg chicken, 750g sella rice, fried onions, yogurt, whole garam masala, kewra water, saffron.\nMethod:\n1. Marinate chicken in yogurt, ginger-garlic and spices for 1 hour.\n2. Parboil rice with cloves and cardamoms until 70% done.\n3. Layer chicken masala and rice with mint leaves and food color. Dum cook for 20 mins on low flame.',
      updatedAt: '2026-10-28T16:20:00Z',
    },
    {
      id: 'decoy-3',
      title: 'Linear Algebra & Matrix Formulas',
      category: 'Formulas',
      content: 'Det(AB) = Det(A) * Det(B)\nEigenvalues: det(A - lambda*I) = 0\nTrace(A) = sum of diagonal entries\nOrthogonal matrix: Q^T * Q = I\nCauchy-Schwarz inequality: |<u,v>|^2 <= <u,u> * <v,v>',
      updatedAt: '2026-10-15T09:10:00Z',
    },
    {
      id: 'decoy-4',
      title: 'Semester Study Timetable',
      category: 'Study Notes',
      content: 'Mon/Wed: Database Systems (Chapter 4-6)\nTue/Thu: Numerical Analysis & Assignment 3\nSaturday: Review past papers and library book returns.',
      updatedAt: '2026-11-01T14:45:00Z',
    },
  ];
}

/**
 * Retrieves or initializes an encrypted reporter pseudonym for this device.
 * Stored encrypted inside the vault's IndexedDB storage using AES-GCM 256.
 * One pseudonym per device, erased if the vault is wiped.
 */
export async function getOrCreateEncryptedPseudonym(key: CryptoKey): Promise<string> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('auth_config', 'readwrite');
    const store = tx.objectStore('auth_config');
    const req = store.get('circle_device_pseudonym');

    req.onsuccess = async () => {
      try {
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (req.result && req.result.encryptedPayload) {
          const decrypted = await decryptData<{ pseudonym: string }>(key, req.result.encryptedPayload);
          if (decrypted && decrypted.pseudonym) {
            const clean = decrypted.pseudonym.replace(/^pseudo-/, '');
            if (UUID_REGEX.test(clean)) {
              resolve(clean);
              return;
            }
          }
        }

        // Generate a cryptographically random RFC 4122 UUID v4 for this device
        const newPseudonym = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              const v = c === 'x' ? r : (r & 0x3) | 0x8;
              return v.toString(16);
            });

        const encryptedPayload = await encryptData(key, { pseudonym: newPseudonym });
        const putReq = store.put({
          id: 'circle_device_pseudonym',
          encryptedPayload,
          savedAt: new Date().toISOString(),
        });

        putReq.onsuccess = () => resolve(newPseudonym);
        putReq.onerror = () => reject(putReq.error);
      } catch (err) {
        reject(err);
      }
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Panic/Wipe function: completely deletes the IndexedDB database
 */
export async function wipeAllData(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // proceed anyway
  });
}
