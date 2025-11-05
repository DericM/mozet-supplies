// app/lib/sku/rules.ts

// Core rule:
// 1) Take the first character (after cleanup).
// 2) Prefer consonants/digits for the remaining slots (skip vowels).
// 3) If still short, allow vowels for clarity.
// 4) De-dupe immediate repeats, pad with X to length 3.
// Cleanup removes non-alphanumerics and uppercases.
// (kept older 3-letter algorithm removed in favor of N-based)

// New helper: build candidates with priorities and eliminate from right-to-left
// Priority rules:
//  - Priority 1: Leading letters of each word (first char per token)
//  - Priority 2: Consonants and digits (non-leading characters)
//  - Priority 3: Vowels (non-leading characters)
// We eliminate from right to left by priority (3, then 2, then 1) until 3 remain.
function initialsPriorityAbbrevN(inputRaw: string | undefined, N: number): string {
  const input = inputRaw || "";
  const tokens = input.match(/[A-Za-z0-9]+/g) || [];

  const isVowel = (ch: string) => /^[AEIOU]$/.test(ch);
  const isConsonant = (ch: string) => /^[A-Z]$/.test(ch) && !isVowel(ch);

  // Build ordered candidate list from left to right across tokens
  const candidates: Array<{ ch: string; pr: 1 | 2 | 3 }> = [];
  for (const tok of tokens) {
    const upper = tok.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!upper) continue;
    let prevChar: string | null = null;
    for (let i = 0; i < upper.length; i++) {
      const ch = upper[i]!;
      let pr: 1 | 2 | 3;
      if (i === 0) pr = 1; // leading letter of the word
      else if (/\d/.test(ch)) pr = 2; // digits behave like consonants
      else pr = isVowel(ch) ? 3 : 2;

      // New rule: if two or more identical consonants in a row within a token,
      // trailing identical consonants get downgraded to priority 3.
      if (prevChar && ch === prevChar && isConsonant(ch)) {
        pr = 3;
      }

      candidates.push({ ch, pr });
      prevChar = ch;
    }
  }

  // If nothing usable, fall back
  if (candidates.length === 0) {
    // Fallbacks
    const cleaned = (inputRaw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!cleaned) return "X".repeat(N);
    return (cleaned + "X".repeat(N)).slice(0, N);
  }

  // Eliminate from right to left by priority until only 3 remain
  const removeByPriority = (p: 1 | 2 | 3) => {
    for (let i = candidates.length - 1; i >= 0 && candidates.length > N; i--) {
      if (candidates[i]!.pr === p) candidates.splice(i, 1);
    }
  };

  if (candidates.length > N) removeByPriority(3);
  if (candidates.length > N) removeByPriority(2);
  if (candidates.length > N) removeByPriority(1);

  // If still longer than N (all same priority), keep the left-most N
  while (candidates.length > N) candidates.pop();

  // If shorter than N, pad with X
  while (candidates.length < N) candidates.push({ ch: "X", pr: 2 });

  return candidates.map((c) => c.ch).join("");
}

// Type → TTT
export function typeToTTT(typeRaw?: string): string {
  return initialsPriorityAbbrevN(typeRaw, 3);
}

// Vendor → VVV (now also prioritizes initials for multi‑word vendors)
export function vendorToVVV(vendorRaw?: string): string {
  return initialsPriorityAbbrevN(vendorRaw, 3);
}

// 2-char helpers
export function typeToTT(typeRaw?: string): string {
  return initialsPriorityAbbrevN(typeRaw, 2);
}
export function vendorToTT(vendorRaw?: string): string {
  return initialsPriorityAbbrevN(vendorRaw, 2);
}
export function optionToTT(valueRaw?: string): string {
  return initialsPriorityAbbrevN(valueRaw, 2);
}

// Group key: still coarse to share sequence across variants of same type/vendor
export const groupKey = (typeRaw?: string, vendorRaw?: string) =>
  `${typeToTTT(typeRaw)}-${vendorToVVV(vendorRaw)}`;

// New SKU format: TT VV SSS [OO]... (concatenated, no hyphens)
// - TT: 2-letter type
// - VV: 2-letter vendor
// - SSS: 3-digit decimal sequence, zero-padded
// - OO..: 2-letter per option value (order as provided)
export function buildSku(
  typeRaw: string | undefined,
  vendorRaw: string | undefined,
  seq: number,
  optionValues: string[]
): string {
  const TT = typeToTT(typeRaw);
  const VV = vendorToTT(vendorRaw);
  const SSS = String(Math.max(0, Math.floor(seq))).padStart(3, "0");
  const OO = optionValues.map((v) => optionToTT(v)).join("");
  return `${TT}${VV}${SSS}${OO}`;
}