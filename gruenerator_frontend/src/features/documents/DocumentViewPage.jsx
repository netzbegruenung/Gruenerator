import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDocumentsStore } from '../../stores/documentsStore';
import apiClient from '../../components/utils/apiClient';
import ErrorBoundary from '../../components/ErrorBoundary';

// Document Feature CSS - Loaded only when this feature is accessed
import '../../assets/styles/features/documents/document-view.css';

const DocumentViewPage = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDocument = async () => {
      if (!documentId) {
        setError('Keine Dokument-ID angegeben');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await apiClient.get(`/documents/${documentId}/content`);
        const result = response.data;
        
        if (result.success) {
          setDocument(result.data);
        } else {
          throw new Error(result.message || 'Fehler beim Laden des Dokuments');
        }
      } catch (err) {
        console.error('[DocumentViewPage] Error fetching document:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [documentId]);

  const handleGoBack = () => {
    navigate(-1); // Go back to previous page
  };

  if (loading) {
    return (
      <ErrorBoundary>
        <div className="container with-header">
          <div className="document-view-loading">
            <h2>Dokument wird geladen...</h2>
            <p>Bitte warten Sie einen Moment.</p>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary>
        <div className="container with-header">
          <div className="document-view-error">
            <h2>Fehler beim Laden des Dokuments</h2>
            <p>{error}</p>
            <button 
              onClick={handleGoBack}
              className="button-primary"
            >
              Zurück
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (!document) {
    return (
      <ErrorBoundary>
        <div className="container with-header">
          <div className="document-view-error">
            <h2>Dokument nicht gefunden</h2>
            <p>Das angeforderte Dokument konnte nicht gefunden werden.</p>
            <button 
              onClick={handleGoBack}
              className="button-primary"
            >
              Zurück
            </button>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="container with-header">
        <div className="document-view-page">
          <div className="document-view-header">
            <button 
              onClick={handleGoBack}
              className="document-view-back-button"
            >
              ← Zurück
            </button>
            <h1 className="document-view-title">{document.title}</h1>
            <div className="document-view-meta">
              <span className="document-view-filename">Datei: {document.filename}</span>
              <span className="document-view-pages">Seiten: {document.page_count || 'Unbekannt'}</span>
              <span className="document-view-status">Status: {document.status}</span>
              <span className="document-view-date">
                Erstellt: {new Date(document.created_at).toLocaleDateString('de-DE')}
              </span>
            </div>
          </div>

          <div className="document-view-content">
            <h3>Dokumentinhalt</h3>
            {document.ocr_text ? (
              <div className="document-view-text">
                {document.ocr_text}
              </div>
            ) : (
              <div className="document-view-no-content">
                <p>Für dieses Dokument ist noch kein Textinhalt verfügbar.</p>
                {document.status === 'pending' && (
                  <p>Das Dokument wird noch verarbeitet. Bitte versuchen Sie es später erneut.</p>
                )}
                {document.status === 'failed' && (
                  <p>Die Textextraktion für dieses Dokument ist fehlgeschlagen.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default DocumentViewPage;