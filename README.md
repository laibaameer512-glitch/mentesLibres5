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
- `legal.ts`: Clean interface (`retrieveSections`, `explainSections`) backed by `/server/data/legalCorpus.placeholder.json`.
- `complaint.ts`: Generates formal complaint drafts addressed to specific authorities (FIA Cybercrime Wing, Police Station SHO, Workplace Inquiry Committee, University Ombudsperson, Women Protection Cell) with bilingual English/Urdu toggle and high-fidelity PDF export with timeline annex.

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

# Run full-stack dev server (Express + Vite on Port 3000)
npm run dev

# Build for production
npm run build
```

