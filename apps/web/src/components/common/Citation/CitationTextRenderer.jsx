import React, { lazy, Suspense } from 'react';
import PropTypes from 'prop-types';
import CitationBadge from './CitationBadge';

const ReactMarkdown = lazy(() => import('react-markdown'));

/**
 * CitationTextRenderer component - renders text with citation markers as interactive badges
 * @param {Object} props - Component props
 * @param {string} props.text - Text containing citation markers (⚡CITE1⚡, ⚡CITE2⚡, etc.)
 * @param {Array} props.citations - Array of citation objects
 * @param {string} props.className - Additional CSS class
 * @returns {JSX.Element} Rendered text with interactive citations
 */
const CitationTextRenderer = ({ text, citations = [], className = "" }) => {
  if (!text || typeof text !== 'string') {
    return <span className={className}>{text}</span>;
  }
  
  // Pattern to match citation markers: ⚡CITE1⚡, ⚡CITE2⚡, etc.
  const citationMarkerPattern = /⚡CITE(\d+)⚡/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  // Create a lookup map for citations by index
  const citationMap = new Map();
  citations.forEach(citation => {
    citationMap.set(citation.index.toString(), citation);
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
      <span className={className}>
        <Suspense fallback={<span>{text}</span>}>
          <ReactMarkdown
            components={{
              a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />
            }}
          >
            {text}
          </ReactMarkdown>
        </Suspense>
      </span>
    );
  }
  
  return (
    <span className={`${className} citation-text-renderer`}>
      {parts.map((part, index) => {
        if (part.type === 'citation') {
          return (
            <CitationBadge
              key={part.key}
              citationIndex={part.citationIndex}
              citation={part.citation}
            />
          );
        }
        // If it's text, render it with markdown support
        // Use custom components to ensure inline rendering with citations
        return (
          <Suspense key={index} fallback={<span>{part.content}</span>}>
            <ReactMarkdown
              components={{
                a: ({node, ...props}) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                p: ({node, children}) => <span className="citation-text-segment">{children}</span>
              }}
            >
              {part.content}
            </ReactMarkdown>
          </Suspense>
        );
      })}
    </span>
  );
};

CitationTextRenderer.propTypes = {
  text: PropTypes.string,
  citations: PropTypes.array,
  className: PropTypes.string
};

export default CitationTextRenderer;