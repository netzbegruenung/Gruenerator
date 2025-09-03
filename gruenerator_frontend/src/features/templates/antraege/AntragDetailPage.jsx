import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
const ReactMarkdown = lazy(() => import('react-markdown'));
import { useOptimizedAuth } from '../../../hooks/useAuth';
import AntragEditForm from './AntragEditForm';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Hilfsfunktionen (ähnlich wie in AntragDetailView)
const formatDate = (dateString) => {
  if (!dateString) return '–';
  return new Date(dateString).toLocaleString('de-DE', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });
};

const getStatusClass = (status) => {
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

const AntragDetailPage = () => {
  const { antragId } = useParams();
  const [antrag, setAntrag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user: supabaseUser } = useOptimizedAuth();

  // State for editing mode
  const [isEditing, setIsEditing] = useState(false);
  const [editedAntrag, setEditedAntrag] = useState(null);

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
        const response = await fetch(`${AUTH_BASE_URL}/auth/antraege/${antragId}`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Antrag nicht gefunden.');
          } else {
            const error = await response.json().catch(() => ({ message: 'Failed to fetch antrag' }));
            throw new Error(error.message || 'Fehler beim Laden des Antrags.');
          }
        }

        const data = await response.json();
        const antrag = data.antrag || data;

        if (!antrag) {
          throw new Error('Antrag nicht gefunden.');
        }

        console.log("[AntragDetailPage] Antrag erfolgreich geladen:", antrag);
        setAntrag(antrag);
        setEditedAntrag(antrag);

      } catch (err) {
        console.error('[AntragDetailPage] Fehler beim Laden des Antrags:', err);
        setError(`Fehler beim Laden des Antrags: ${err.message}`);
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

  const handleSaveClick = async () => {
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

      const response = await fetch(`${AUTH_BASE_URL}/auth/antraege/${antragId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to update antrag' }));
        throw new Error(error.message || 'Fehler beim Speichern des Antrags.');
      }

      const result = await response.json();
      setAntrag(result.antrag || editedAntrag);
      setIsEditing(false);
      console.log("[AntragDetailPage] Antrag erfolgreich aktualisiert.");

    } catch (err) {
      console.error('[AntragDetailPage] Fehler beim Speichern des Antrags:', err);
      setError(`Fehler beim Speichern: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setEditedAntrag(prev => ({ ...prev, [name]: value }));
  };

  const handleMarkdownChange = (markdown) => {
    setEditedAntrag(prev => ({ ...prev, antragstext: markdown }));
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
                   <ReactMarkdown>{antrag.antragstext}</ReactMarkdown>
                 ) : (
                   <p><em>Kein Antragstext vorhanden.</em></p>
                 )}
              </div>
            </section>
          </>
        ) : (
          /* --- Edit Mode --- */
          <AntragEditForm 
            editedAntrag={editedAntrag}
            handleInputChange={handleInputChange}
            handleMarkdownChange={handleMarkdownChange}
            handleSaveClick={handleSaveClick}
            handleCancelClick={handleCancelClick}
            loading={loading}
            error={error}
          />
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
