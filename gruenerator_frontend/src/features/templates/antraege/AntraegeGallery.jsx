import React from 'react';
import PropTypes from 'prop-types';
import { useAntraegeGallery } from '../../../hooks/useAntraegeGallery';


import AntragCardSkeleton from './components/AntragCardSkeleton'; // Adjust the path if necessary

// We will use the existing gallery CSS, assuming it's globally imported or linked
const DEBOUNCE_DELAY = 500; // Delay in milliseconds (e.g., 500ms)

// Define search mode options for the selector
const searchSteps = [
  { value: 'title', label: 'Titel' },
  { value: 'fulltext', label: 'Volltext' },
  { value: 'semantic', label: 'Inteligent (bald)', disabled: true },
];

// Simple Card Component
const AntragCard = ({ antrag }) => {
  const maxTagsToShow = 3;
  const tagsToDisplay = antrag.tags?.slice(0, maxTagsToShow) || [];
  const hasMoreTags = antrag.tags?.length > maxTagsToShow;

  const handleCardNavigation = (e) => {
    e.preventDefault();
    window.open(`/datenbank/antraege/${antrag.id}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="gallery-item-card antrag-card"
      onClick={handleCardNavigation}
      role="link"
      tabIndex={0}
      onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardNavigation(e); }}
    >
      <div>
        <h3 className="antrag-card-title">{antrag.title}</h3>
        
        {antrag.description && (
          <p className="antrag-card-description">{antrag.description}</p>
        )}

        {tagsToDisplay.length > 0 && (
          <div className="antrag-card-tags">
            {tagsToDisplay.map(tag => (
              <span key={tag} className="antrag-card-tag">{tag}</span>
            ))}
            {hasMoreTags && <span className="antrag-card-tag-more">...</span>}
          </div>
        )}
      </div>
      
      <p className="antrag-card-date">
        Erstellt am: {new Date(antrag.created_at).toLocaleDateString('de-DE')}
      </p>
    </div>
  );
};

AntragCard.propTypes = {
  antrag: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    tags: PropTypes.array,
    created_at: PropTypes.string.isRequired
  }).isRequired
};

const AntraegeGallery = ({ searchTerm, selectedCategory, searchMode }) => {
  const { antraege, loading, error } = useAntraegeGallery(searchTerm, selectedCategory, searchMode);
  
  const NUMBER_OF_SKELETONS = 6;

  return (
    <>
      {loading && (
        Array.from({ length: NUMBER_OF_SKELETONS }).map((_, index) => (
          <AntragCardSkeleton key={index} />
        ))
      )}

      {!loading && error && (
        <p className="error-message">{error?.message || String(error)}</p>
      )}

      {!loading && !error && antraege.length === 0 && (
        <p className="no-results">Keine Anträge gefunden, die den Kriterien entsprechen.</p>
      )}

      {!loading && !error && antraege.length > 0 && (
        antraege.map(antrag => (
          <AntragCard
            key={antrag.id}
            antrag={antrag}
          />
        ))
      )}
    </>
  );
};

AntraegeGallery.propTypes = {
  searchTerm: PropTypes.string,
  selectedCategory: PropTypes.string,
  searchMode: PropTypes.string
};

export default AntraegeGallery; 