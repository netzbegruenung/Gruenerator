import React, { useState, useEffect, useRef, FC, ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Markdown } from '../../../components/common/Markdown';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import apiClient from '../../../components/utils/apiClient';

// Antrag Detail Feature CSS - Loaded only when this feature is accessed
import '../../../assets/styles/pages/AntragDetailPage.css';

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
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
};

const getStatusClass = (status: string | undefined): string => {
  const statusLower = status?.toLowerCase() || 'unbekannt';
  // Statusklassen bleiben gleich, da sie in der neuen CSS wiederverwendet werden
  switch (statusLower) {
    case 'angenommen': return 'status-angenommen';
    case 'in bearbeitung': return 'status-in-bearbeitung';
    case 'abgelehnt': return 'status-abgelehnt';
    case 'neu': return 'status-neu';
    default: return 'status-unbekannt';
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

        console.log("[AntragDetailPage] Antrag erfolgreich geladen:", antragData);
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
      console.log("[AntragDetailPage] Antrag erfolgreich aktualisiert.");

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
    setEditedAntrag(prev => prev ? { ...prev, [name]: value } : null);
  };

  const handleMarkdownChange = (markdown: string): void => {
    setEditedAntrag(prev => prev ? { ...prev, antragstext: markdown } : null);
  };

  // --- Render Logic ---

  if (loading) {
    return (
      <div className="antrag-detail-page-container antrag-detail-loading">
        <p>Antrag wird geladen...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="antrag-detail-page-container antrag-detail-error">
        <h2>Fehler</h2>
        <p>{error}</p>
        <Link to="/datenbank/antraege">Zurück zur Übersicht</Link>
      </div>
    );
  }

  if (!antrag) {
    return (
       <div className="antrag-detail-page-container antrag-detail-error">
         <h2>Antrag nicht gefunden</h2>
         <p>Der angeforderte Antrag konnte nicht gefunden werden.</p>
         <Link to="/datenbank/antraege">Zurück zur Übersicht</Link>
       </div>
    );
  }

  // --- Edit Button Logic ---
  const canEdit = supabaseUser && antrag && supabaseUser.id === antrag.user_id;

  // --- Render View or Edit Mode ---
  return (
    <div className="antrag-detail-page-wrapper">
      <div className="antrag-detail-page-container">

        {/* Conditional Edit/Cancel/Save buttons */}
        <div className="antrag-detail-actions">
          {canEdit && !isEditing && (
            <button onClick={handleEditClick} className="button button-primary">Bearbeiten</button>
          )}
        </div>

        {/* --- Content Area (Conditional Rendering) --- */}
        {!isEditing ? (
          <>
            {/* 1. Header Section */}
            <header className="antrag-detail-page-header">
              <div className="header-content">
                <h1>{antrag.title || 'Unbenannter Antrag'}</h1>
              </div>
            </header>

            {/* 2. Tags Section (Moved here) */}
            {antrag.tags && antrag.tags.length > 0 && (
              <div className="antrag-detail-page-tags">
                <div className="tags-list">
                  {antrag.tags.map(tag => (
                    <span key={tag} className="tag-chip">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Main Info Wrapper (Description & Meta side-by-side on Desktop) */}
            <div className="antrag-detail-main-info">

                {antrag.description && (
                  <div className="antrag-detail-description-box">
                    <p>{antrag.description}</p>
                  </div>
                )}

                {/* Meta Info Section */}
                <section className="antrag-detail-page-meta">
                   {/* Meta items */}
                   <div className="meta-item">
                     <span className="meta-label">Zuletzt aktualisiert:</span>
                     <span className="meta-value">{formatDate(antrag.updated_at)}</span>
                   </div>

                   {/* Combined Antragsteller & Kontakt */}
                   {(antrag.antragsteller || antrag.kontakt_email) && ( // Show item if at least one exists
                     <div className="meta-item">
                       {antrag.antragsteller && <span className="meta-label">Antragsteller*in:</span>}

                       <span className="meta-value">
                         {antrag.antragsteller}
                         {antrag.antragsteller && antrag.kontakt_email && ', '}
                         {antrag.kontakt_email && (
                           <a href={`mailto:${antrag.kontakt_email}`}>{antrag.kontakt_email}</a>
                         )}
                       </span>
                     </div>
                   )}
                </section>

            </div> {/* End of main-info */}

            {/* 4. Content Section (Antragstext) */}
            <section className="antrag-detail-page-content">
              {/* <h2>Antragstext</h2> */}
              <div className="markdown-content">
                {antrag.antragstext ? (
                  <Markdown>{antrag.antragstext}</Markdown>
                ) : (
                  <p><em>Kein Antragstext vorhanden.</em></p>
                )}
              </div>
            </section>
          </>
        ) : (
          /* --- Edit Mode --- */
          <div className="antrag-edit-placeholder">
            <p>Edit functionality has been removed.</p>
            <button onClick={handleCancelClick} className="button button-secondary">
              Cancel
            </button>
          </div>
        )}

        {/* Optional: Link zurück zur Übersicht */}
        <div className="antrag-detail-page-footer">
            <Link to="/datenbank/antraege" className="back-link">
                &larr; Zurück zur Antragsübersicht
            </Link>
        </div>

      </div>
    </div>
  );
};

export default AntragDetailPage;
