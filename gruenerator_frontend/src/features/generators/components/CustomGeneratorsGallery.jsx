import React from 'react';
import PropTypes from 'prop-types';
import { useCustomGeneratorsGallery } from '../../../hooks/useCustomGeneratorsGallery';
import GeneratorCardSkeleton from './GeneratorCardSkeleton';

// Generator-Karte
const GeneratorCard = ({ generator }) => {
  const handleCardNavigation = (e) => {
    e.preventDefault();
    window.open(`/generator/${generator.slug}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="gallery-item-card generator-card"
      onClick={handleCardNavigation}
      role="link"
      tabIndex={0}
      onKeyPress={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardNavigation(e); }}
    >
      <h3 className="generator-card-title">{generator.name}</h3>
      
      {generator.description && (
        <p className="generator-card-description">{generator.description}</p>
      )}
      
      <p className="generator-card-date">
        Erstellt am: {new Date(generator.created_at).toLocaleDateString('de-DE')}
      </p>
    </div>
  );
};

GeneratorCard.propTypes = {
  generator: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    slug: PropTypes.string.isRequired,
    description: PropTypes.string,
    created_at: PropTypes.string.isRequired
  }).isRequired
};

// Hauptkomponente
const CustomGeneratorsGallery = ({ searchTerm, selectedCategory }) => {
  const { generators, loading, error } = useCustomGeneratorsGallery(
    searchTerm,
    selectedCategory
  );
  
  const NUMBER_OF_SKELETONS = 6;

  return (
    <>
      {loading && (
        Array.from({ length: NUMBER_OF_SKELETONS }).map((_, index) => (
          <GeneratorCardSkeleton key={index} />
        ))
      )}

      {!loading && error && (
        <p className="error-message">{error?.message || String(error)}</p>
      )}

      {!loading && !error && generators.length === 0 && (
        <p className="no-results">Keine Grüneratoren gefunden, die den Kriterien entsprechen.</p>
      )}

      {!loading && !error && generators.length > 0 && (
        generators.map(generator => (
          <GeneratorCard
            key={generator.id}
            generator={generator}
          />
        ))
      )}
    </>
  );
};

CustomGeneratorsGallery.propTypes = {
  searchTerm: PropTypes.string,
  selectedCategory: PropTypes.string
};

export default CustomGeneratorsGallery; 