import React from 'react';
import PropTypes from 'prop-types';

/**
 * Reusable category selector component with button-style selection
 * @param {Object} props - Component props
 * @param {Array} props.categories - Array of category objects with id, label, icon?, disabled?
 * @param {string} props.activeCategory - Currently active category ID
 * @param {Function} props.onCategoryChange - Callback when category changes
 * @param {string} props.className - Optional additional CSS class
 * @param {boolean} props.showIcons - Whether to display icons
 * @param {string} props.badgeText - Text for disabled items badge
 * @returns {JSX.Element} Category selector component
 */
const CategorySelector = ({ 
  categories, 
  activeCategory, 
  onCategoryChange,
  className = '',
  showIcons = false,
  badgeText = 'Bald'
}) => {
  return (
    <div className={`gallery-category-filter ${className}`}>
      {categories.map(category => (
        <button
          key={category.id}
          className={`category-button ${activeCategory === category.id ? 'active' : ''}`}
          onClick={() => onCategoryChange(category.id)}
          aria-pressed={activeCategory === category.id}
          disabled={category.disabled}
        >
          {showIcons && category.icon && (
            <span className="category-icon">{category.icon}</span>
          )}
          <span className="category-label">{category.label}</span>
          {category.disabled && (
            <span className="content-type-badge">{badgeText}</span>
          )}
        </button>
      ))}
    </div>
  );
};

CategorySelector.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.string,
    disabled: PropTypes.bool
  })).isRequired,
  activeCategory: PropTypes.string.isRequired,
  onCategoryChange: PropTypes.func.isRequired,
  className: PropTypes.string,
  showIcons: PropTypes.bool,
  badgeText: PropTypes.string
};

CategorySelector.defaultProps = {
  className: '',
  showIcons: false,
  badgeText: 'Bald'
};

export default CategorySelector;