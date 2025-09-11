import React, { lazy, Suspense } from 'react';
import { motion } from 'motion/react';
import { formatDate } from '../utils/documentOverviewUtils';

const ReactMarkdown = lazy(() => import('react-markdown'));

const DocumentPreviewModal = ({ item, itemType = 'document', documentTypes = {}, onClose }) => {
  if (!item) return null;

  const itemTitle = itemType === 'qa' ? item.name : item.title;
  const previewContent =
    itemType === 'qa'
      ? item.description || item.custom_prompt || 'Keine Beschreibung verfügbar'
      : item.full_content || item.content_preview || item.ocr_text || 'Kein Inhalt verfügbar';

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
            {item.markdown_content ? (
              <div className="antrag-text-content">
                <Suspense fallback={<div>Loading...</div>}>
                  <ReactMarkdown>{item.markdown_content}</ReactMarkdown>
                </Suspense>
              </div>
            ) : (
              previewContent
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DocumentPreviewModal;

