// Lazy KaTeX stylesheet loader. A dynamic import is a code-split boundary, so
// katex.min.css lands in its own async chunk instead of the eager app-boot CSS
// — it is fetched only once, when the first math expression appears in chat.
let started = false;

function ensureKatexCss(): void {
  if (started) return;
  started = true;
  // `*.css` is declared as a side-effect module (see css.d.ts); Vite injects it.
  void import('katex/dist/katex.min.css');
}

// Detects $$…$$, $…$, \( , \[ — enough to trigger the load before render.
const MATH_DELIMITER_RE = /\$\$|\$[^$\n]+\$|\\\(|\\\[/;

/** Trigger the one-time KaTeX CSS load if `text` contains any math. */
export function maybeLoadKatexCss(text: string): void {
  if (!started && MATH_DELIMITER_RE.test(text)) ensureKatexCss();
}
