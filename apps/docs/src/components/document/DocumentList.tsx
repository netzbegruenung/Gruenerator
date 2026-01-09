import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../../stores/documentStore';
import './DocumentList.css';

export const DocumentList = () => {
  const navigate = useNavigate();
  const { documents, isLoading, error, fetchDocuments, createDocument, deleteDocument } = useDocumentStore();

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleCreateDocument = async () => {
    try {
      const newDoc = await createDocument('Neues Dokument');
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
      <button onClick={handleCreateDocument} className="create-document-button">
        + Neues Dokument
      </button>

      {documents.length === 0 ? (
        <div className="document-list-empty">
          Noch keine Dokumente vorhanden. Erstelle dein erstes Dokument!
        </div>
      ) : (
        <div className="document-grid">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => navigate(`/document/${doc.id}`)}
            >
              <div className="document-card-header">
                <h3 className="document-card-title">{doc.title}</h3>
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
          ))}
        </div>
      )}
    </div>
  );
};
