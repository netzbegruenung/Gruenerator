import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';

/**
 * CitationSourcesDisplay component - displays sources and citations in a consistent format
 * @param {Object} props - Component props
 * @param {Array} props.sources - Array of source objects
 * @param {Array} props.citations - Array of citation objects
 * @param {Array} props.additionalSources - Array of uncited source objects for "Weitere Quellen"
 * @param {Object} props.linkConfig - Configuration for document links
 *   - type: 'none' | 'vectorDocument' | 'external'
 *   - linkKey: key for document ID
 *   - titleKey: key for document title
 *   - urlKey: key for external URL (used when type='external')
 * @param {string} props.title - Title for the sources section (default: "Quellen und Zitate")
 * @param {string} props.className - Additional CSS class
 * @returns {JSX.Element|null} Citation sources display or null if no sources/citations
 */
const CitationSourcesDisplay = ({
  sources = [],
  citations = [],
  additionalSources = [],
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
      const docTitle = source[linkConfig.titleKey] || source.document_title;
      const docUrl = source.url || source[linkConfig.urlKey] || null;

      if (!groupMap.has(docId)) {
        groupMap.set(docId, {
          documentId: docId,
          documentTitle: docTitle,
          url: docUrl,
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
          url: citation.url || null,
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
    
    // Sort citations within each group by index
    groupMap.forEach(group => {
      group.citations.sort((a, b) => a.index - b.index);
    });

    // Sort documents by lowest citation index (so documents appear in order of first citation)
    return Array.from(groupMap.values()).sort((a, b) => {
      const aMinIndex = a.citations.length > 0 ? Math.min(...a.citations.map(c => c.index)) : Infinity;
      const bMinIndex = b.citations.length > 0 ? Math.min(...b.citations.map(c => c.index)) : Infinity;
      return aMinIndex - bMinIndex;
    });
  }, [sources, citations, linkConfig]);

  // Handle document link click
  const handleDocumentClick = useCallback((documentId, url) => {
    if (linkConfig.type === 'vectorDocument' && documentId) {
      // Navigate to the document view page
      navigate(`/documents/${documentId}`);
    } else if (linkConfig.type === 'external' && url) {
      // Open external URL in new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [linkConfig, navigate]);

  if (sources.length === 0 && citations.length === 0 && additionalSources.length === 0) return null;

  const documentGroups = createDocumentGroups();

  // Group additional sources by document (dedupe by document_id)
  const additionalGrouped = additionalSources.reduce((acc, source) => {
    const key = source.document_id || source.document_title;
    if (!acc.has(key)) {
      acc.set(key, {
        document_id: source.document_id,
        document_title: source.document_title,
        url: source.url,
        chunks: [],
        maxScore: source.similarity_score || 0
      });
    }
    const group = acc.get(key);
    group.chunks.push(source.chunk_text);
    group.maxScore = Math.max(group.maxScore, source.similarity_score || 0);
    return acc;
  }, new Map());

  const additionalSourceGroups = Array.from(additionalGrouped.values())
    .sort((a, b) => b.maxScore - a.maxScore);

  return (
    <div className={`ask-sources-section ${className}`}>
      <div className="ask-sources-header">
        <h4 className="ask-sources-title">{title}</h4>
      </div>

      <div className="ask-document-groups">
        {documentGroups.map((group, index) => (
          <div key={group.documentId || group.documentTitle || `doc-${index}`} className="ask-document-group">
            <div className="ask-document-header">
              <h5
                className={`ask-document-title ${linkConfig.type !== 'none' ? 'clickable-link' : ''}`}
                onClick={() => linkConfig.type !== 'none' && (group.documentId || group.url) && handleDocumentClick(group.documentId, group.url)}
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
                    <span className="citation-number">{citation.index}</span>
                    <span className="citation-text">"{citation.cited_text?.replace(/\*\*/g, '') || ''}"</span>
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

            {linkConfig.type !== 'none' && (group.documentId || group.url) && (
              <button
                className="ask-document-link"
                onClick={() => handleDocumentClick(group.documentId, group.url)}
              >
                {linkConfig.type === 'external' ? 'Artikel öffnen →' : 'Dokument öffnen →'}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Additional Sources Section - uncited but relevant sources */}
      {additionalSourceGroups.length > 0 && (
        <details className="ask-additional-sources">
          <summary className="ask-additional-sources-header">
            <span className="ask-additional-sources-title">Weitere Quellen</span>
            <span className="ask-additional-sources-count">({additionalSourceGroups.length})</span>
          </summary>
          <div className="ask-additional-sources-list">
            {additionalSourceGroups.map((source, idx) => (
              <div key={source.document_id || source.document_title || `additional-${idx}`} className="ask-additional-source-item">
                <div className="ask-additional-source-header">
                  <span
                    className={`ask-additional-source-title ${linkConfig.type !== 'none' && (source.document_id || source.url) ? 'clickable-link' : ''}`}
                    onClick={() => linkConfig.type !== 'none' && (source.document_id || source.url) && handleDocumentClick(source.document_id, source.url)}
                  >
                    {source.document_title}
                  </span>
                  {source.maxScore > 0 && (
                    <span className="ask-additional-source-score">
                      {Math.round(source.maxScore * 100)}%
                    </span>
                  )}
                </div>
                {source.chunks[0] && (
                  <p className="ask-additional-source-snippet">
                    {source.chunks[0].slice(0, 150)}...
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

CitationSourcesDisplay.propTypes = {
  sources: PropTypes.array,
  citations: PropTypes.array,
  additionalSources: PropTypes.array,
  linkConfig: PropTypes.shape({
    type: PropTypes.oneOf(['none', 'vectorDocument', 'external']),
    linkKey: PropTypes.string,
    titleKey: PropTypes.string,
    urlKey: PropTypes.string
  }),
  title: PropTypes.string,
  className: PropTypes.string
};

export default CitationSourcesDisplay;