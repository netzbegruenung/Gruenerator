import { motion } from 'motion/react';
import React from 'react';

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

const DocumentPreviewModal = ({
  item,
  itemType = 'document',
  documentTypes = {},
  onClose,
}: DocumentPreviewModalProps) => {
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
      return (
        document.markdown_content ||
        document.full_content ||
        document.content_preview ||
        document.ocr_text ||
        'Kein Inhalt verfügbar'
      );
    }
    return 'Kein Inhalt verfügbar';
  };

  const previewContent = getDocumentContent();
  const isMarkdownContent = !isNotebook;

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-md backdrop-blur-[4px] max-md:p-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-background rounded-2xl shadow-xl max-w-[800px] max-h-[90vh] w-full flex flex-col overflow-hidden max-md:mx-sm max-md:max-h-[calc(100vh-var(--spacing-md))]"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-lg py-md border-b border-grey-200 dark:border-grey-700 bg-grey-50 dark:bg-grey-800">
          <h3 className="m-0 text-foreground-heading text-[1.2rem] font-semibold flex-1 min-w-0 break-words">
            {itemTitle}
          </h3>
          <button
            className="bg-transparent border-none text-2xl cursor-pointer text-grey-500 dark:text-grey-400 p-xs rounded-lg leading-none transition-all duration-200 min-w-[36px] h-9 flex items-center justify-center hover:bg-hover-alt hover:text-foreground"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="p-lg overflow-y-auto flex-1">
          <div className="flex flex-wrap gap-md mb-md pb-md border-b border-grey-200 dark:border-grey-700 text-[0.9rem] text-grey-500 dark:text-grey-400">
            {isNotebook && notebook ? (
              <>
                {notebook.document_count !== undefined && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Dokumente: {notebook.document_count}
                  </span>
                )}
                {notebook.is_public && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Öffentlich
                  </span>
                )}
                {notebook.view_count !== undefined && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Aufrufe: {notebook.view_count}
                  </span>
                )}
                {notebook.created_at && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Erstellt: {formatDate(notebook.created_at)}
                  </span>
                )}
              </>
            ) : document ? (
              <>
                {document.type && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Typ: {documentTypes[document.type] || document.type}
                  </span>
                )}
                {document.word_count !== undefined && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Wörter: {document.word_count}
                  </span>
                )}
                {document.created_at && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Erstellt: {formatDate(document.created_at)}
                  </span>
                )}
                {document.updated_at && (
                  <span className="bg-grey-50 dark:bg-grey-800 px-sm py-xs rounded-lg">
                    Geändert: {formatDate(document.updated_at)}
                  </span>
                )}
              </>
            ) : null}
          </div>
          <div
            className={
              isMarkdownContent
                ? 'markdown-content'
                : 'text-foreground leading-relaxed whitespace-pre-wrap break-words'
            }
          >
            {isMarkdownContent ? (
              <Markdown fallback={<div>Loading markdown...</div>}>{previewContent}</Markdown>
            ) : (
              <div className="whitespace-pre-wrap" style={{ whiteSpace: 'pre-wrap' }}>
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
