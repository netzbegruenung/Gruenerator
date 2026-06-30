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
export function normalizeMathDelimiters(text: string): string {
  return (
    text
      // Display math: \[ … \] → $$ … $$  (non-greedy, spans newlines)
      .replace(/\\\[([\s\S]+?)\\\]/g, (_match, inner: string) => `$$${inner}$$`)
      // Inline math: \( … \) → $ … $
      .replace(/\\\(([\s\S]+?)\\\)/g, (_match, inner: string) => `$${inner}$`)
  );
}
