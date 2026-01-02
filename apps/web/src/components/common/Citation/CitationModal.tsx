import React, { useRef, JSX, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import useCitationStore from '../../../stores/citationStore';

// Citation Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/components/citation.css';

interface SelectedCitation {
  index?: number;
  cited_text?: string;
  document_title?: string;
  similarity_score?: number;
  document_id?: string;
  [key: string]: unknown;
}

/**
 * CitationModal component - shows full citation details
 * @returns {JSX.Element|null} Citation modal or null if not open
 */
const CitationModal = (): JSX.Element | null => {
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);
  const { selectedCitation, closeCitationModal } = useCitationStore();

  if (!selectedCitation) return null;

  // Cast to our expected type
  const citation = selectedCitation as SelectedCitation;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeCitationModal();
    }
  };

  const handleViewDocument = () => {
    if (citation.document_id) {
      navigate(`/documents/${citation.document_id}`);
      closeCitationModal();
    }
  };

  return (
    <div className="citation-modal-overlay" onClick={handleOverlayClick}>
      <div className="citation-modal" ref={modalRef} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className="citation-modal-header">
          <h4>Zitat [{citation.index}]</h4>
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
            &ldquo;{citation.cited_text}&rdquo;
          </div>
          <div className="citation-source">
            <strong>Quelle:</strong> {citation.document_title}
          </div>
          {citation.similarity_score && (
            <div className="citation-relevance">
              <strong>Relevanz:</strong> {Math.round(citation.similarity_score * 100)}%
            </div>
          )}
          {citation.document_id && (
            <div className="citation-actions">
              <button
                className="citation-view-document"
                onClick={handleViewDocument}
              >
                Dokument anzeigen &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CitationModal;
