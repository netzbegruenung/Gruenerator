import React, { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { formatDate } from '../utils/documentOverviewUtils';

// Import markdown styles for consistent rendering
import '../../assets/styles/pages/AntragDetailPage.css';

const ReactMarkdown = lazy(() => import('react-markdown'));

const DocumentPreviewModal = ({ item, itemType = 'document', documentTypes = {}, onClose }) => {
  if (!item) return null;

  const itemTitle = itemType === 'qa' ? item.name : item.title;
  
  // Enhanced content priority for optimal markdown rendering from Mistral OCR
  const getDocumentContent = () => {
    if (itemType === 'qa') {
      return item.description || item.custom_prompt || 'Keine Beschreibung verfügbar';
    }
    
    // Prioritize markdown content from Mistral OCR, then fallback to other content
    return item.markdown_content || item.full_content || item.content_preview || item.ocr_text || 'Kein Inhalt verfügbar';
  };
  
  const previewContent = getDocumentContent();
  const isMarkdownContent = !!item.markdown_content;

  return (
    <motion.div
      className="document-preview-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="document-preview-modal"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="document-preview-header">
          <h3>{itemTitle}</h3>
          <button className="document-preview-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="document-preview-content">
          <div className="document-preview-meta">
            {itemType === 'qa' ? (
              <>
                {item.document_count && <span>Dokumente: {item.document_count}</span>}
                {item.is_public && <span>Öffentlich</span>}
                {item.view_count && <span>Aufrufe: {item.view_count}</span>}
                {item.created_at && <span>Erstellt: {formatDate(item.created_at)}</span>}
              </>
            ) : (
              <>
                {item.type && <span>Typ: {documentTypes[item.type] || item.type}</span>}
                {item.word_count && <span>Wörter: {item.word_count}</span>}
                {item.created_at && <span>Erstellt: {formatDate(item.created_at)}</span>}
                {item.updated_at && <span>Geändert: {formatDate(item.updated_at)}</span>}
              </>
            )}
          </div>
          <div className="document-preview-text">
            {isMarkdownContent ? (
              <div className="markdown-content">
                <Suspense fallback={<div>Loading markdown...</div>}>
                  <ReactMarkdown>{previewContent}</ReactMarkdown>
                </Suspense>
              </div>
            ) : (
              <div className="plain-text-content" style={{ whiteSpace: 'pre-wrap' }}>
                {previewContent}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DocumentPreviewModal;

