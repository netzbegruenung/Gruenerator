/**
 * Normalize LaTeX math delimiters so `remark-math` can pick them up.
 *
 * LLMs frequently emit backslash delimiters — `\( … \)` for inline and
 * `\[ … \]` for display math — but `remark-math` only understands the dollar
 * forms (`$ … $` and `$$ … $$`). This converts the backslash forms to dollar
 * forms (mirrors open-webui's katex-extension delimiter list).
 *
 * IMPORTANT — ordering: run this BEFORE `escapeCitationMarkers`. At this point
 * citation markers are still bare `[1]`, so the `\[ … \]` rule cannot collide
 * with escaped citations (which only appear as `\[1\]` AFTER escaping).
 */
/**
 * Same job the lazy `/\\\[([\s\S]+?)\\\]/g` pair used to do, scanned with
 * `indexOf` instead. The regex form was quadratic in the message length on
 * unbalanced input (`\[a\[a\[a…` with no closing delimiter — CodeQL
 * js/polynomial-redos), and every streamed assistant token runs through here.
 * Semantics are unchanged: shortest match, at least one inner character, and
 * scanning resumes after the closing delimiter.
 */
function replacePairedDelimiters(text: string, open: string, close: string, wrap: string): string {
  let out = '';
  let cursor = 0;
  for (;;) {
    const start = text.indexOf(open, cursor);
    if (start === -1) break;
    // `+ 1` because the inner group is `+?`, not `*?`.
    const end = text.indexOf(close, start + open.length + 1);
    // No closing delimiter left anywhere — no later opener can match either.
    if (end === -1) break;
    out += text.slice(cursor, start) + wrap + text.slice(start + open.length, end) + wrap;
    cursor = end + close.length;
  }
  return out + text.slice(cursor);
}

export function normalizeMathDelimiters(text: string): string {
  // Display math: \[ … \] → $$ … $$, then inline math: \( … \) → $ … $
  return replacePairedDelimiters(
    replacePairedDelimiters(text, '\\[', '\\]', '$$'),
    '\\(',
    '\\)',
    '$'
  );
}

/**
 * Common raw Unicode math operators LLMs emit instead of LaTeX commands. KaTeX
 * has no glyph for several of these (they render as tofu boxes, e.g. `≠`), so we
 * map them to the equivalent command. The trailing space prevents commands from
 * fusing with a following token (`≠0` → `\neq 0`).
 */
const UNICODE_MATH_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['≠', '\\neq '],
  ['≤', '\\leq '],
  ['≥', '\\geq '],
  ['×', '\\times '],
  ['÷', '\\div '],
  ['·', '\\cdot '],
  ['⋅', '\\cdot '],
  ['∓', '\\mp '],
  ['≈', '\\approx '],
  ['≡', '\\equiv '],
  ['∞', '\\infty '],
  ['∈', '\\in '],
  ['∉', '\\notin '],
  ['⇒', '\\Rightarrow '],
  ['⇔', '\\Leftrightarrow '],
  ['→', '\\to '],
];

function replaceUnicodeOperators(mathContent: string): string {
  let out = mathContent;
  for (const [unicode, command] of UNICODE_MATH_REPLACEMENTS) {
    if (out.includes(unicode)) out = out.split(unicode).join(command);
  }
  return out;
}

/**
 * Replace raw Unicode math operators with LaTeX commands, but ONLY inside math
 * spans (`$$ … $$` and `$ … $`) so prose like "Vorzeichen ±" is left alone.
 * Run AFTER {@link normalizeMathDelimiters} (so `\( \)` are already `$`) and
 * BEFORE citation escaping.
 */
export function normalizeUnicodeMath(text: string): string {
  // Display first ($$ … $$), then inline ($ … $, no newline, non-empty).
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, inner: string) => `$$${replaceUnicodeOperators(inner)}$$`)
    .replace(/\$([^$\n]+?)\$/g, (_m, inner: string) => `$${replaceUnicodeOperators(inner)}$`);
}
