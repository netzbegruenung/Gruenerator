'use client';

import { memo, useMemo } from 'react';
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown';
import remarkGfm from 'remark-gfm';
import { useCitations } from '../../context/CitationContext';
import { escapeCitationMarkers } from '../../lib/citationProcessing';
import { makeCitationComponents } from '../../lib/citationMarkdownComponents';

const remarkPlugins = [remarkGfm];

function CitationMarkdownTextImpl() {
  const citations = useCitations();
  const citationMap = useMemo(() => new Map(citations.map((c) => [c.id, c])), [citations]);
  const components = useMemo(() => makeCitationComponents(citationMap), [citationMap]);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={remarkPlugins}
      components={components}
      preprocess={escapeCitationMarkers}
      smooth
    />
  );
}

export const CitationMarkdownText = memo(CitationMarkdownTextImpl);
