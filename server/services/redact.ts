/**
 * Redaction utility for Sakhi Vault
 * Sanitizes sensitive identifiers (Phones, CNIC numbers, Emails, and specified Personal names)
 * before any AI processing so private identities never touch external model APIs.
 */

export interface RedactionResult {
  redactedText: string;
  mapping: Record<string, string>; // placeholder -> original
  reverseMapping: Record<string, string>; // original -> placeholder
}

export function redactSensitiveData(
  text: string,
  userCustomNames: string[] = [],
  existingMapping?: Record<string, string>
): RedactionResult {
  if (!text) {
    return { redactedText: '', mapping: existingMapping || {}, reverseMapping: {} };
  }

  const mapping: Record<string, string> = { ...(existingMapping || {}) };
  const reverseMapping: Record<string, string> = {};

  // Populate reverse mapping from existing mapping
  Object.entries(mapping).forEach(([placeholder, original]) => {
    reverseMapping[original.toLowerCase()] = placeholder;
  });

  let phoneCounter = Object.keys(mapping).filter((k) => k.startsWith('[PHONE_')).length + 1;
  let cnicCounter = Object.keys(mapping).filter((k) => k.startsWith('[CNIC_')).length + 1;
  let emailCounter = Object.keys(mapping).filter((k) => k.startsWith('[EMAIL_')).length + 1;
  let personCounter = Object.keys(mapping).filter((k) => k.startsWith('[PERSON_')).length + 1;

  let processed = text;

  // 1. Redact CNIC patterns: 12345-1234567-1 or 13 consecutive digits
  const cnicRegex = /\b\d{5}-\d{7}-\d{1}\b/g;
  processed = processed.replace(cnicRegex, (match) => {
    const key = match.toLowerCase();
    if (!reverseMapping[key]) {
      const placeholder = `[CNIC_${cnicCounter++}]`;
      mapping[placeholder] = match;
      reverseMapping[key] = placeholder;
    }
    return reverseMapping[key];
  });

  // 2. Redact Pakistani and international phone numbers
  // e.g. +92 300 1234567, 0300-1234567, +923001234567, 03211234567
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

  // 3. Redact Email addresses
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

  // 4. Redact User marked custom names
  userCustomNames.forEach((name) => {
    if (!name || name.trim().length < 2) return;
    const cleanName = name.trim();
    const key = cleanName.toLowerCase();
    if (!reverseMapping[key]) {
      const placeholder = `[PERSON_${personCounter++}]`;
      mapping[placeholder] = cleanName;
      reverseMapping[key] = placeholder;
    }
    // Replace all instances (case-insensitive)
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
    processed = processed.replace(nameRegex, reverseMapping[key]);
  });

  return { redactedText: processed, mapping, reverseMapping };
}

/**
 * Re-fills redacted placeholders locally on the client or before final display
 */
export function restoreRedactedData(
  redactedText: string,
  mapping: Record<string, string>
): string {
  if (!redactedText || !mapping) return redactedText || '';
  let restored = redactedText;
  Object.entries(mapping).forEach(([placeholder, original]) => {
    restored = restored.split(placeholder).join(original);
  });
  return restored;
}
