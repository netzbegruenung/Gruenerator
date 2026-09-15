'use client';

import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown';
import { createMathPlugin } from '@streamdown/math';
import { memo } from 'react';

import { maybeLoadKatexCss } from '../../lib/katexCss';
import { normalizeMathDelimiters, normalizeUnicodeMath } from '../../lib/normalizeMathDelimiters';
import { rewriteCitationMarkers } from '../../lib/rewriteCitationMarkers';
import { streamdownComponents } from '../../lib/streamdownComponents';

// `singleDollarTextMath` matches the remark-math default the legacy renderer
// relied on: inline `$…$` must keep rendering as math.
const plugins = { math: createMathPlugin({ singleDollarTextMath: true }) };

// `<citation n="…">` is our own element (rewriteCitationMarkers); the
// sanitize/harden layer passes it through only because it is declared here.
const ALLOWED_TAGS: Record<string, string[]> = { citation: ['n'] };

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
 * half-streamed markdown for display; the caret marks the stream tail.
 *
 * Code chrome stays ours (`controls={false}`): ChatCodeBlock keeps its own
 * copy/Pyodide/chart/mermaid handling via the `pre` override. KaTeX comes
 * from @streamdown/math; mhchem registers on the shared katex instance
 * through the same lazy loader the legacy path uses.
 */
function StreamdownMarkdownTextImpl() {
  return (
    <StreamdownTextPrimitive
      plugins={plugins}
      components={streamdownComponents}
      preprocess={preprocess}
      allowedTags={ALLOWED_TAGS}
      controls={false}
      caret="block"
    />
  );
}

export const StreamdownMarkdownText = memo(StreamdownMarkdownTextImpl);
