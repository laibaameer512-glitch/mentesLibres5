/**
 * Client-Side In-Case Duplicate Evidence Detector
 * Compares evidence items in memory inside an unlocked vault case.
 * Zero network transmission; operates strictly client-side.
 */
import { EvidenceItem, VaultCase } from './db.ts';
import { InCaseDuplicateMatch } from '../types/shared.ts';

// Configurable similarity weights (Never hardcode scores or weights)
export const EVIDENCE_SIMILARITY_WEIGHTS = {
  textJaccard: 60,
  imageDHash: 30,
  timestampOverlap: 10,
} as const;

/**
 * Normalizes text for n-gram comparison: lowercase, strip punctuation and extra spaces
 */
export function normalizeTextForDuplicate(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes character 3-grams from normalized text
 */
export function getCharacter3Grams(normalized: string): Set<string> {
  const ngrams = new Set<string>();
  if (!normalized) return ngrams;
  if (normalized.length < 3) {
    ngrams.add(normalized);
    return ngrams;
  }
  for (let i = 0; i <= normalized.length - 3; i++) {
    ngrams.add(normalized.slice(i, i + 3));
  }
  return ngrams;
}

/**
 * Computes Jaccard similarity (|A ∩ B| / |A ∪ B|) on character 3-grams
 */
export function compute3GramJaccard(textA: string, textB: string): number {
  const normA = normalizeTextForDuplicate(textA);
  const normB = normalizeTextForDuplicate(textB);
  if (!normA && !normB) return 0;
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const gramsA = getCharacter3Grams(normA);
  const gramsB = getCharacter3Grams(normB);
  if (gramsA.size === 0 && gramsB.size === 0) return 0;

  let intersection = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++;
  }
  const union = gramsA.size + gramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Computes a 64-bit difference hash (dHash) from image base64 data using an HTML5 Canvas
 */
export function computeImageDHash(imgSrc: string): Promise<string | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    if (!imgSrc || typeof imgSrc !== 'string' || !imgSrc.startsWith('data:image')) {
      return resolve(null);
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 9, 8);
        const imgData = ctx.getImageData(0, 0, 9, 8).data;

        const grays: number[][] = [];
        for (let y = 0; y < 8; y++) {
          const row: number[] = [];
          for (let x = 0; x < 9; x++) {
            const idx = (y * 9 + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            row.push(0.299 * r + 0.587 * g + 0.114 * b);
          }
          grays.push(row);
        }

        let hash = '';
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            hash += grays[y][x] > grays[y][x + 1] ? '1' : '0';
          }
        }
        resolve(hash);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imgSrc;
  });
}

/**
 * Computes Hamming similarity (1 - distance / 64) for two 64-bit hashes
 */
export function computeHammingSimilarity(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== 64 || hashB.length !== 64) return 0;
  let diffs = 0;
  for (let i = 0; i < 64; i++) {
    if (hashA[i] !== hashB[i]) diffs++;
  }
  return Math.max(0, 1 - diffs / 64);
}

/**
 * Checks timestamp overlap between two incident date strings
 */
export function computeTimestampOverlap(dateA?: string, dateB?: string): { ratio: number; reason?: string } {
  if (!dateA || !dateB) return { ratio: 0 };
  const trimmedA = dateA.trim();
  const trimmedB = dateB.trim();
  if (!trimmedA || !trimmedB) return { ratio: 0 };

  if (trimmedA === trimmedB) {
    return { ratio: 1.0, reason: 'Same timestamps appear in both' };
  }

  const timeA = new Date(trimmedA).getTime();
  const timeB = new Date(trimmedB).getTime();
  if (!isNaN(timeA) && !isNaN(timeB)) {
    const diffHours = Math.abs(timeA - timeB) / (1000 * 60 * 60);
    if (diffHours < 1) {
      return { ratio: 0.9, reason: 'Recorded within the same hour' };
    }
    if (diffHours <= 24) {
      return { ratio: 0.7, reason: 'Recorded on the same day' };
    }
  }

  if (trimmedA.slice(0, 10) === trimmedB.slice(0, 10) && trimmedA.length >= 10) {
    return { ratio: 0.7, reason: 'Recorded on the same day' };
  }

  return { ratio: 0 };
}

/**
 * Compares two evidence items and computes a composite similarity score
 */
export async function compareEvidencePair(
  itemA: EvidenceItem,
  itemB: EvidenceItem,
  imageHashMap?: Map<string, string>
): Promise<InCaseDuplicateMatch | null> {
  const weights = EVIDENCE_SIMILARITY_WEIGHTS;
  let possibleWeight = 0;
  let matchedWeight = 0;
  const reasons: string[] = [];

  // 1. Text extraction & 3-gram Jaccard
  const textA = itemA.ocrOrTranscriptText || (itemA.type === 'text' ? itemA.content : '');
  const textB = itemB.ocrOrTranscriptText || (itemB.type === 'text' ? itemB.content : '');
  const hasText = Boolean(textA.trim() || textB.trim());

  if (hasText) {
    possibleWeight += weights.textJaccard;
    const jaccard = compute3GramJaccard(textA, textB);
    matchedWeight += jaccard * weights.textJaccard;
    const pct = Math.round(jaccard * 100);
    if (pct > 0) {
      reasons.push(`${pct}% of the message text is identical`);
    }
  }

  // 2. Image difference hash (dHash) & Hamming similarity
  const isImageA = itemA.type === 'screenshot' || (itemA.mimeType && itemA.mimeType.startsWith('image/'));
  const isImageB = itemB.type === 'screenshot' || (itemB.mimeType && itemB.mimeType.startsWith('image/'));

  if (isImageA && isImageB && itemA.content && itemB.content) {
    possibleWeight += weights.imageDHash;
    let hashA = imageHashMap?.get(itemA.id);
    let hashB = imageHashMap?.get(itemB.id);

    if (!hashA && typeof document !== 'undefined') {
      const computedA = await computeImageDHash(itemA.content);
      if (computedA) {
        hashA = computedA;
        if (imageHashMap) imageHashMap.set(itemA.id, hashA);
      }
    }
    if (!hashB && typeof document !== 'undefined') {
      const computedB = await computeImageDHash(itemB.content);
      if (computedB) {
        hashB = computedB;
        if (imageHashMap) imageHashMap.set(itemB.id, hashB);
      }
    }

    if (hashA && hashB) {
      const imgSim = computeHammingSimilarity(hashA, hashB);
      matchedWeight += imgSim * weights.imageDHash;
      const pct = Math.round(imgSim * 100);
      if (pct >= 50) {
        reasons.push(`Screenshots look ${pct}% alike`);
      }
    }
  }

  // 3. Timestamp overlap bonus
  if (itemA.incidentDateTime || itemB.incidentDateTime) {
    possibleWeight += weights.timestampOverlap;
    const timeRes = computeTimestampOverlap(itemA.incidentDateTime, itemB.incidentDateTime);
    matchedWeight += timeRes.ratio * weights.timestampOverlap;
    if (timeRes.reason) {
      reasons.push(timeRes.reason);
    }
  }

  const score = possibleWeight > 0 ? Math.round((100 * matchedWeight) / possibleWeight) : 0;

  // Show only pairs at 60 percent or above
  if (score < 60) return null;

  const [id1, id2] = [itemA.id, itemB.id].sort();
  const pairId = `ev_pair_${id1}_${id2}`;

  return {
    pairId,
    itemAId: itemA.id,
    itemBId: itemB.id,
    itemALabel: itemA.personLabel || `Item #${itemA.id.slice(-4)}`,
    itemBLabel: itemB.personLabel || `Item #${itemB.id.slice(-4)}`,
    score,
    reasons: reasons.length > 0 ? reasons : ['High overall similarity detected'],
  };
}

/**
 * Finds all duplicate pairs among items in a vault case
 */
export async function findInCaseDuplicates(
  items: EvidenceItem[],
  decisions: Record<string, { decision: 'merge' | 'keep'; timestamp: string }> = {}
): Promise<InCaseDuplicateMatch[]> {
  const matches: InCaseDuplicateMatch[] = [];
  const imageHashMap = new Map<string, string>();

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const match = await compareEvidencePair(items[i], items[j], imageHashMap);
      if (match) {
        match.decision = decisions[match.pairId]?.decision || null;
        matches.push(match);
      }
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/**
 * Merges two evidence items inside a case
 */
export function mergeEvidenceItemsInCase(
  c: VaultCase,
  pairId: string,
  itemAId: string,
  itemBId: string
): VaultCase {
  const updatedDecisions = {
    ...(c.duplicateDecisions || {}),
    [pairId]: { decision: 'merge' as const, timestamp: new Date().toISOString() },
  };

  // Find or create merged cluster
  const clusters = (c.mergedEvidenceClusters || []).map((cluster) => [...cluster]);
  let foundCluster = false;
  for (const cluster of clusters) {
    if (cluster.includes(itemAId) || cluster.includes(itemBId)) {
      if (!cluster.includes(itemAId)) cluster.push(itemAId);
      if (!cluster.includes(itemBId)) cluster.push(itemBId);
      foundCluster = true;
      break;
    }
  }
  if (!foundCluster) {
    clusters.push([itemAId, itemBId]);
  }

  // Tag timeline events/messages with linked source evidence
  let updatedMessages = c.extractedReview?.messages;
  if (updatedMessages) {
    updatedMessages = updatedMessages.map((m) => {
      if (m.sourceEvidenceId === itemBId || m.sourceEvidenceId === itemAId) {
        const linked = Array.from(new Set([...(m.linkedEvidenceIds || []), itemAId, itemBId]));
        return { ...m, linkedEvidenceIds: linked };
      }
      return m;
    });
  }

  return {
    ...c,
    duplicateDecisions: updatedDecisions,
    mergedEvidenceClusters: clusters,
    extractedReview: c.extractedReview
      ? {
          ...c.extractedReview,
          messages: updatedMessages || c.extractedReview.messages,
        }
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Marks an evidence pair as distinct (keep)
 */
export function keepEvidenceItemsApartInCase(c: VaultCase, pairId: string): VaultCase {
  const updatedDecisions = {
    ...(c.duplicateDecisions || {}),
    [pairId]: { decision: 'keep' as const, timestamp: new Date().toISOString() },
  };

  return {
    ...c,
    duplicateDecisions: updatedDecisions,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reverses a merge or keep decision
 */
export function undoEvidenceDecisionInCase(c: VaultCase, pairId: string): VaultCase {
  const updatedDecisions = { ...(c.duplicateDecisions || {}) };
  delete updatedDecisions[pairId];

  // Rebuild clusters from remaining merge decisions
  const clusters: Array<string[]> = [];
  const parent = new Map<string, string>();
  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  function union(x: string, y: string) {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }

  const items = c.evidenceItems;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [id1, id2] = [items[i].id, items[j].id].sort();
      const pid = `ev_pair_${id1}_${id2}`;
      if (updatedDecisions[pid]?.decision === 'merge') {
        union(items[i].id, items[j].id);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const item of items) {
    if (parent.has(item.id)) {
      const root = find(item.id);
      const list = groups.get(root) || [];
      list.push(item.id);
      groups.set(root, list);
    }
  }
  for (const list of groups.values()) {
    if (list.length >= 2) clusters.push(list);
  }

  // Reset message linkedEvidenceIds according to new clusters
  let updatedMessages = c.extractedReview?.messages;
  if (updatedMessages) {
    updatedMessages = updatedMessages.map((m) => {
      const cluster = clusters.find((cl) => cl.includes(m.sourceEvidenceId || ''));
      return {
        ...m,
        linkedEvidenceIds: cluster ? [...cluster] : undefined,
      };
    });
  }

  return {
    ...c,
    duplicateDecisions: updatedDecisions,
    mergedEvidenceClusters: clusters,
    extractedReview: c.extractedReview
      ? {
          ...c.extractedReview,
          messages: updatedMessages || c.extractedReview.messages,
        }
      : undefined,
    updatedAt: new Date().toISOString(),
  };
}

