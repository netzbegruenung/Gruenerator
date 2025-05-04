import React from 'react';
import PropTypes from 'prop-types';

const CategoryFilter = ({ categories, selectedCategory, onCategoryChange }) => {
  return (
    <div className="gallery-category-filter"> {/* Use specific class for potential targeted styling */}
      {categories.map(category => (
        <button
          key={category.id}
          className={`category-button ${selectedCategory === category.id ? 'active' : ''}`}
          onClick={() => onCategoryChange(category.id)}
          aria-pressed={selectedCategory === category.id}
        >
          {category.label}
        </button>
      ))}
    </div>
  );
};

CategoryFilter.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    label: PropTypes.string.isRequired,
  })).isRequired,
  selectedCategory: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  onCategoryChange: PropTypes.func.isRequired,
};

export default CategoryFilter; 