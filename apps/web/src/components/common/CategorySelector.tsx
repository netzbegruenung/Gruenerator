import type { JSX } from 'react';

interface CategorySelectorProps {
  categories: {
    id?: string;
    label?: string;
    icon?: string;
    disabled?: boolean;
  }[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
  className?: string;
  showIcons?: boolean;
  badgeText?: string;
}

const CategorySelector = ({
  categories,
  activeCategory,
  onCategoryChange,
  className = '',
  showIcons = false,
  badgeText = 'Bald',
}: CategorySelectorProps): JSX.Element => {
  return (
    <div className={`gallery-category-filter ${className}`}>
      {categories.map((category) => (
        <button
          key={category.id}
          className={`category-button ${activeCategory === category.id ? 'active' : ''}`}
          onClick={() => category.id && onCategoryChange(category.id)}
          aria-pressed={activeCategory === category.id}
          disabled={category.disabled}
        >
          {showIcons && category.icon && <span className="category-icon">{category.icon}</span>}
          <span className="category-label">{category.label}</span>
          {category.disabled && <span className="content-type-badge">{badgeText}</span>}
        </button>
      ))}
    </div>
  );
};

export default CategorySelector;
