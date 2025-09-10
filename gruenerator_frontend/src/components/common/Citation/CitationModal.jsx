import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useCitationStore from '../../../stores/citationStore';

// Citation Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/components/citation.css';

/**
 * CitationModal component - shows full citation details
 * @returns {JSX.Element|null} Citation modal or null if not open
 */
const CitationModal = () => {
  const navigate = useNavigate();
  const modalRef = useRef(null);
  const { selectedCitation, closeCitationModal } = useCitationStore();

  if (!selectedCitation) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      closeCitationModal();
    }
  };

  const handleViewDocument = () => {
    if (selectedCitation.document_id) {
      navigate(`/documents/${selectedCitation.document_id}`);
      closeCitationModal();
    }
  };

  return (
    <div className="citation-modal-overlay" onClick={handleOverlayClick}>
      <div className="citation-modal" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="citation-modal-header">
          <h4>Zitat [{selectedCitation.index}]</h4>
          <button 
            className="citation-modal-close" 
            onClick={closeCitationModal}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
        <div className="citation-modal-content">
          <div className="citation-text">
            "{selectedCitation.cited_text}"
          </div>
          <div className="citation-source">
            <strong>Quelle:</strong> {selectedCitation.document_title}
          </div>
          {selectedCitation.similarity_score && (
            <div className="citation-relevance">
              <strong>Relevanz:</strong> {Math.round(selectedCitation.similarity_score * 100)}%
            </div>
          )}
          {selectedCitation.document_id && (
            <div className="citation-actions">
              <button 
                className="citation-view-document"
                onClick={handleViewDocument}
              >
                Dokument anzeigen →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CitationModal;