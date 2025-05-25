import React from 'react';
import PropTypes from 'prop-types';
import { useCanvaTemplatesGallery } from '../../../hooks/useCanvaTemplatesGallery';
import CanvaTemplateCard from './components/CanvaTemplateCard'; // Corrected path
import ErrorBoundary from '../../../components/ErrorBoundary';
// GalleryLayout, SearchBar, CategoryFilter might not be needed here if ContentGallery handles them

const CanvaTemplatesDisplay = ({ searchTerm, selectedCategory, searchMode }) => {
  const {
    templates,
    // categories, // Categories are now handled by ContentGallery or useCanvaTemplatesGallery directly for the filter
    isLoading,
    error,
  } = useCanvaTemplatesGallery(searchTerm, selectedCategory, searchMode);

  if (isLoading) {
    return <div className="loading-indicator">Lade Canva Vorlagen...</div>;
  }

  if (error) {
    return <div className="template-gallery-error">Fehler beim Laden der Canva Vorlagen: {error.message}</div>;
  }

  if (templates.length === 0) {
    return <div className="no-results">Keine Canva Vorlagen gefunden</div>;
  }

  return (
    <ErrorBoundary>
      {/* Render cards directly so they become items of the parent .gallery-grid */}
      {templates.map(template => (
        <CanvaTemplateCard 
          key={template.id} 
          template={template} 
        />
      ))}
    </ErrorBoundary>
  );
};

CanvaTemplatesDisplay.propTypes = {
  searchTerm: PropTypes.string,
  selectedCategory: PropTypes.string, // Or PropTypes.oneOfType([PropTypes.string, PropTypes.number]) if IDs can be numbers
  searchMode: PropTypes.string,
};

export default CanvaTemplatesDisplay; 