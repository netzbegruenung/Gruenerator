import React from 'react';
import ReactMarkdown from 'react-markdown';
// Removed unused react-icons imports
// Import the component's CSS file
import '../../../assets/styles/components/AntragDetailView.css';

const AntragDetailView = ({ antrag, onClose }) => {
  if (!antrag) {
    return null; // Do not render if no antrag is selected
  }

  const formatDate = (dateString) => {
    if (!dateString) return '–'; // Use en-dash for missing values
    // Format with time
    return new Date(dateString).toLocaleString('de-DE', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Helper to get status CSS class (simplified example) - still needed for badge
  const getStatusClass = (status) => {
    const statusLower = status?.toLowerCase() || 'unbekannt';
    switch (statusLower) {
      case 'angenommen': return 'status-angenommen';
      case 'in bearbeitung': return 'status-in-bearbeitung';
      case 'abgelehnt': return 'status-abgelehnt';
      case 'neu': return 'status-neu';
      default: return 'status-unbekannt';
    }
  };

  return (
    // Use the overlay class, close on overlay click
    <div className="antrag-detail-overlay" onClick={onClose}>
      {/* Use the content class, prevent closing when clicking inside content */}
      {/* CSS class '.antrag-detail-content' will get updated padding/radius */}
      <div className="antrag-detail-content" onClick={(e) => e.stopPropagation()}>
        {/* Keep the close 'X' button */}
        <button className="antrag-detail-close-icon" onClick={onClose} aria-label="Schließen">
          &times; {/* HTML entity for 'X' */}
        </button>

        {/* --- Header Section (Modified) --- */}
        <div className="antrag-detail-header">
          {/* Left side container for title and tags */}
          <div className="header-left-content">
            <h2>{antrag.title || 'Unbenannter Antrag'}</h2>
            {/* Render Tags directly here if they exist */}
            {antrag.tags && antrag.tags.length > 0 && (
              <div className="header-tags-container">
                {antrag.tags.map(tag => (
                  <span key={tag} className="tag-chip">{tag}</span>
                ))}
              </div>
            )}
          </div>
          {/* Right side for Status Badge */}
          {antrag.status && (
             <span className={`status-badge ${getStatusClass(antrag.status)}`}>
               {/* Optionally add "Status: " text if needed, concept only shows value */}
               {antrag.status}
             </span>
           )}
        </div>
        {/* --- End Header Section --- */}


        {/* --- Container for Meta Layout (No Tags Section anymore) --- */}
        {/* Renamed container class for clarity */}
        <div className="antrag-detail-meta-cards-container">

          {/* --- Row 1: Grid for Cards --- */}
          <div className="meta-cards-row-1">
            {/* Card 1: Timestamps */}
            <div className="meta-sub-card">
              <div className="meta-item">
                <p className="meta-label">Erstellt:</p>
                <p className="meta-value">{formatDate(antrag.created_at)}</p>
              </div>
              <div className="meta-item">
                <p className="meta-label">Aktualisiert:</p>
                <p className="meta-value">{formatDate(antrag.updated_at)}</p>
              </div>
            </div>

            {/* Card 2: Contact Info (conditional rendering of the whole card) */}
            {(antrag.antragsteller || antrag.kontakt_email) && (
              <div className="meta-sub-card">
                {antrag.antragsteller && (
                  <div className="meta-item">
                    <p className="meta-label">Antragsteller*in:</p>
                    <p className="meta-value">{antrag.antragsteller}</p>
                  </div>
                )}
                {antrag.kontakt_email && (
                  <div className="meta-item">
                    <p className="meta-label">Kontakt-E-Mail:</p>
                    <p className="meta-value">
                      <a href={`mailto:${antrag.kontakt_email}`}>{antrag.kontakt_email}</a>
                    </p>
                  </div>
                )}
              </div>
             )}
             {/* Placeholder if contact info is missing, to keep grid layout stable? Or let it collapse? */}
             {/* For now, let it collapse if contact info is missing */}

          </div>
          {/* --- End Row 1 --- */}


          {/* --- Section 2: Tags (Removed) --- */}
          {/* The .meta-tags-section div is completely removed */}

        </div>
        {/* --- End Meta Cards Container --- */}


        {/* Description Section (remains the same) */}
        {antrag.description && (
          <div className="antrag-detail-description">
            <h3>Beschreibung:</h3>
             <ReactMarkdown>{antrag.description}</ReactMarkdown>
          </div>
        )}

        {/* Antragstext Section (remains the same) */}
        <h3>Antragstext:</h3>
        <div className="antrag-text-content">
          {antrag.antragstext ? (
             <ReactMarkdown>{antrag.antragstext}</ReactMarkdown>
           ) : (
             <p><em>Kein Text vorhanden.</em></p>
           )
          }
        </div>

        {/* Close Button (remains the same) */}
        <button className="antrag-detail-close-button" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
};

export default AntragDetailView; 