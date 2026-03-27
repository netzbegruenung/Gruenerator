import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import ErrorBoundary from '../../components/ErrorBoundary';
import apiClient from '../../components/utils/apiClient';
import { useDocumentsStore } from '../../stores/documentsStore';

interface DocumentData {
  title: string;
  filename: string;
  page_count?: number;
  status: string;
  created_at: string;
  ocr_text?: string;
}

const DocumentViewPage = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Ein Fehler ist aufgetreten');
      } finally {
        setLoading(false);
      }
    };

    void fetchDocument();
  }, [documentId]);

  const handleGoBack = () => {
    navigate(-1); // Go back to previous page
  };

  if (loading) {
    return (
      <ErrorBoundary>
        <div className="container with-header">
          <div className="text-center p-2xl bg-background-alt rounded-lg shadow-sm border border-grey-200 dark:border-grey-700">
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
          <div className="text-center p-2xl bg-background-alt rounded-lg shadow-sm border border-grey-200 dark:border-grey-700">
            <h2>Fehler beim Laden des Dokuments</h2>
            <p>{error}</p>
            <button onClick={handleGoBack} className="button-primary">
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
          <div className="text-center p-2xl bg-background-alt rounded-lg shadow-sm border border-grey-200 dark:border-grey-700">
            <h2>Dokument nicht gefunden</h2>
            <p>Das angeforderte Dokument konnte nicht gefunden werden.</p>
            <button onClick={handleGoBack} className="button-primary">
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
        <div className="max-w-[1000px] mx-auto p-lg max-md:p-md max-[480px]:p-sm">
          <div className="mb-lg pb-lg border-b border-grey-200 dark:border-grey-700">
            <button
              onClick={handleGoBack}
              className="bg-none border-none text-[var(--primary)] text-base cursor-pointer p-sm mb-md rounded-lg transition-all duration-200 hover:bg-hover-alt hover:scale-[1.01]"
            >
              ← Zurück
            </button>
            <h1 className="text-[1.8rem] font-semibold text-foreground-heading m-0 mb-md break-words max-md:text-[1.5rem] max-[480px]:text-[1.3rem]">
              {document.title}
            </h1>
            <div className="flex flex-wrap gap-md text-[0.9rem] text-grey-400 max-md:flex-col max-md:gap-sm">
              <span className="bg-background-alt py-xs px-sm rounded-lg border border-grey-200 dark:border-grey-700">
                Datei: {document.filename}
              </span>
              <span className="bg-background-alt py-xs px-sm rounded-lg border border-grey-200 dark:border-grey-700">
                Seiten: {document.page_count || 'Unbekannt'}
              </span>
              <span className="bg-background-alt py-xs px-sm rounded-lg border border-grey-200 dark:border-grey-700">
                Status: {document.status}
              </span>
              <span className="bg-background-alt py-xs px-sm rounded-lg border border-grey-200 dark:border-grey-700">
                Erstellt: {new Date(document.created_at).toLocaleDateString('de-DE')}
              </span>
            </div>
          </div>

          <div className="bg-background-alt p-lg rounded-lg shadow-sm border border-grey-200 dark:border-grey-700 max-md:p-md">
            <h3 className="text-[1.2rem] font-semibold text-foreground-heading m-0 mb-md">
              Dokumentinhalt
            </h3>
            {document.ocr_text ? (
              <div className="bg-background p-lg rounded-lg border border-grey-200 dark:border-grey-700 font-mono text-[0.9rem] leading-relaxed text-foreground whitespace-pre-wrap break-words max-h-[600px] overflow-y-auto max-md:p-md max-md:text-[0.85rem] max-md:max-h-[400px] max-[480px]:text-[0.8rem] max-[480px]:max-h-[300px]">
                {document.ocr_text}
              </div>
            ) : (
              <div className="text-center p-xl text-grey-400 italic [&_p]:m-0 [&_p]:mb-sm">
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
