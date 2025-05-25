import React from 'react';
import PropTypes from 'prop-types';

const GalleryLayout = ({ 
  title, 
  introText, 
  mainSearchBar, 
  contentTypeSelectorElement,
  categoryFilter,
  children 
}) => {
  return (
    <div className="gallery-layout">
      <div className="gallery-header">
        {title && <h1>{title}</h1>}
        {introText && <p>{introText}</p>}
        
        {/* Main Search Bar Section */}
        {mainSearchBar && (
          <div className="gallery-main-searchbar-section">
            {mainSearchBar}
          </div>
        )}

        {/* Content Type Selector Section */}
        {contentTypeSelectorElement && (
          <div className="gallery-content-type-selector-section">
            {contentTypeSelectorElement}
          </div>
        )}
        
        {/* Category Filter (and other controls) Section */}
        {categoryFilter && (
          <div className="gallery-search-controls">
            {categoryFilter}
          </div>
        )}
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
  mainSearchBar: PropTypes.node,
  contentTypeSelectorElement: PropTypes.node,
  categoryFilter: PropTypes.node,
  children: PropTypes.node.isRequired,
};

export default GalleryLayout; 