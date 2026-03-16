import React, { useState, useEffect, useRef, type FC, type ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';

import { Markdown } from '../../../components/common/Markdown';
import apiClient from '../../../components/utils/apiClient';
import { useOptimizedAuth } from '../../../hooks/useAuth';

interface AntragData {
  id: string;
  title: string;
  description?: string;
  antragstext?: string;
  antragsteller?: string;
  kontakt_email?: string;
  tags?: string[];
  categories?: string[];
  updated_at?: string;
  created_at?: string;
  user_id?: string;
  status?: string;
  is_private?: boolean;
  is_example?: boolean;
}

// Hilfsfunktionen (ähnlich wie in AntragDetailView)
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '–';
  return new Date(dateString).toLocaleString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const getStatusClass = (status: string | undefined): string => {
  const statusLower = status?.toLowerCase() || 'unbekannt';
  // Statusklassen bleiben gleich, da sie in der neuen CSS wiederverwendet werden
  switch (statusLower) {
    case 'angenommen':
      return 'status-angenommen';
    case 'in bearbeitung':
      return 'status-in-bearbeitung';
    case 'abgelehnt':
      return 'status-abgelehnt';
    case 'neu':
      return 'status-neu';
    default:
      return 'status-unbekannt';
  }
};

const AntragDetailPage: FC = () => {
  const { antragId } = useParams<{ antragId: string }>();
  const [antrag, setAntrag] = useState<AntragData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user: supabaseUser } = useOptimizedAuth();

  // State for editing mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedAntrag, setEditedAntrag] = useState<AntragData | null>(null);

  useEffect(() => {
    const fetchAntrag = async () => {
      setLoading(true);
      setError(null);
      console.log(`[AntragDetailPage] Fetching antrag with ID: ${antragId}`);

      if (!antragId) {
        setError('Keine Antrags-ID angegeben.');
        setLoading(false);
        return;
      }

      try {
        const response = await apiClient.get(`/auth/antraege/${antragId}`);
        const data = response.data as { antrag?: AntragData };
        const antragData = data.antrag || (data as unknown as AntragData);

        if (!antragData) {
          throw new Error('Antrag nicht gefunden.');
        }

        console.log('[AntragDetailPage] Antrag erfolgreich geladen:', antragData);
        setAntrag(antragData);
        setEditedAntrag(antragData);
      } catch (err) {
        console.error('[AntragDetailPage] Fehler beim Laden des Antrags:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setError(`Fehler beim Laden des Antrags: ${errorMessage}`);
        setAntrag(null); // Stelle sicher, dass kein alter Antrag angezeigt wird
      } finally {
        setLoading(false);
      }
    };

    fetchAntrag();
  }, [antragId]); // Abhängigkeit von antragId

  // --- Edit Handler ---
  const handleEditClick = () => {
    setIsEditing(true);
    setEditedAntrag(antrag);
  };

  const handleCancelClick = () => {
    setIsEditing(false);
    setEditedAntrag(antrag);
  };

  const handleSaveClick = async (): Promise<void> => {
    if (!editedAntrag || !supabaseUser) return;

    setLoading(true);
    setError(null);

    try {
      const updateData = {
        title: editedAntrag.title,
        description: editedAntrag.description,
        antragstext: editedAntrag.antragstext,
        antragsteller: editedAntrag.antragsteller,
        kontakt_email: editedAntrag.kontakt_email,
      };

      const response = await apiClient.put(`/auth/antraege/${antragId}`, updateData);
      const result = response.data as { antrag?: AntragData };
      setAntrag(result.antrag || editedAntrag);
      setIsEditing(false);
      console.log('[AntragDetailPage] Antrag erfolgreich aktualisiert.');
    } catch (err) {
      console.error('[AntragDetailPage] Fehler beim Speichern des Antrags:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setError(`Fehler beim Speichern: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void => {
    const { name, value } = event.target;
    setEditedAntrag((prev) => (prev ? { ...prev, [name]: value } : null));
  };

  const handleMarkdownChange = (markdown: string): void => {
    setEditedAntrag((prev) => (prev ? { ...prev, antragstext: markdown } : null));
  };

  // --- Render Logic ---

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[300px] gap-md max-w-[960px] w-full text-foreground">
        <p>Antrag wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[300px] gap-md max-w-[960px] w-full text-foreground">
        <h2 className="text-red-600 m-0">Fehler</h2>
        <p>{error}</p>
        <Link to="/datenbank/antraege" className="text-[var(--link-color)] underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  if (!antrag) {
    return (
      <div className="flex flex-col items-center justify-center text-center min-h-[300px] gap-md max-w-[960px] w-full text-foreground">
        <h2 className="text-red-600 m-0">Antrag nicht gefunden</h2>
        <p>Der angeforderte Antrag konnte nicht gefunden werden.</p>
        <Link to="/datenbank/antraege" className="text-[var(--link-color)] underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  // --- Edit Button Logic ---
  const canEdit = supabaseUser && antrag && supabaseUser.id === antrag.user_id;

  // --- Render View or Edit Mode ---
  return (
    <div className="py-xl px-md bg-background min-h-[calc(100vh-var(--header-height,60px)-var(--footer-height,60px))] flex justify-center max-md:py-lg max-md:px-sm">
      <div className="max-w-[960px] w-full text-foreground">
        {/* Conditional Edit/Cancel/Save buttons */}
        <div className="flex justify-end gap-md mb-lg max-md:flex-col max-md:gap-sm [&_button]:max-md:w-full">
          {canEdit && !isEditing && (
            <button onClick={handleEditClick} className="button button-primary">
              Bearbeiten
            </button>
          )}
        </div>

        {/* --- Content Area (Conditional Rendering) --- */}
        {!isEditing ? (
          <>
            {/* 1. Header Section */}
            <header className="flex justify-between items-start gap-lg mb-sm pb-0 max-md:flex-col max-md:items-start max-md:gap-md max-md:border-b-0 max-md:mb-lg">
              <div className="flex flex-col grow min-w-0 mb-xl mt-xl">
                <h1 className="m-0 text-foreground-heading leading-[1.2] break-words relative pb-sm after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-[80px] after:h-[4px] after:bg-[var(--klee)] after:rounded-[2px]">
                  {antrag.title || 'Unbenannter Antrag'}
                </h1>
              </div>
            </header>
            {/* 2. Tags Section (Moved here) */}
            {antrag.tags && antrag.tags.length > 0 && (
              <div className="mb-xl">
                <div className="flex flex-wrap gap-xs">
                  {antrag.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block py-xxs px-sm bg-background-alt border border-grey-200 dark:border-grey-700 rounded-[4px] text-[0.9em] text-foreground whitespace-nowrap"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {/* 3. Main Info Wrapper (Description & Meta side-by-side on Desktop) */}
            <div className="flex flex-col gap-lg mb-xl lg:flex-row lg:items-stretch lg:gap-xl">
              {antrag.description && (
                <div className="p-md bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700 lg:flex-[1_1_40%] lg:min-w-[300px]">
                  <p className="m-0 text-[0.95em] leading-relaxed text-foreground">
                    {antrag.description}
                  </p>
                </div>
              )}

              {/* Meta Info Section */}
              <section className="p-md bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-lg lg:flex-[1_1_60%] lg:min-w-[350px] max-md:grid-cols-1 max-md:gap-md max-md:mb-lg">
                {/* Meta items */}
                <div className="flex flex-col gap-xxs">
                  <span className="font-semibold text-foreground text-[0.85em] opacity-80 uppercase tracking-[0.5px]">
                    Zuletzt aktualisiert:
                  </span>
                  <span className="text-foreground break-words leading-[1.4] text-[0.95em]">
                    {formatDate(antrag.updated_at)}
                  </span>
                </div>

                {/* Combined Antragsteller & Kontakt */}
                {(antrag.antragsteller || antrag.kontakt_email) && (
                  <div className="flex flex-col gap-xxs">
                    {antrag.antragsteller && (
                      <span className="font-semibold text-foreground text-[0.85em] opacity-80 uppercase tracking-[0.5px]">
                        Antragsteller*in:
                      </span>
                    )}

                    <span className="text-foreground break-words leading-[1.4] text-[0.95em]">
                      {antrag.antragsteller}
                      {antrag.antragsteller && antrag.kontakt_email && ', '}
                      {antrag.kontakt_email && (
                        <a
                          href={`mailto:${antrag.kontakt_email}`}
                          className="text-[var(--link-color)] underline"
                        >
                          {antrag.kontakt_email}
                        </a>
                      )}
                    </span>
                  </div>
                )}
              </section>
            </div>{' '}
            {/* End of main-info */}
            {/* 4. Content Section (Antragstext) */}
            <section className="mb-2xl max-w-[75ch] mx-auto">
              {/* <h2>Antragstext</h2> */}
              <div className="markdown-content">
                {antrag.antragstext ? (
                  <Markdown>{antrag.antragstext}</Markdown>
                ) : (
                  <p>
                    <em>Kein Antragstext vorhanden.</em>
                  </p>
                )}
              </div>
            </section>
          </>
        ) : (
          /* --- Edit Mode --- */
          <div>
            <p>Edit functionality has been removed.</p>
            <button onClick={handleCancelClick} className="button button-secondary">
              Cancel
            </button>
          </div>
        )}

        {/* Optional: Link zurück zur Übersicht */}
        <div className="mt-2xl pt-lg border-t border-grey-200 dark:border-grey-700 text-center">
          <Link
            to="/datenbank/antraege"
            className="text-[var(--link-color)] no-underline font-medium transition-colors duration-200 hover:underline"
          >
            &larr; Zurück zur Antragsübersicht
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AntragDetailPage;
