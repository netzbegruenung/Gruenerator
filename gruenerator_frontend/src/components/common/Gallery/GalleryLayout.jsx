import React from 'react';
import PropTypes from 'prop-types';

const GalleryLayout = ({ 
  title, 
  introText, 
  searchBar, 
  categoryFilter, 
  modeSelector,
  children // For the grid content
}) => {
  return (
    <div className="gallery-layout">
      <div className="gallery-header">
        {title && <h1>{title}</h1>}
        {introText && <p>{introText}</p>}
        
        {(searchBar || modeSelector) && ( 
          <div className="gallery-search-controls">
            {searchBar && <div className="gallery-search">{searchBar}</div>}
            {modeSelector && <div className="gallery-mode-selector">{modeSelector}</div>}
          </div>
        )}
        
        {categoryFilter && <div className="gallery-filter">{categoryFilter}</div>}
      </div>

      <div className="gallery-grid">
        {children}
      </div>
    </div>
  );
};

GalleryLayout.propTypes = {
  title: PropTypes.string,
  introText: PropTypes.string,
  searchBar: PropTypes.node, // Can pass the SearchBar component here
  categoryFilter: PropTypes.node, // Can pass the CategoryFilter component here
  modeSelector: PropTypes.node,
  children: PropTypes.node.isRequired, // The grid items
};

export default GalleryLayout; 