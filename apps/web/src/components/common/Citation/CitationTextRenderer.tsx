import { JSX } from 'react';
import CitationBadge, { CitationData } from './CitationBadge';
import { Markdown } from '../Markdown';
import type { LinkConfig } from '../../../stores/citationStore';

interface CitationTextRendererProps {
  text?: string;
  citations?: CitationData[];
  className?: string;
  linkConfig?: LinkConfig;
}

const CitationTextRenderer = ({
  text,
  citations = [],
  className = "",
  linkConfig
}: CitationTextRendererProps): JSX.Element => {
  if (!text || typeof text !== 'string') {
    return <span className={className}>{text}</span>;
  }

  // Pattern to match citation markers: ⚡CITE1⚡, ⚡CITE2⚡, etc.
  const citationMarkerPattern = /⚡CITE(\d+)⚡/g;

  const parts: Array<{
    type: 'text' | 'citation';
    content?: string;
    citationIndex?: string;
    citation?: CitationData;
    key?: string;
  }> = [];
  let lastIndex = 0;
  let match;

  // Create a lookup map for citations by index
  const citationMap = new Map<string, CitationData>();
  citations.forEach(citation => {
    if (citation.index !== undefined) {
      citationMap.set(citation.index.toString(), citation);
    }
  });

  while ((match = citationMarkerPattern.exec(text)) !== null) {
    const [fullMatch, citationIndex] = match;
    const matchStart = match.index;

    // Add text before this citation
    if (matchStart > lastIndex) {
      const textBefore = text.slice(lastIndex, matchStart);
      if (textBefore) {
        parts.push({ type: 'text', content: textBefore });
      }
    }

    // Find the corresponding citation
    const citation = citationMap.get(citationIndex);

    // Add the citation data
    parts.push({
      type: 'citation',
      citationIndex: citationIndex,
      citation: citation,
      key: `citation-${citationIndex}-${matchStart}`
    });

    lastIndex = match.index + fullMatch.length;
  }

  // Add remaining text after last citation
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      parts.push({ type: 'text', content: remainingText });
    }
  }

  // If no citations were found, return the original text with markdown
  if (parts.length === 0) {
    return (
      <Markdown className={className} inline>
        {text}
      </Markdown>
    );
  }

  return (
    <span className={`${className} citation-text-renderer`}>
      {parts.map((part, index) => {
        if (part.type === 'citation') {
          return (
            <CitationBadge
              key={part.key}
              citationIndex={part.citationIndex || ''}
              citation={part.citation}
              linkConfig={linkConfig}
            />
          );
        }
        return (
          <Markdown
            key={index}
            className="citation-text-segment"
            inline
          >
            {part.content || ''}
          </Markdown>
        );
      })}
    </span>
  );
};

export default CitationTextRenderer;
