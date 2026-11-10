import assert from 'node:assert';
import {
  computeReportPairSimilarity,
  REPORT_SIMILARITY_WEIGHTS,
  seedDemoReporters,
  getCounselorDuplicates,
  ReportItem,
} from '../services/circle.ts';
import {
  compute3GramJaccard,
  computeHammingSimilarity,
  computeTimestampOverlap,
  normalizeTextForDuplicate,
  EVIDENCE_SIMILARITY_WEIGHTS,
} from '../../src/lib/duplicates.ts';

console.log('=== TEST SUITE: Duplicate Detector Similarity Engine ===\n');

// --- 1. Client-Side Text 3-Gram Jaccard ---
console.log('1. Testing Client-Side Character 3-Gram Jaccard:');
const textExact1 = 'Pay 50,000 rupees by tomorrow or photos go online';
const textExact2 = 'Pay 50,000 rupees by tomorrow or photos go online';
const simExact = compute3GramJaccard(textExact1, textExact2);
console.log(` - Identical strings: ${(simExact * 100).toFixed(1)}%`);
assert.strictEqual(simExact, 1.0, 'Identical text must yield 100% similarity');

const textVar1 = 'Pay 50,000 rupees by tomorrow or photos go online';
const textVar2 = 'Pay 50000 rupees tomorrow or your photos go online!';
const simVar = compute3GramJaccard(textVar1, textVar2);
console.log(` - Minor variation: ${(simVar * 100).toFixed(1)}%`);
assert(simVar > 0.65, 'Minor variations must yield > 65% similarity');

const textUnrelated = 'Tomorrow weather report indicates heavy rain in Islamabad';
const simUnrelated = compute3GramJaccard(textExact1, textUnrelated);
console.log(` - Unrelated text: ${(simUnrelated * 100).toFixed(1)}%`);
assert(simUnrelated < 0.2, 'Unrelated text must yield low similarity');
console.log(' ✓ Client-side text Jaccard passed\n');

// --- 2. Client-Side Image dHash Hamming Similarity ---
console.log('2. Testing Image dHash Hamming Distance:');
const hashA = '1'.repeat(64);
const hashB = '1'.repeat(64);
const hashSimilar = '1'.repeat(60) + '0000'; // 4 bits diff out of 64
const hashOpposite = '0'.repeat(64);

const simIdenticalImg = computeHammingSimilarity(hashA, hashB);
console.log(` - Identical dHash: ${(simIdenticalImg * 100).toFixed(1)}%`);
assert.strictEqual(simIdenticalImg, 1.0, 'Identical dHash must yield 1.0');

const simNearImg = computeHammingSimilarity(hashA, hashSimilar);
console.log(` - 4-bit difference dHash (60/64): ${(simNearImg * 100).toFixed(2)}%`);
assert.strictEqual(simNearImg, 60 / 64, '4-bit diff must yield 60/64');

const simOppositeImg = computeHammingSimilarity(hashA, hashOpposite);
console.log(` - Inverted dHash (0/64): ${(simOppositeImg * 100).toFixed(1)}%`);
assert.strictEqual(simOppositeImg, 0, 'Inverted dHash must yield 0');
console.log(' ✓ Image Hamming similarity passed\n');

// --- 3. Client-Side Timestamp Overlap ---
console.log('3. Testing Timestamp Overlap:');
const timeSame = computeTimestampOverlap('2026-10-14T10:00:00Z', '2026-10-14T10:00:00Z');
console.log(` - Exact timestamp: ${(timeSame.ratio * 100).toFixed(0)}% (${timeSame.reason})`);
assert.strictEqual(timeSame.ratio, 1.0);

const timeHour = computeTimestampOverlap('2026-10-14T10:00:00Z', '2026-10-14T10:45:00Z');
console.log(` - Within 1 hour: ${(timeHour.ratio * 100).toFixed(0)}% (${timeHour.reason})`);
assert.strictEqual(timeHour.ratio, 0.9);

const timeDay = computeTimestampOverlap('2026-10-14T10:00:00Z', '2026-10-14T20:00:00Z');
console.log(` - Same day: ${(timeDay.ratio * 100).toFixed(0)}% (${timeDay.reason})`);
assert.strictEqual(timeDay.ratio, 0.7);

const timeFar = computeTimestampOverlap('2026-01-01T10:00:00Z', '2026-10-14T10:00:00Z');
console.log(` - Months apart: ${(timeFar.ratio * 100).toFixed(0)}%`);
assert.strictEqual(timeFar.ratio, 0);
console.log(' ✓ Timestamp overlap passed\n');

// --- 4. Counselor Similarity Engine with Stored Weights ---
console.log('4. Testing Counselor Similarity Engine (Stored Weights):');
console.log(' Stored weights config:', REPORT_SIMILARITY_WEIGHTS);

const report1: ReportItem = {
  reportId: 'rep-001',
  shortId: 'a1b2c3',
  reporterPseudonym: 'pseudo-alpha',
  caseId: 'case-alpha',
  phoneHashes: new Set(['hash_phone_target']),
  handleHashes: new Set(['hash_handle_target']),
  locationHashes: new Set(['hash_loc_lahore']),
  otherHashes: new Set(),
  category: 'blackmail/extortion',
  month: '2026-10',
};

// High match: shared phone (40), shared handle (30), diff location (0), same cat (10), same month (5) = 85 / 100 => 85%
const report2: ReportItem = {
  reportId: 'rep-002',
  shortId: 'd4e5f6',
  reporterPseudonym: 'pseudo-beta',
  caseId: 'case-beta',
  phoneHashes: new Set(['hash_phone_target']),
  handleHashes: new Set(['hash_handle_target']),
  locationHashes: new Set(['hash_loc_pindi']),
  otherHashes: new Set(),
  category: 'blackmail/extortion',
  month: '2026-10',
};

const sim1_2 = computeReportPairSimilarity(report1, report2);
assert(sim1_2 !== null, 'High match must not be null');
console.log(` - Pair 1-2 Score: ${sim1_2.score}% [${sim1_2.label}]`);
console.log('   Reasons:', sim1_2.reasons);
assert.strictEqual(sim1_2.score, 85, 'Pair 1-2 score should be 85%');
assert.strictEqual(sim1_2.label, 'Very likely the same');

// Medium match: shared phone (40), diff handle (0), location only in report 1 (0), same cat (10), adjacent month (2) = 52 / 100 => 52%
const report3: ReportItem = {
  reportId: 'rep-003',
  shortId: 'g7h8i9',
  reporterPseudonym: 'pseudo-gamma',
  caseId: 'case-gamma',
  phoneHashes: new Set(['hash_phone_target']),
  handleHashes: new Set(['hash_handle_other']),
  locationHashes: new Set(),
  otherHashes: new Set(),
  category: 'blackmail/extortion',
  month: '2026-11', // adjacent month
};

const sim1_3 = computeReportPairSimilarity(report1, report3);
assert(sim1_3 !== null, 'Medium match must not be null');
console.log(` - Pair 1-3 Score: ${sim1_3.score}% [${sim1_3.label}]`);
console.log('   Reasons:', sim1_3.reasons);
assert.strictEqual(sim1_3.score, 52, 'Pair 1-3 score should be 52%');
assert.strictEqual(sim1_3.label, 'Possibly related');

// Low match (< 50): different everything
const report4: ReportItem = {
  reportId: 'rep-004',
  shortId: 'j1k2l3',
  reporterPseudonym: 'pseudo-delta',
  caseId: 'case-delta',
  phoneHashes: new Set(['hash_phone_unrelated']),
  handleHashes: new Set(['hash_handle_unrelated']),
  locationHashes: new Set(),
  otherHashes: new Set(),
  category: 'workplace/educational harassment',
  month: '2026-04',
};

const sim1_4 = computeReportPairSimilarity(report1, report4);
console.log(` - Pair 1-4 (<50):`, sim1_4 ? `${sim1_4.score}%` : 'null (Hidden as required)');
assert.strictEqual(sim1_4, null, 'Score < 50 must return null (hidden)');
console.log(' ✓ Counselor similarity engine passed\n');

// --- 5. Privacy & Zero-PII Leak Audit ---
console.log('5. Testing Privacy & Zero-PII Leakage in Counselor Output:');
seedDemoReporters(true);
const counselorDups = getCounselorDuplicates();
console.log(` Retrieved ${counselorDups.length} duplicate pairs from demo seed:`);

for (const dup of counselorDups) {
  console.log(`   Pair ${dup.pairId}: ${dup.score}% (${dup.label}) [Report #${dup.reportA.shortId} vs #${dup.reportB.shortId}]`);

  // Ensure JSON representation contains NO raw identifiers or message text
  const jsonStr = JSON.stringify(dup);
  assert(!jsonStr.includes('+92'), 'Must not contain raw phone number prefix');
  assert(!jsonStr.includes('@suspect'), 'Must not contain raw social handles');
  assert(!jsonStr.includes('dummy1') && !jsonStr.includes('dummy2'), 'Must not contain raw pseudonyms');
  assert(!dup.reportA.shortId.includes('-'), 'Short ID should be 6-char hex');
  assert(dup.reasons.every((r) => !r.includes('+92') && !r.includes('@')), 'Reasons must only reference feature types');
}
console.log(' ✓ Privacy & Zero-PII leak check passed\n');

console.log('=== ALL TESTS PASSED SUCCESSFULLY ===');
