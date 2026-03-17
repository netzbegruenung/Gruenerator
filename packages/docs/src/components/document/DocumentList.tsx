import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useEffect, useMemo, useState } from 'react';
import {
  FiPlus,
  FiFile,
  FiGrid,
  FiMoreVertical,
  FiEdit2,
  FiShare2,
  FiTrash2,
} from 'react-icons/fi';

import { useDocumentStore } from '../../stores/documentStore';
import { useDocsAdapter, createDocsApiClient } from '../../context/DocsContext';
import { templates, type TemplateType, getTemplateContent } from '../../lib/templates';
import { ShareModal } from '../permissions/ShareModal';
import { AIDocumentCreator } from './AIDocumentCreator';
import { TemplateCarousel } from './TemplateCarousel';
import { TemplatePicker } from './TemplatePicker';
import './DocumentList.css';

interface DocumentListProps {
  searchQuery?: string;
}

export const DocumentList = ({ searchQuery }: DocumentListProps) => {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const {
    documents,
    isLoading,
    isGenerating,
    error,
    fetchDocuments,
    createDocument,
    generateDocument,
    deleteDocument,
    updateDocument,
  } = useDocumentStore();
  const [showGallery, setShowGallery] = useState(false);
  const [shareDoc, setShareDoc] = useState<{ id: string; title: string } | null>(null);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery?.trim()) return documents;
    const query = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => doc.title.toLowerCase().includes(query));
  }, [documents, searchQuery]);

  useEffect(() => {
    fetchDocuments(apiClient);
  }, [fetchDocuments, apiClient]);

  const handleTemplateSelect = async (templateType: TemplateType) => {
    setShowGallery(false);
    try {
      const template = templates.find((t) => t.id === templateType);
      const title = template?.defaultTitle || 'Neues Dokument';
      const newDoc = await createDocument(apiClient, title, null, templateType);
      adapter.navigateToDocument(newDoc.id);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  const handleAIGenerate = async (description: string) => {
    try {
      const newDoc = await generateDocument(apiClient, description);
      adapter.navigateToDocument(newDoc.id);
    } catch (error) {
      console.error('Failed to generate document:', error);
    }
  };

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Dokument wirklich löschen?')) {
      try {
        await deleteDocument(apiClient, id);
      } catch (error) {
        console.error('Failed to delete document:', error);
      }
    }
  };

  const handleRenameDocument = async (doc: { id: string; title: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTitle = window.prompt('Neuer Titel:', doc.title);
    console.log(
      '[docs-rename] DocumentList prompt result: docId=%s, oldTitle="%s", newTitle=%o',
      doc.id,
      doc.title,
      newTitle
    );
    if (newTitle && newTitle.trim() && newTitle.trim() !== doc.title) {
      try {
        await updateDocument(apiClient, doc.id, { title: newTitle.trim() });
        console.log('[docs-rename] DocumentList rename success: docId=%s', doc.id);
      } catch (error) {
        console.error(
          '[docs-rename] DocumentList rename failed: docId=%s, error=%o',
          doc.id,
          error
        );
      }
    } else {
      console.log('[docs-rename] DocumentList rename skipped: cancelled or unchanged');
    }
  };

  if (isLoading) {
    return <div className="document-list-loading">Lädt...</div>;
  }

  if (error) {
    return <div className="document-list-error">{error}</div>;
  }

  return (
    <div className="document-list">
      {/* Desktop: AI creator + template carousel */}
      <div className="desktop-only-templates">
        {/* <AIDocumentCreator onGenerate={handleAIGenerate} isLoading={isGenerating} /> */}
        <TemplateCarousel
          onTemplateSelect={handleTemplateSelect}
          onShowGallery={() => setShowGallery(true)}
        />
      </div>

      {documents.length === 0 ? (
        <div className="document-list-empty">
          Noch keine Dokumente vorhanden. Erstelle dein erstes Dokument!
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="document-list-empty">Keine Dokumente gefunden.</div>
      ) : (
        <div className="document-grid">
          {filteredDocuments.map((doc) => {
            const template = templates.find((t) => t.id === doc.document_subtype);
            const emoji = template?.icon || '📄';
            const templateHtml = getTemplateContent(doc.document_subtype);
            const previewHtml = doc.content?.trim()
              ? /^<[a-z]/i.test(doc.content.trim())
                ? doc.content
                : `<p>${doc.content}</p>`
              : templateHtml;

            return (
              <div
                key={doc.id}
                className="document-card"
                onClick={() => adapter.navigateToDocument(doc.id)}
              >
                {previewHtml ? (
                  <div className="document-card-preview document-card-preview-miniature">
                    <div
                      className="document-card-preview-page"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                ) : (
                  <div className="document-card-preview document-card-preview-empty">
                    <span>{emoji}</span>
                  </div>
                )}

                <div className="document-card-footer">
                  <div className="document-card-header">
                    <h3 className="document-card-title">
                      <span className="document-card-emoji">{emoji}</span>
                      {doc.title}
                    </h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="document-card-menu"
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          aria-label="Dokumentoptionen"
                        >
                          <FiMoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onClick={(e: React.MouseEvent) => handleRenameDocument(doc, e)}
                        >
                          <FiEdit2 size={14} />
                          Umbenennen
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setShareDoc({ id: doc.id, title: doc.title });
                          }}
                        >
                          <FiShare2 size={14} />
                          Teilen
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e: React.MouseEvent) => handleDeleteDocument(doc.id, e)}
                        >
                          <FiTrash2 size={14} />
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="document-card-meta">
                    <span>
                      {new Date(doc.updated_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })}
                    </span>
                    {doc.access_type && doc.access_type !== 'owner' && (
                      <span className="document-card-sharing">
                        {doc.creator_name ? `Von ${doc.creator_name}` : 'Geteilt'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile: floating action button */}
      <div className="mobile-fab-container">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="lg"
              className="mobile-fab h-[52px] w-[52px] rounded-full bg-[#5F8575] hover:bg-[#5F8575]/90"
              aria-label="Neues Dokument erstellen"
            >
              <FiPlus size={24} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" sideOffset={8}>
            <DropdownMenuLabel>Neues Dokument</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleTemplateSelect('blank')}>
              <FiFile size={16} />
              Leeres Dokument
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowGallery(true)}>
              <FiGrid size={16} />
              Aus Vorlage...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {showGallery && (
        <TemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowGallery(false)} />
      )}

      {shareDoc && (
        <ShareModal
          documentId={shareDoc.id}
          documentTitle={shareDoc.title}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
};
