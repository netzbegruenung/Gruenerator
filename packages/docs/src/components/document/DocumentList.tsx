import { Menu, ActionIcon } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { FiPlus, FiFile, FiGrid } from 'react-icons/fi';

import { useDocumentStore } from '../../stores/documentStore';
import { useDocsAdapter, createDocsApiClient } from '../../context/DocsContext';
import { templates, type TemplateType, getTemplateContent } from '../../lib/templates';
import { TemplateCarousel } from './TemplateCarousel';
import { TemplatePicker } from './TemplatePicker';
import './DocumentList.css';

export const DocumentList = () => {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const { documents, isLoading, error, fetchDocuments, createDocument, deleteDocument } =
    useDocumentStore();
  const [showGallery, setShowGallery] = useState(false);

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

  if (isLoading) {
    return <div className="document-list-loading">Lädt...</div>;
  }

  if (error) {
    return <div className="document-list-error">{error}</div>;
  }

  return (
    <div className="document-list">
      {/* Desktop: full template carousel */}
      <div className="desktop-only-templates">
        <TemplateCarousel
          onTemplateSelect={handleTemplateSelect}
          onShowGallery={() => setShowGallery(true)}
        />
      </div>

      {documents.length === 0 ? (
        <div className="document-list-empty">
          Noch keine Dokumente vorhanden. Erstelle dein erstes Dokument!
        </div>
      ) : (
        <div className="document-grid">
          {documents.map((doc) => {
            const template = templates.find((t) => t.id === doc.document_subtype);
            const emoji = template?.icon || '📄';
            const templateHtml = getTemplateContent(doc.document_subtype);

            return (
              <div
                key={doc.id}
                className="document-card"
                onClick={() => adapter.navigateToDocument(doc.id)}
              >
                {templateHtml ? (
                  <div className="document-card-preview document-card-preview-miniature">
                    <div
                      className="document-card-preview-page"
                      dangerouslySetInnerHTML={{
                        __html: doc.content ? `<p>${doc.content}</p>` : templateHtml,
                      }}
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
                    <button
                      onClick={(e) => handleDeleteDocument(doc.id, e)}
                      className="document-card-delete"
                      aria-label="Löschen"
                    >
                      ×
                    </button>
                  </div>
                  <div className="document-card-meta">
                    {new Date(doc.updated_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile: floating action button */}
      <div className="mobile-fab-container">
        <Menu position="top-end" shadow="lg" withArrow offset={8}>
          <Menu.Target>
            <ActionIcon
              size={52}
              radius="xl"
              variant="filled"
              className="mobile-fab"
              aria-label="Neues Dokument erstellen"
              style={{ backgroundColor: '#5F8575' }}
            >
              <FiPlus size={24} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Neues Dokument</Menu.Label>
            <Menu.Item
              leftSection={<FiFile size={16} />}
              onClick={() => handleTemplateSelect('blank')}
            >
              Leeres Dokument
            </Menu.Item>
            <Menu.Item leftSection={<FiGrid size={16} />} onClick={() => setShowGallery(true)}>
              Aus Vorlage...
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      {showGallery && (
        <TemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowGallery(false)} />
      )}
    </div>
  );
};
