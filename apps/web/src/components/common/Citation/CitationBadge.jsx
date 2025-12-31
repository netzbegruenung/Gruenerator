import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import useCitationStore from '../../../stores/citationStore';
import CitationPopup from './CitationPopup';

/**
 * CitationBadge component - renders clickable citation numbers with hover popup
 * @param {Object} props - Component props
 * @param {string} props.citationIndex - The citation number (e.g., "1", "2")
 * @param {Object} props.citation - The citation data object
 * @returns {JSX.Element} Citation badge with popup
 */
const CitationBadge = ({ citationIndex, citation }) => {
  const [showPopup, setShowPopup] = useState(false);
  const badgeRef = useRef(null);
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
        onKeyDown={(e) => {
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

CitationBadge.propTypes = {
  citationIndex: PropTypes.string.isRequired,
  citation: PropTypes.shape({
    index: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    cited_text: PropTypes.string,
    document_title: PropTypes.string,
    document_id: PropTypes.string,
    similarity_score: PropTypes.number
  })
};

export default CitationBadge;