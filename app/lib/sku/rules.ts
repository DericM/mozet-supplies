// app/lib/sku/rules.ts

// Core rule:
// 1) Take the first character (after cleanup).
// 2) Prefer consonants/digits for the remaining slots (skip vowels).
// 3) If still short, allow vowels for clarity.
// 4) De-dupe immediate repeats, pad with X to length 3.
// Cleanup removes non-alphanumerics and uppercases.
function abbreviate3(input?: string): string {
  const cleaned = (input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return "UNK";

  const isVowel = (ch: string) => /^[AEIOU]$/.test(ch);
  const chars = cleaned.split("");

  const out: string[] = [];
  // Always take first character
  out.push(chars[0]);

  // Pass 1: prefer consonants and digits (skip vowels)
  for (let i = 1; i < chars.length && out.length < 3; i++) {
    const ch = chars[i];
    const prev = out[out.length - 1];
    if (ch === prev) continue; // skip immediate repeats
    if (!isVowel(ch) || /\d/.test(ch)) out.push(ch);
  }

  // Pass 2: if still short, allow vowels for clarity
  for (let i = 1; i < chars.length && out.length < 3; i++) {
    const ch = chars[i];
    const prev = out[out.length - 1];
    if (ch === prev) continue;
    if (isVowel(ch)) out.push(ch);
  }

  while (out.length < 3) out.push("X");
  return out.join("");
}

// Type → TTT
export function typeToTTT(typeRaw?: string): string {
  return abbreviate3(typeRaw);
}

// Vendor → VVV
export function vendorToVVV(vendorRaw?: string): string {
  return abbreviate3(vendorRaw);
}

// Group key and SKU formatting
export const groupKey = (typeRaw?: string, vendorRaw?: string) =>
  `${typeToTTT(typeRaw)}-${vendorToVVV(vendorRaw)}`;

export const formatSku = (group: string, n: number) =>
  `${group}-${String(n).padStart(3, "0")}`;