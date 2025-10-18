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

// New helper: build candidates with priorities and eliminate from right-to-left
// Priority rules:
//  - Priority 1: Leading letters of each word (first char per token)
//  - Priority 2: Consonants and digits (non-leading characters)
//  - Priority 3: Vowels (non-leading characters)
// We eliminate from right to left by priority (3, then 2, then 1) until 3 remain.
function initialsPriorityAbbrev3(inputRaw?: string): string {
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
  if (candidates.length === 0) return abbreviate3(inputRaw);

  // Eliminate from right to left by priority until only 3 remain
  const removeByPriority = (p: 1 | 2 | 3) => {
    for (let i = candidates.length - 1; i >= 0 && candidates.length > 3; i--) {
      if (candidates[i]!.pr === p) candidates.splice(i, 1);
    }
  };

  if (candidates.length > 3) removeByPriority(3);
  if (candidates.length > 3) removeByPriority(2);
  if (candidates.length > 3) removeByPriority(1);

  // If still longer than 3 (all same priority), keep the left-most 3
  while (candidates.length > 3) candidates.pop();

  // If shorter than 3, pad with X
  while (candidates.length < 3) candidates.push({ ch: "X", pr: 2 });

  return candidates.map((c) => c.ch).join("");
}

// Type → TTT
export function typeToTTT(typeRaw?: string): string {
  return initialsPriorityAbbrev3(typeRaw);
}

// Vendor → VVV (now also prioritizes initials for multi‑word vendors)
export function vendorToVVV(vendorRaw?: string): string {
  return initialsPriorityAbbrev3(vendorRaw);
}

// Group key and SKU formatting
export const groupKey = (typeRaw?: string, vendorRaw?: string) =>
  `${typeToTTT(typeRaw)}-${vendorToVVV(vendorRaw)}`;

export const formatSku = (group: string, n: number) =>
  `${group}-${n.toString(16).toUpperCase().padStart(4, "0")}`;