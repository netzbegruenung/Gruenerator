'use client';

import { useAuiState, useMessagePartText } from '@assistant-ui/react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import { memo, useMemo } from 'react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useCitations } from '../../context/CitationContext';
import { useMarkdownSmooth } from '../../context/MarkdownStreamingContext';
import { makeCitationComponents } from '../../lib/citationMarkdownComponents';
import { escapeCitationMarkers } from '../../lib/citationProcessing';
import { maybeLoadKatexCss } from '../../lib/katexCss';
import { normalizeMathDelimiters, normalizeUnicodeMath } from '../../lib/normalizeMathDelimiters';

import type { ChatMessageMetadata } from '../../types/messageMetadata';

const remarkPlugins = [remarkGfm, remarkMath];
// `throwOnError: false` → broken or half-streamed LaTeX renders as raw text
// instead of throwing (mirrors open-webui's KaTeX config).
const rehypePlugins: [typeof rehypeKatex, { throwOnError: boolean }][] = [
  [rehypeKatex, { throwOnError: false }],
];

// Normalize \( \) / \[ \] math delimiters, then map raw Unicode operators to
// LaTeX commands inside math spans, BEFORE escaping citation markers
// (escapeCitationMarkers emits `\[1\]`, which must not be seen as math).
const preprocess = (text: string) => {
  maybeLoadKatexCss(text); // lazy-load the KaTeX stylesheet on first math
  return escapeCitationMarkers(normalizeUnicodeMath(normalizeMathDelimiters(text)));
};

/**
 * A grounded answer disables the typewriter reveal — for the WHOLE message when
 * we know early, else from the first `[N]` marker.
 *
 * `useSmooth` only animates while each new text is an extension of the last one
 * — it checks `text.startsWith(displayedText)` and restarts the reveal from zero
 * when that fails. `escapeCitationMarkers` breaks exactly that invariant: a
 * half-streamed marker renders as `… ein [3`, and the next delta rewrites the
 * same span to `… ein \[3\]`, which is not an extension. Every completed marker
 * therefore restarts the reveal, and when the stream finishes while the reveal
 * is still catching up, the animator stops WITHOUT committing the remainder —
 * the answer stands cut mid-word while the UI marks it complete (measured live:
 * 513 chars generated and persisted, 414 on screen).
 *
 * Two-tier gate:
 *   1. Search mode emits `sources_preview` before any text, so
 *      `metadata.custom.searchResults` is set from the first frame — the whole
 *      answer renders non-smooth, no mid-stream snap.
 *   2. Citation paths without the preview event (`done`-event citations) fall
 *      back to the marker regex, flipping smooth off at the first `[N]`.
 *
 * Cited answers stream fine without the animation: the SSE adapter already
 * yields at most every 50ms, which is the perceived streaming. Same trade the
 * notebook thread makes wholesale — see MarkdownStreamingContext.
 */
const CITATION_MARKER_RE = /\[\d+(?:\s*,\s*\d+)*\]/;

function CitationMarkdownTextImpl() {
  const citations = useCitations();
  const { text: rawText } = useMessagePartText();
  const hasSearchSources = useAuiState((s) => {
    const custom = s.message.metadata?.custom as ChatMessageMetadata | undefined;
    return (custom?.searchResults?.length ?? 0) > 0;
  });
  const smooth =
    useMarkdownSmooth() &&
    !hasSearchSources &&
    citations.length === 0 &&
    !CITATION_MARKER_RE.test(rawText);
  const citationMap = useMemo(() => new Map(citations.map((c) => [c.id, c])), [citations]);
  const components = useMemo(() => makeCitationComponents(citationMap), [citationMap]);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={components}
      preprocess={preprocess}
      smooth={smooth}
    />
  );
}

export const CitationMarkdownText = memo(CitationMarkdownTextImpl);
