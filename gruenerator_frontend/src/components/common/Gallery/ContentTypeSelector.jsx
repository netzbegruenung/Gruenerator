import React from 'react';
import PropTypes from 'prop-types';

const ContentTypeSelector = ({ contentTypes, activeContentType, onContentTypeChange }) => {
  return (
    <div className="gallery-category-filter">
      {contentTypes.map(type => (
        <button
          key={type.id}
          className={`category-button ${activeContentType === type.id ? 'active' : ''}`}
          onClick={() => onContentTypeChange(type.id)}
          aria-pressed={activeContentType === type.id}
        >
          {type.label}
          {type.disabled && <span className="content-type-badge">Bald</span>}
        </button>
      ))}
    </div>
  );
};

ContentTypeSelector.propTypes = {
  contentTypes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    disabled: PropTypes.bool
  })).isRequired,
  activeContentType: PropTypes.string.isRequired,
  onContentTypeChange: PropTypes.func.isRequired
};

export default ContentTypeSelector; 