import React from 'react';
import PropTypes from 'prop-types';

/**
 * CitationPopup component - shows citation preview on hover
 * @param {Object} props - Component props
 * @param {Object} props.citation - The citation data object
 * @returns {JSX.Element} Citation popup
 */
const CitationPopup = ({ citation }) => {
  if (!citation) return null;

  // Truncate cited text for popup display
  const truncatedText = citation.cited_text?.substring(0, 150) || '';
  const displayText = truncatedText.length === 150 ? `${truncatedText}...` : truncatedText;

  return (
    <span className="citation-popup">
      <span className="citation-popup-text">
        "{displayText}"
      </span>
      <span className="citation-popup-source">
        {citation.document_title}
      </span>
    </span>
  );
};

CitationPopup.propTypes = {
  citation: PropTypes.shape({
    cited_text: PropTypes.string,
    document_title: PropTypes.string,
    similarity_score: PropTypes.number
  }).isRequired
};

export default CitationPopup;