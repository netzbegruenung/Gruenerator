'use client';

import {
  StreamdownTextPrimitive,
  type StreamdownTextPrimitiveProps,
} from '@assistant-ui/react-streamdown';
import { createMathPlugin } from '@streamdown/math';
import { memo } from 'react';
import { defaultRemarkPlugins } from 'streamdown';

import { useMarkdownSmooth } from '../../context/MarkdownStreamingContext';
import { maybeLoadKatexCss } from '../../lib/katexCss';
import { normalizeMathDelimiters, normalizeUnicodeMath } from '../../lib/normalizeMathDelimiters';
import { remarkCitationMarkers } from '../../lib/remarkCitationMarkers';
import { shikiCodePlugin } from '../../lib/shikiHighlight';
import { streamdownComponents } from '../../lib/streamdownComponents';

// `singleDollarTextMath` matches the remark-math default the legacy renderer
// relied on: inline `$…$` must keep rendering as math. `code` is our own
// fine-grained shiki core, not @streamdown/code (which bundles every grammar).
const plugins = { code: shikiCodePlugin, math: createMathPlugin({ singleDollarTextMath: true }) };

// `citation` is our own element (remarkCitationMarkers builds it on the tree);
// the sanitize/harden layer passes it through only because it is declared here.
const ALLOWED_TAGS: Record<string, string[]> = { citation: ['n'] };

// A `remarkPlugins` prop REPLACES Streamdown's default list (gfm, codeMeta)
// rather than extending it — tables and fence metadata would silently vanish
// without the spread. The math plugin's remark half is merged by Streamdown
// separately and needs no entry here.
const remarkPlugins: NonNullable<StreamdownTextPrimitiveProps['remarkPlugins']> = [
  ...Object.values(defaultRemarkPlugins),
  remarkCitationMarkers,
];

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

// Math only: delimiters first, then Unicode operators inside math spans. Both
// are prefix-stable under streaming (they rewrite closed spans, and a closed
// span never reopens). Citation markers are deliberately NOT rewritten here —
// see remarkCitationMarkers for why the reveal must never see the markup. The
// KaTeX stylesheet + mhchem keep lazy-loading on first math via the same
// shared-katex side effect.
const preprocess = (text: string) => {
  maybeLoadKatexCss(text);
  return normalizeUnicodeMath(normalizeMathDelimiters(text));
};

/**
 * Streamdown renderer for assistant text parts. Block-based streaming: parsed
 * blocks are memoized and only the trailing block re-parses as deltas arrive.
 * Remend completes half-streamed markdown for display.
 *
 * `smooth` comes from `MarkdownStreamingContext`, NOT from a literal: notebook
 * threads (NotebookChatProvider) and read-only threads (ReadonlyThreadProvider)
 * set it to `false`, and this renderer serves those surfaces too now that
 * `DEFAULT_STREAMDOWN` is true. Their reason survives the move off the legacy
 * renderer — a citation badge is an inline box either way, and revealing
 * character by character makes line wrap and badge placement recompute every
 * frame, which is the up/down jump the context was created to stop. The
 * measurement below says the same thing from the other side: those adapters
 * throttle to 50ms, and at that cadence the reveal is inert anyway.
 *
 * Where it is on, it reveals the text at a steady rate instead of in whatever
 * chunks the SSE adapter delivers. Without it a single large delta lands as
 * one visible jump, which is what "the stream stutters" turns out to mean:
 * measured against a real SSE endpoint, frame times are flat either way (p50
 * 16.7ms, zero frames over 50ms) while the largest single jump drops from 291
 * to 103 characters. It only does anything when a delta outruns the reveal; at
 * the adapter's normal cadence the reveal is already ahead and the prop is
 * inert.
 *
 * It re-enters `useSmooth`, which the legacy renderer had to gate off for
 * every cited answer because `escapeCitationMarkers` broke the typewriter's
 * prefix invariant. That gate is NOT ported here, and it must not be: the
 * invariant is honoured structurally instead. The primitive runs `preprocess`
 * BEFORE `useSmooth`, so anything rewritten there is walked by the reveal
 * cursor — which is exactly what went wrong the first time citations met this
 * renderer (a 27-character `<citation>` tag per marker under the cursor, and a
 * full reset to "" whenever a delta split a marker). Citations therefore
 * become elements on the syntax tree, AFTER the reveal, where the cursor only
 * ever sees raw text. The measurement and the mechanism live with
 * remarkCitationMarkers. If cited answers ever jump again, check that
 * `preprocess` still leaves `[N]` alone before touching `smooth`.
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
      remarkPlugins={remarkPlugins}
      allowedTags={ALLOWED_TAGS}
      controls={CONTROLS}
      translations={TRANSLATIONS}
      smooth={useMarkdownSmooth()}
    />
  );
}

export const StreamdownMarkdownText = memo(StreamdownMarkdownTextImpl);
