import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';

/**
 * CitationSourcesDisplay component - displays sources and citations in a consistent format
 * @param {Object} props - Component props
 * @param {Array} props.sources - Array of source objects
 * @param {Array} props.citations - Array of citation objects
 * @param {Object} props.linkConfig - Configuration for document links
 * @param {string} props.title - Title for the sources section (default: "Quellen und Zitate")
 * @param {string} props.className - Additional CSS class
 * @returns {JSX.Element|null} Citation sources display or null if no sources/citations
 */
const CitationSourcesDisplay = ({
  sources = [],
  citations = [],
  linkConfig = { type: 'none' },
  title = "Quellen und Zitate",
  className = ""
}) => {
  const navigate = useNavigate();

  // Create document groups that merge sources and citations
  const createDocumentGroups = useCallback(() => {
    const groupMap = new Map();
    
    // First, process all sources to create base document groups
    sources.forEach(source => {
      const docId = source.document_id || source[linkConfig.linkKey];
      const title = source[linkConfig.titleKey] || source.document_title;
      
      if (!groupMap.has(docId)) {
        groupMap.set(docId, {
          documentId: docId,
          documentTitle: title,
          relevance: source.similarity_score,
          citations: [],
          additionalContent: source.chunk_text,
          hasAdditionalContext: false
        });
      }
    });
    
    // Then, add citations to their respective document groups
    citations.forEach(citation => {
      const docId = citation.document_id;
      
      if (!groupMap.has(docId)) {
        // Create group for citation-only documents
        groupMap.set(docId, {
          documentId: docId,
          documentTitle: citation.document_title,
          relevance: citation.similarity_score,
          citations: [],
          additionalContent: '',
          hasAdditionalContext: false
        });
      }
      
      const group = groupMap.get(docId);
      group.citations.push(citation);
      
      // Check if citation text differs significantly from additional content
      if (group.additionalContent && 
          !group.additionalContent.includes(citation.cited_text.substring(0, 50))) {
        group.hasAdditionalContext = true;
      }
    });
    
    // Sort by relevance (highest first)
    return Array.from(groupMap.values()).sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
  }, [sources, citations, linkConfig]);

  // Handle document link click
  const handleDocumentClick = useCallback((documentId) => {
    if (linkConfig.type === 'vectorDocument' && documentId) {
      // Navigate to the document view page
      navigate(`/documents/${documentId}`);
    }
  }, [linkConfig, navigate]);

  if (sources.length === 0 && citations.length === 0) return null;

  const documentGroups = createDocumentGroups();

  return (
    <div className={`ask-sources-section ${className}`}>
      <div className="ask-sources-header">
        <h4 className="ask-sources-title">{title}</h4>
      </div>
      
      <div className="ask-document-groups">
        {documentGroups.map((group, index) => (
          <div key={group.documentId || index} className="ask-document-group">
            <div className="ask-document-header">
              <h5 
                className={`ask-document-title ${linkConfig.type !== 'none' ? 'clickable-link' : ''}`}
                onClick={() => linkConfig.type !== 'none' && group.documentId && handleDocumentClick(group.documentId)}
              >
                {group.documentTitle}
              </h5>
              {group.relevance && (
                <span className="ask-document-relevance">
                  {Math.round(group.relevance * 100)}%
                </span>
              )}
            </div>
            
            {/* Show citations from this document */}
            {group.citations.length > 0 && (
              <div className="ask-document-citations">
                {group.citations.map((citation, idx) => (
                  <div key={idx} className="ask-citation-inline">
                    <span className="citation-number">[{citation.index}]</span>
                    <span className="citation-text">"{citation.cited_text}"</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Show additional document context if different from citations */}
            {group.hasAdditionalContext && group.additionalContent && (
              <details className="ask-document-context">
                <summary>Weitere Inhalte aus diesem Dokument</summary>
                <p className="ask-document-excerpt">{group.additionalContent}</p>
              </details>
            )}
            
            {linkConfig.type !== 'none' && group.documentId && (
              <button 
                className="ask-document-link"
                onClick={() => handleDocumentClick(group.documentId)}
              >
                Dokument öffnen →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

CitationSourcesDisplay.propTypes = {
  sources: PropTypes.array,
  citations: PropTypes.array,
  linkConfig: PropTypes.shape({
    type: PropTypes.string,
    linkKey: PropTypes.string,
    titleKey: PropTypes.string
  }),
  title: PropTypes.string,
  className: PropTypes.string
};

export default CitationSourcesDisplay;