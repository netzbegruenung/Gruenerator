import { JSX, useState, useRef, RefObject } from 'react';
import useCitationStore from '../../../stores/citationStore';
import CitationPopup from './CitationPopup';

/**
 * CitationBadge component - renders clickable citation numbers with hover popup
 * @param {Object} props - Component props
 * @param {string} props.citationIndex - The citation number (e.g., "1", "2")
 * @param {Object} props.citation - The citation data object
 * @returns {JSX.Element} Citation badge with popup
 */
export interface CitationData {
  cited_text?: string;
  document_title?: string;
  similarity_score?: number;
  index?: number | string;
  title?: string;
  url?: string;
  source?: string;
  content?: string;
  [key: string]: unknown;
}

interface CitationBadgeProps {
  citationIndex: string;
  citation?: CitationData;
}

const CitationBadge = ({ citationIndex, citation }: CitationBadgeProps): JSX.Element => {
  const [showPopup, setShowPopup] = useState(false);
  const badgeRef = useRef<HTMLSpanElement>(null);
  const { setSelectedCitation } = useCitationStore();

  const handleClick = () => {
    if (citation) {
      setSelectedCitation(citation);
    }
  };

  const handleMouseEnter = () => {
    setShowPopup(true);
  };

  const handleMouseLeave = () => {
    setShowPopup(false);
  };

  return (
    <span className="citation-badge-container" ref={badgeRef}>
      <span
        className="citation-badge"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
      {showPopup && citation && (
        <CitationPopup citation={citation} badgeRef={badgeRef} />
      )}
    </span>
  );
};

export default CitationBadge;
