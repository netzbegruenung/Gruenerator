import { type JSX, useState, useRef } from 'react';

import useCitationStore, { type LinkConfig } from '../../../stores/citationStore';

import CitationPopup from './CitationPopup';

export interface CitationData {
  cited_text?: string;
  document_title?: string;
  similarity_score?: number;
  index?: number | string;
  title?: string;
  url?: string;
  source?: string;
  content?: string;
  document_id?: string;
  chunk_index?: number;
  [key: string]: unknown;
}

interface CitationBadgeProps {
  citationIndex: string;
  citation?: CitationData;
  linkConfig?: LinkConfig;
}

const CitationBadge = ({
  citationIndex,
  citation,
  linkConfig,
}: CitationBadgeProps): JSX.Element => {
  const [showPopup, setShowPopup] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const { setSelectedCitation, fetchChunkContext } = useCitationStore();

  const handleClick = () => {
    if (!citation) return;

    // If we have document_id and chunk_index, fetch context (same as CitationSourcesDisplay)
    if (citation.document_id && citation.chunk_index !== undefined) {
      void fetchChunkContext(
        citation.document_id,
        citation.chunk_index,
        citation as CitationData,
        linkConfig
      );
    } else {
      // Fallback: just set the citation without context
      setSelectedCitation(citation as CitationData, linkConfig);
    }
  };

  return (
    <span className="relative inline" ref={badgeRef}>
      <span
        className="inline-flex items-center justify-center size-[18px] bg-accent dark:bg-primary-400 text-background dark:text-grey-950 text-[0.75rem] font-semibold rounded-full cursor-pointer transition-all duration-200 mx-0.5 relative -top-0.5 select-none hover:bg-link hover:scale-105"
        onMouseEnter={() => setShowPopup(true)}
        onMouseLeave={() => setShowPopup(false)}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label={`Citation ${citationIndex}${citation ? `: ${citation.document_title}` : ''}`}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {citationIndex}
      </span>
      {showPopup && citation && <CitationPopup citation={citation} badgeRef={badgeRef} />}
    </span>
  );
};

export default CitationBadge;
