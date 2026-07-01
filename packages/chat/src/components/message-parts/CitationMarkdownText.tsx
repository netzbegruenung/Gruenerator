'use client';

import { memo, useMemo } from 'react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useCitations } from '../../context/CitationContext';
import { useMarkdownSmooth } from '../../context/MarkdownStreamingContext';
import { escapeCitationMarkers } from '../../lib/citationProcessing';
import { maybeLoadKatexCss } from '../../lib/katexCss';
import { normalizeMathDelimiters, normalizeUnicodeMath } from '../../lib/normalizeMathDelimiters';
import { makeCitationComponents } from '../../lib/citationMarkdownComponents';

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

function CitationMarkdownTextImpl() {
  const citations = useCitations();
  const smooth = useMarkdownSmooth();
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
