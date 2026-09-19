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
 * blocks are memoized and only the trailing block re-parses as deltas arrive,
 * so the typewriter-prefix invariant (and the two-tier smooth gate the legacy
 * renderer needed around it) does not exist here. Remend completes
 * half-streamed markdown for display.
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
    />
  );
}

export const StreamdownMarkdownText = memo(StreamdownMarkdownTextImpl);
