'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCitations } from '../context/CitationContext';
import { escapeCitationMarkers } from '../lib/citationProcessing';
import { makeCitationComponents } from '../lib/citationMarkdownComponents';

const remarkPlugins = [remarkGfm];

interface MarkdownContentProps {
  content: string;
}

export const MarkdownContent = memo(function MarkdownContent({ content }: MarkdownContentProps) {
  const citations = useCitations();
  const citationMap = useMemo(() => new Map(citations.map((c) => [c.id, c])), [citations]);
  const components = useMemo(() => makeCitationComponents(citationMap), [citationMap]);
  const escapedContent = useMemo(() => escapeCitationMarkers(content), [content]);

  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {escapedContent}
    </ReactMarkdown>
  );
});
