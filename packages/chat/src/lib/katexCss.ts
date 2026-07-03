/// <reference path="../css.d.ts" />
// Lazy KaTeX asset loader. A dynamic import is a code-split boundary, so the
// KaTeX stylesheet + the mhchem extension land in their own async chunk instead
// of the eager app-boot bundle — fetched once, when the first math expression
// appears in chat.
//
// mhchem registers `\ce{…}` / `\pu{…}` on the shared katex module that
// rehype-katex renders with (single deduped copy), so chemistry formulas work.
let started = false;

function ensureKatexAssets(): void {
  if (started) return;
  started = true;
  // `*.css` / `katex/contrib/mhchem` are declared as side-effect modules
  // (see css.d.ts); Vite injects the CSS and runs mhchem's katex registration.
  void import('katex/dist/katex.min.css');
  void import('katex/contrib/mhchem');
}

// Detects $$…$$, $…$, \( , \[ — enough to trigger the load before render.
const MATH_DELIMITER_RE = /\$\$|\$[^$\n]+\$|\\\(|\\\[/;

/** Trigger the one-time KaTeX asset load (stylesheet + mhchem) if `text` has math. */
export function maybeLoadKatexCss(text: string): void {
  if (!started && MATH_DELIMITER_RE.test(text)) ensureKatexAssets();
}
