'use client';

import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown';
import { createMathPlugin } from '@streamdown/math';
import { memo } from 'react';

import { maybeLoadKatexCss } from '../../lib/katexCss';
import { normalizeMathDelimiters, normalizeUnicodeMath } from '../../lib/normalizeMathDelimiters';
import { rewriteCitationMarkers } from '../../lib/rewriteCitationMarkers';
import { shikiCodePlugin } from '../../lib/shikiHighlight';
import { streamdownComponents } from '../../lib/streamdownComponents';

// `singleDollarTextMath` matches the remark-math default the legacy renderer
// relied on: inline `$…$` must keep rendering as math. `code` is our own
// fine-grained shiki core, not @streamdown/code (which bundles every grammar).
const plugins = { code: shikiCodePlugin, math: createMathPlugin({ singleDollarTextMath: true }) };

// `<citation n="…">` is our own element (rewriteCitationMarkers); the
// sanitize/harden layer passes it through only because it is declared here.
const ALLOWED_TAGS: Record<string, string[]> = { citation: ['n'] };

// Code controls (copy/download) are read by StreamdownCodeBlock exactly as
// Streamdown's own code component would. Tables and mermaid keep our
// overrides, so their upstream controls never render regardless.
const CONTROLS = { code: true, table: false, mermaid: false };

// Only the strings Streamdown's code chrome surfaces; the rest stay unused.
const TRANSLATIONS = {
  copyCode: 'Code kopieren',
  copied: 'Kopiert',
  downloadFile: 'Code herunterladen',
};

// Same transform order as the legacy renderer: math delimiters first (bare
// `[1]` cannot collide with `\[…\]`), Unicode operators inside math spans,
// then citation markers → elements. The KaTeX stylesheet + mhchem keep
// lazy-loading on first math via the same shared-katex side effect.
const preprocess = (text: string) => {
  maybeLoadKatexCss(text);
  return rewriteCitationMarkers(normalizeUnicodeMath(normalizeMathDelimiters(text)));
};

/**
 * Streamdown renderer for assistant text parts. Block-based streaming: parsed
 * blocks are memoized and only the trailing block re-parses as deltas arrive.
 * Remend completes half-streamed markdown for display.
 *
 * `smooth` reveals the text at a steady rate instead of in whatever chunks the
 * SSE adapter delivers. Without it a single large delta lands as one visible
 * jump, which is what "the stream stutters" turns out to mean: measured against
 * a real SSE endpoint, frame times are flat either way (p50 16.7ms, zero frames
 * over 50ms) while the largest single jump drops from 291 to 103 characters.
 * It only does anything when a delta outruns the reveal; at the adapter's
 * normal cadence the reveal is already ahead and the prop is inert.
 *
 * It does re-enter `useSmooth`, which the legacy renderer needed a two-tier
 * gate around: the primitive runs `preprocess` BEFORE `useSmooth`, so the
 * typewriter-prefix invariant has to hold on the REWRITTEN text, and
 * `rewriteCitationMarkers` breaks it exactly as `escapeCitationMarkers` did
 * (`… Ziele [1` then `… Ziele <citation n="1">` is not an extension). The
 * consequence differs, though: in this version a break restarts the reveal
 * rather than dropping the remainder. Four adversarial runs — the stream
 * ending with up to 137 characters still unrevealed — all completed, with
 * every badge intact. If a cited answer ever stands cut mid-word again, this
 * prop is the first thing to turn off.
 *
 * `defer` is deliberately NOT set. It defers parsing via `useDeferredValue`,
 * and nothing here is parse-bound: neither a realistic run (192 deltas, 10817
 * characters) nor a stress run (628 deltas at 92/s, 16229 characters) moved
 * any number. Not measured with shiki highlighting active, which is the one
 * load where it might.
 *
 * No `caret` prop: Streamdown only sets its `--streamdown-caret` custom
 * property when one is passed, so omitting it is how the stream tail stays
 * unmarked. `CaretStyle` is `"block" | "circle"` — there is no `"none"`.
 * The running stream is already announced by the status line above the
 * answer, and the block caret (U+258B) read as a stray glyph in the prose.
 *
 * Fenced code renders in Streamdown's own chrome (StreamdownCodeBlock via the
 * `code` override), highlighted by our shiki core through `plugins.code`.
 * KaTeX comes from @streamdown/math; mhchem registers on the shared katex
 * instance through the same lazy loader the legacy path uses.
 */
function StreamdownMarkdownTextImpl() {
  return (
    <StreamdownTextPrimitive
      plugins={plugins}
      components={streamdownComponents}
      preprocess={preprocess}
      allowedTags={ALLOWED_TAGS}
      controls={CONTROLS}
      translations={TRANSLATIONS}
      smooth
    />
  );
}

export const StreamdownMarkdownText = memo(StreamdownMarkdownTextImpl);
