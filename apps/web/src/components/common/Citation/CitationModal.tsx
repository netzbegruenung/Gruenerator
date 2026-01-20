import { useRef, useEffect, JSX, MouseEvent } from 'react';
import useCitationStore from '../../../stores/citationStore';
import { Markdown } from '../Markdown';

import '../../../assets/styles/components/citation.css';
import '../../../assets/styles/common/markdown-styles.css';

const CitationModal = (): JSX.Element | null => {
  const modalRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);

  const {
    selectedCitation,
    closeCitationModal,
    contextData,
    isLoadingContext,
    contextError,
    getNavigationUrl,
    canNavigate
  } = useCitationStore();

  useEffect(() => {
    if (contextData && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contextData]);

  if (!selectedCitation) return null;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      closeCitationModal();
    }
  };

  // Always open in new tab for consistent UX
  const handleViewDocument = () => {
    if (!selectedCitation) return;

    const navResult = getNavigationUrl(selectedCitation);
    if (navResult) {
      window.open(navResult.url, '_blank', 'noopener,noreferrer');
      closeCitationModal();
    }
  };

  // Get navigation info for button label
  const getNavInfo = () => {
    if (!selectedCitation) return null;
    return getNavigationUrl(selectedCitation);
  };

  const renderContextView = () => {
    if (isLoadingContext) {
      return (
        <div className="citation-loading">
          <span className="citation-loading-spinner" />
          <span>Kontext wird geladen...</span>
        </div>
      );
    }

    if (contextError) {
      return (
        <div className="citation-text">
          &ldquo;{selectedCitation.cited_text}&rdquo;
        </div>
      );
    }

    if (contextData && contextData.contextChunks && contextData.contextChunks.length > 0) {
      return (
        <div className="citation-context-view markdown-content">
          {contextData.contextChunks.map((chunk, idx) => (
            <span
              key={`chunk-${chunk.chunkIndex}-${idx}`}
              ref={chunk.isCenter ? highlightRef : null}
              className={chunk.isCenter ? 'citation-highlight' : 'citation-context-chunk'}
            >
              <Markdown>{chunk.text}</Markdown>{' '}
            </span>
          ))}
        </div>
      );
    }

    return (
      <div className="citation-text markdown-content">
        &ldquo;<Markdown>{selectedCitation.cited_text || ''}</Markdown>&rdquo;
      </div>
    );
  };

  const getButtonLabel = () => {
    const navInfo = getNavInfo();
    if (!navInfo) return 'Öffnen →';
    return navInfo.isExternal ? 'Quelle öffnen →' : 'Dokument öffnen →';
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
          {renderContextView()}
        </div>
        <div className="citation-modal-footer">
          <div className="citation-meta">
            <span className="citation-source">{selectedCitation.document_title}</span>
            {selectedCitation.similarity_score && (
              <span className="citation-relevance">{Math.round(Number(selectedCitation.similarity_score) * 100)}%</span>
            )}
          </div>
          {canNavigate() && (
            <button className="citation-view-document" onClick={handleViewDocument}>
              {getButtonLabel()}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CitationModal;
