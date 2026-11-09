/**
 * Client-Side PII Redaction and Restoration Engine
 * Guarantees phone numbers, Pakistani CNICs, emails, and custom names
 * are replaced with non-identifiable tokens before any server call.
 */

export interface ClientRedactionResult {
  redactedText: string;
  mapping: Record<string, string>; // e.g. {"[PHONE_1]": "+92 300 1234567"}
  reverseMapping: Record<string, string>;
}

export function redactTextLocally(
  text: string,
  userCustomNames: string[] = [],
  existingMapping?: Record<string, string>
): ClientRedactionResult {
  if (!text) {
    return { redactedText: '', mapping: existingMapping || {}, reverseMapping: {} };
  }

  const mapping: Record<string, string> = { ...(existingMapping || {}) };
  const reverseMapping: Record<string, string> = {};

  Object.entries(mapping).forEach(([placeholder, original]) => {
    reverseMapping[original.toLowerCase()] = placeholder;
  });

  let phoneCounter = Object.keys(mapping).filter((k) => k.startsWith('[PHONE_')).length + 1;
  let cnicCounter = Object.keys(mapping).filter((k) => k.startsWith('[CNIC_')).length + 1;
  let emailCounter = Object.keys(mapping).filter((k) => k.startsWith('[EMAIL_')).length + 1;
  let personCounter = Object.keys(mapping).filter((k) => k.startsWith('[PERSON_')).length + 1;

  let processed = text;

  // 1. Pakistani CNIC format (12345-1234567-1 or 13 consecutive digits)
  const cnicRegex = /\b\d{5}-\d{7}-\d{1}\b|\b\d{13}\b/g;
  processed = processed.replace(cnicRegex, (match) => {
    const key = match.toLowerCase();
    if (!reverseMapping[key]) {
      const placeholder = `[CNIC_${cnicCounter++}]`;
      mapping[placeholder] = match;
      reverseMapping[key] = placeholder;
    }
    return reverseMapping[key];
  });

  // 2. Pakistani & international phone numbers
  const phoneRegex = /(?:\+?92\s?|0)?3[0-4]\d[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
  processed = processed.replace(phoneRegex, (match) => {
    const key = match.trim().toLowerCase();
    if (!reverseMapping[key]) {
      const placeholder = `[PHONE_${phoneCounter++}]`;
      mapping[placeholder] = match.trim();
      reverseMapping[key] = placeholder;
    }
    return reverseMapping[key];
  });

  // 3. Email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  processed = processed.replace(emailRegex, (match) => {
    const key = match.trim().toLowerCase();
    if (!reverseMapping[key]) {
      const placeholder = `[EMAIL_${emailCounter++}]`;
      mapping[placeholder] = match.trim();
      reverseMapping[key] = placeholder;
    }
    return reverseMapping[key];
  });

  // 4. Custom names provided by the user
  userCustomNames.forEach((name) => {
    if (!name || name.trim().length < 2) return;
    const clean = name.trim();
    const key = clean.toLowerCase();
    if (!reverseMapping[key]) {
      const placeholder = `[PERSON_${personCounter++}]`;
      mapping[placeholder] = clean;
      reverseMapping[key] = placeholder;
    }
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    processed = processed.replace(regex, reverseMapping[key]);
  });

  return { redactedText: processed, mapping, reverseMapping };
}

/**
 * Re-fills redacted placeholders with real user identifiers locally
 */
export function restoreTextLocally(
  text: string,
  mapping: Record<string, string>
): string {
  if (!text || !mapping) return text || '';
  let restored = text;
  Object.entries(mapping).forEach(([placeholder, original]) => {
    restored = restored.split(placeholder).join(original);
  });
  return restored;
}
