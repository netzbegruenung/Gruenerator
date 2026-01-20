import React from 'react';
import { motion } from 'motion/react';
import { formatDate } from '../utils/documentOverviewUtils';
import { Markdown } from './Markdown';

import '../../assets/styles/pages/AntragDetailPage.css';
import '../../assets/styles/common/markdown-styles.css';

interface DocumentItem {
  title?: string;
  type?: string;
  word_count?: number;
  created_at?: string;
  updated_at?: string;
  markdown_content?: string;
  full_content?: string;
  content_preview?: string;
  ocr_text?: string;
}

interface NotebookItem {
  name?: string;
  description?: string;
  custom_prompt?: string;
  document_count?: number;
  is_public?: boolean;
  view_count?: number;
  created_at?: string;
}

type PreviewItem = DocumentItem | NotebookItem;

interface DocumentPreviewModalProps {
  item: PreviewItem | null;
  itemType?: 'document' | 'notebook';
  documentTypes?: Record<string, string>;
  onClose: () => void;
}

const DocumentPreviewModal = ({ item, itemType = 'document', documentTypes = {}, onClose }: DocumentPreviewModalProps) => {
  if (!item) return null;

  const isNotebook = itemType === 'notebook';
  const notebook = isNotebook ? (item as NotebookItem) : null;
  const document = !isNotebook ? (item as DocumentItem) : null;

  const itemTitle = isNotebook ? notebook?.name : document?.title;

  const getDocumentContent = (): string => {
    if (isNotebook && notebook) {
      return notebook.description || notebook.custom_prompt || 'Keine Beschreibung verfügbar';
    }
    if (document) {
      return document.markdown_content || document.full_content || document.content_preview || document.ocr_text || 'Kein Inhalt verfügbar';
    }
    return 'Kein Inhalt verfügbar';
  };

  const previewContent = getDocumentContent();
  const isMarkdownContent = !isNotebook;

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
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="document-preview-header">
          <h3>{itemTitle}</h3>
          <button className="document-preview-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="document-preview-content">
          <div className="document-preview-meta">
            {isNotebook && notebook ? (
              <>
                {notebook.document_count !== undefined && <span>Dokumente: {notebook.document_count}</span>}
                {notebook.is_public && <span>Öffentlich</span>}
                {notebook.view_count !== undefined && <span>Aufrufe: {notebook.view_count}</span>}
                {notebook.created_at && <span>Erstellt: {formatDate(notebook.created_at)}</span>}
              </>
            ) : document ? (
              <>
                {document.type && <span>Typ: {documentTypes[document.type] || document.type}</span>}
                {document.word_count !== undefined && <span>Wörter: {document.word_count}</span>}
                {document.created_at && <span>Erstellt: {formatDate(document.created_at)}</span>}
                {document.updated_at && <span>Geändert: {formatDate(document.updated_at)}</span>}
              </>
            ) : null}
          </div>
          <div className={isMarkdownContent ? "markdown-content" : "document-preview-text"}>
            {isMarkdownContent ? (
              <Markdown fallback={<div>Loading markdown...</div>}>{previewContent}</Markdown>
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

