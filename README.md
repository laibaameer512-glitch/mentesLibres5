# Sakhi Vault (سخی والٹ)

A disguised, encrypted evidence vault and institutional complaint generator designed for women facing online harassment, blackmail, or coercive extortion in Pakistan.

---

## 1. Stealth Disguise & Plausible Deniability
- **Fully Working Calculator**: The application opens as an authentic smartphone calculator (arithmetic evaluation, percentages, decimal points, clear, backspace). The browser title, favicon, and system metadata strictly display **"Calculator"**.
- **Dual-PIN System**:
  - **Real PIN + `=`**: Decrypts the real evidence vault in memory using the real AES-GCM 256-bit key.
  - **Decoy PIN + `=`**: Opens an innocuous decoy notebook with recipes, grocery lists, and university study notes. The real evidence is **never decrypted or accessed**.
  - **Duress Silent Alert**: Unlocking with the decoy PIN triggers `triggerSilentAlert()` on the server (logged silently as a stub for future emergency SMS/beacon integration).
  - **Identical Timing**: Both real and decoy unlocks execute with identical transition duration (~220ms) to prevent side-channel timing analysis.
- **Panic Hide & Auto-Lock**:
  - Tapping the invisible top-left corner or the "Panic Hide" action instantly zeroes keys in memory and returns to the calculator.
  - Rapidly tapping `C` 5 times acts as an emergency reset gesture.
  - Inactivity auto-lock triggers after **30 seconds** of inactivity or immediately when the browser tab is hidden or minimized (`document.visibilitychange`).

---

## 2. Local Encryption & Privacy Architecture
- **Web Crypto AES-GCM 256-bit**: All case records, screenshots, and audio voice notes are encrypted in IndexedDB (`SakhiVault_Storage`).
- **PBKDF2 Key Derivation**: Keys are derived from the user's PIN using 100,000 iterations of SHA-256 with cryptographically random salts. Plain PINs are never stored; only salted verifiers.
- **Client-Side Redaction**: Before any AI analysis call to the server, phone numbers (`+92...`, `03...`), Pakistani CNIC patterns (`\d{5}-\d{7}-\d{1}`), email addresses, and custom person names are replaced with tokens (`[PHONE_1]`, `[PERSON_1]`). The unredaction map remains local in browser memory.
- **Sovereign Wipe**: A 1-tap "Delete Everything" action irreversibly destroys the IndexedDB database and wipes all cryptographic verifiers.

---

## 3. Server-Side Gemini AI Pipeline (`/server/services`)
All AI processing runs strictly on the Node/Express backend (`server.ts`):
- `ocr.ts`: Gemini vision (`gemini-3.8-flash`) extracts text from screenshots with support for English, Roman Urdu, and Urdu script.
- `transcribe.ts`: Gemini audio understanding (`gemini-3.5-transcribe`) transcribes in-browser voice notes and recorded phone audio.
- `extract.ts`: Strict JSON schema extraction returning structured messages, explicit coercive threats, demands, and identifiers.
- `classify.ts`: Multi-label classification with confidence and quotes across 7 categories (workplace harassment, cyber-stalking, blackmail/extortion, criminal threats, non-consensual image sharing, domestic abuse, defamation).
- `timeline.ts`: Merges evidence chronologically, deduplicates, and flags multi-day time gaps.
- `summarize.ts`: 5-line plain-language factual case summary in English or Urdu.
- `legal.ts`: Grounded Legal RAG Pipeline (`retrieveSections`, `explainSections`, `askLegalQuestion`) backed by verified Markdown legal corpus in `/server/data/legal/*.md`.
- `complaint.ts`: Generates formal complaint drafts addressed to specific authorities (FIA Cybercrime Wing, Police Station SHO, Workplace Inquiry Committee, University Ombudsperson, Women Protection Cell) citing only verified statutory provisions with bilingual English/Urdu toggle and high-fidelity PDF export with timeline annex.

---

## 4. Grounded Legal RAG Pipeline (`/server/services/legal.ts`)

The legal module provides educational statutory grounding without inventing law text, section numbers, or external URLs.

### 4.1 Strict Grounding & Anti-Hallucination Guarantees
- **Corpus Exclusivity**: The legal pipeline strictly queries markdown files located in `/server/data/legal/*.md`. No laws, section numbers, or external URLs are ever invented or recalled by LLM memory.
- **Citation Verifier**: Every legal card returned by Gemini is checked against the retrieved chunks. Any card with an ungrounded or hallucinated `chunkId` is dropped.
- **Verbatim Snippets**: Cards always display the original verbatim text snippet directly from the markdown chunk, never a rewritten or paraphrased model quote.
- **Verification Badging**: Chunks verified by legal entities display the verifier name (e.g. `Legal Aid Clinic`); chunks missing verification are explicitly badged **"Not yet verified"**.
- **Mandatory Disclaimer**: Every legal view and API response prominently displays:
  > *"Information and draft only, not legal advice."*
- **No-Answer Rule**: If no chunk passes the retrieval threshold, the pipeline returns:
  > *"No matching section found. Please consult a lawyer."*

### 4.2 Corpus Format (`/server/data/legal/*.md`)
Each Act is stored as a single markdown file with YAML front matter:
```markdown
---
act: Digital Safety & Harassment Act (Sample Draft)
year: 2024
jurisdiction: federal # "federal" or province name (e.g. "punjab", "sindh")
type: law            # "law" or "process"
sourceUrl: https://example.gov.pk/legal/placeholder-sec14b
lastVerified: 2024-01-15
verifiedBy: Legal Aid Clinic
---

## Section 14-B
title: Coercion, Blackmail & Digital Extortion (PLACEHOLDER)
tags: blackmail/extortion, coercion, digital extortion, private photos
text:
[PLACEHOLDER - REPLACE WITH VERIFIED TEXT] Covers threatening to release sensitive private media or personal information to demand money, favor, or compliance. Anyone who coerces or blackmails another individual by threatening publication of private images or communications commits an offense under this section.
```

### 4.3 Ingestion Pipeline (`npm run ingest`)
Run ingestion to parse, validate, and index all markdown files:
```bash
npm run ingest
```
The ingestion script (`server/scripts/ingest.ts`):
1. **Parses & Validates**: Validates required fields (`act`, `year`, `jurisdiction`, `type`, `sourceUrl`, `lastVerified`, `verifiedBy`, non-empty section text). Fails with a clear list of problems if any validation error occurs.
2. **Generates Chunks**: Creates one chunk per section with `id = actSlug-year-section`. Sub-sections (`(1)`, `(2)`) are split into sub-chunks if text is long, repeating act and section in each chunk.
3. **Discovers Gemini Embedding Models**: Queries `ai.models.list()` dynamically instead of assuming a hardcoded model name (prefers `models/gemini-embedding-001` or `models/gemini-embedding-2`).
4. **Builds Local In-Memory Index**: Generates 3072-dimensional vector embeddings and builds an Okapi BM25 keyword index (`idf`, term frequencies, document lengths).
5. **Local Persistence**: Writes index to `server/data/legalIndex.json` (gitignored; zero external databases).

### 4.4 Hybrid Retrieval & Thresholds
- **Query Writer**: Generates 2 to 3 short English search queries from redacted classification categories and key incident facts.
- **Hybrid Scoring**: Combines vector cosine similarity with Okapi BM25 scores via **Reciprocal Rank Fusion (RRF)** ($k=60$).
- **Configurable Threshold**:
  - Environment variable: `LEGAL_RETRIEVAL_THRESHOLD` (defaults to `0.012`).
  - Semantic noise floor: vector matches below `0.58` cosine similarity are ignored so unrelated queries trigger the no-answer rule.
- **Province Filter**: Federal chunks are always eligible. Provincial chunks are only eligible if the user's selected province matches (e.g., selecting "Punjab" unlocks Punjab procedural frameworks while excluding other provinces).

### 4.5 Free-Form Legal Question Answering (`POST /api/legal/ask`)
Users can submit open-ended questions about their situation:
- Endpoint: `POST /api/legal/ask` (also available as `POST /api/ai/legal/ask`).
- Body: `{ "question": "...", "province": "federal", "language": "en" | "ur" }`
- Grounded strictly in retrieved chunks; unretrieved sections are barred from citations.
- If no provisions match, returns: *"No matching section found. Please consult a lawyer."*

### 4.6 Complaint Generator Integration
- The Complaint Generator displays all verified statutory provisions retrieved for the case.
- Users can review, uncheck, or remove any individual provision.
- The complaint generator cites **only verified cards (act and section)** and leaves out any section the user removed.

### 4.7 Offline Demo Mode Cache
- Built-in demo case (`case-demo-104`) results are cached in `server/data/demoLegalCache.json`.
- When offline or when the Gemini API is unreachable, the system displays pre-cached verified cards with the prominent banner:
  > **AI unavailable, using sample result**
  > *Offline mode or Gemini model unavailable; displaying pre-cached statutory mapping for this case.*

### 4.8 Evaluation (`npm run eval`)
Run the automated RAG evaluation suite:
```bash
npm run eval
```
- Reads `/server/data/legal/eval.json` test scenarios.
- Measures:
  1. **Top-6 Hit Rate**: % of scenarios where expected chunk appears in top 6 (target $\ge 80\%$).
  2. **Citation Accuracy**: % of citations strictly present in retrieved set (must be **100.0%**).
- Evaluation File Format (`server/data/legal/eval.json`):
```json
[
  {
    "id": "eval-blackmail-01",
    "description": "Blackmail and digital extortion with ultimatum threatening to distribute photos",
    "province": "federal",
    "expectedChunkIds": ["digital-safety-harassment-act-sample-draft-2024-14-b"]
  }
]
```

---

## 4. Sakhi Circle Anonymous Pattern Matching (`/server/services/circle.ts`)
- **Zero-Content Privacy Principle**: Solves serial harassment discovery without exposing victim identity or case content.
  - *"Only scrambled codes of phone numbers or handles are shared. Your messages, images and name never leave this phone."*
- **Cryptographic HMAC-SHA256**: Identifiers are normalized (+92 Pakistani phone format, lowercase handles without `@`), transmitted over HTTPS to `/api/circle/contribute`, where the backend immediately computes HMAC-SHA256 with `CIRCLE_SECRET` and stores only `{hash, reporterPseudonym, category, month}` in `server/data/circleDb.json`. Raw values are immediately discarded and never logged.
- **Pattern Threshold ($\ge 3$ Distinct Reporters)**: A pattern exists only when the same hash is reported by 3 or more distinct reporting devices (counts distinct reporters, not reports). Below threshold, reporters see *"No match yet"*; at or above threshold, reporters see *"Other independent reports match this identifier (N in total)"*. Details, dates, or other reporters' data are never exposed.
- **Encrypted Reporter Pseudonym**: Random device UUID generated once per handset and stored encrypted in the vault using AES-GCM 256. Wiped when the vault is destroyed.
- **Explicit Confirmation Modal**: Toggling Circle opt-in opens a confirmation dialog previewing normalized identifiers and privacy guarantees before transmitting any cryptographic hashes.
- **Withdrawal**: A single tap deletes all of that reporter's records for that case from the server database, immediately dropping pattern counts if applicable.
- **Environment Variables Setup**:
  Configure the following variables in `.env`:
  ```bash
  CIRCLE_SECRET=your_secret_key_here
  COUNSELOR_USER=counselor_email@example.org
  COUNSELOR_PASS=your_secure_password_here
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
  *Security Notice: If `CIRCLE_SECRET`, `COUNSELOR_USER`, or `COUNSELOR_PASS` is missing, endpoints fail with clear error messages instead of falling back to insecure defaults.*
- **Counselor Demo Portal (`/counselor`)**:
  - Accessible directly at `/counselor` or via Settings in the vault.
  - Requires `COUNSELOR_USER` and `COUNSELOR_PASS` as set in `.env`.
  - Shows only short hash prefixes (e.g. `#a4f910`), distinct reporter count, active months, and category. Zero names, phone numbers, or case text.
  - Includes an immutable system audit log (actor, action, time) with zero content.
- **Stage Demo Tooling & Seeding**:
  - On server start with `CIRCLE_SECRET` set, the server pre-seeds 2 dummy independent reporters sharing fictional demo number `+92 300 4819283` and handle `@suspect_anon_29`.
  - When the presenter loads the demo case and opts into Circle with that number, the live reporter count instantly reaches 3 on stage and triggers the "Independent Serial Pattern Identified" alert.
  - **Re-seeding**: Use the "Re-seed Demo Pattern" button in Circle Module or Counselor Portal, or call `POST /api/circle/seed-demo`.

---

## 5. Demo Data Tooling
- **Long-Press `=` on Calculator (1.5 seconds)** opens the hidden Hackathon Demo menu.
- **Seed Demo Data**: Loads 15 fictional dummy chat screenshots (generated cleanly via Canvas), 2 sample audio transcripts, and a full WhatsApp chat export.
- **Counselor Portal Access**: Direct access to `/counselor` or via Settings > Counselor Portal Demo.
- **Fail-Safe Fallback**: If an AI call fails or offline mode is toggled, cached demo records are returned so the application never breaks.

---

## 6. Development & Deployment
```bash
# Install dependencies
npm install

# Run legal corpus ingestion (builds local vectors + BM25 index)
npm run ingest

# Run legal RAG evaluation
npm run eval

# Run full-stack dev server (Express + Vite on Port 3000)
npm run dev

# Type check
npm run lint

# Build for production
npm run build
```

---

## 7. Assumptions & Implementation Notes

- **Corpus Exclusivity**: In accordance with the prompt's strict requirement (*"NEVER write, recall or invent law text, section numbers or URLs. The corpus comes only from markdown files in /server/data/legal/*.md"*), the legal corpus is populated with clearly marked placeholder acts and processes based on the project's initial sample draft regulatory framework. Real statutory provisions can be dropped into `/server/data/legal/*.md` and indexed via `npm run ingest` at any time without code changes.
- **Dynamic Embedding Discovery**: Gemini embedding model selection does not assume a fixed model name; `ai.models.list()` queries available embedding models and picks `models/gemini-embedding-001` or `models/gemini-embedding-2` based on supported actions.
- **Redaction Integrity**: All text passed into Gemini query generation, grounded explanations, and complaint drafting remains strictly redacted via client and server tokens (`[PHONE_1]`, `[PERSON_1]`).
- **No External Vector Database**: All embeddings and BM25 statistics are stored in memory and indexed locally to `server/data/legalIndex.json` (gitignored). Cosine similarity and Okapi BM25 are calculated locally in memory with zero external database dependencies.
- **Untouched Boundaries**: The PIN/encryption/decoy vault, calculator, Circle module, redaction code, and counselor authentication systems were left completely intact and untouched.

