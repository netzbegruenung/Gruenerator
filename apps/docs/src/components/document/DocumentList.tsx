import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { templates, type TemplateType, getTemplateContent } from '../../lib/templates';
import { useDocumentStore } from '../../stores/documentStore';

import { TemplateCarousel } from './TemplateCarousel';
import { TemplatePicker } from './TemplatePicker';
import './DocumentList.css';

export const DocumentList = () => {
  const navigate = useNavigate();
  const { documents, isLoading, error, fetchDocuments, createDocument, deleteDocument } =
    useDocumentStore();
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleTemplateSelect = async (templateType: TemplateType) => {
    setShowGallery(false);
    try {
      const template = templates.find((t) => t.id === templateType);
      const title = template?.defaultTitle || 'Neues Dokument';
      const newDoc = await createDocument(title, null, templateType);
      navigate(`/document/${newDoc.id}`);
    } catch (error) {
      console.error('Failed to create document:', error);
    }
  };

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Dokument wirklich löschen?')) {
      try {
        await deleteDocument(id);
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
      <TemplateCarousel
        onTemplateSelect={handleTemplateSelect}
        onShowGallery={() => setShowGallery(true)}
      />

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
                onClick={() => navigate(`/document/${doc.id}`)}
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

      {showGallery && (
        <TemplatePicker onSelect={handleTemplateSelect} onClose={() => setShowGallery(false)} />
      )}
    </div>
  );
};
