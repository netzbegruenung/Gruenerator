import { JSX, useState } from 'react';
import { HiPlus } from 'react-icons/hi';
import SearchBar from '../../../features/search/components/SearchBar';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';

import '../../../assets/styles/components/SearchBar.css';
import '../../../assets/styles/components/profile/profile-action-buttons.css';

interface CategoryItem {
  id: string;
  label: string;
}

interface GalleryControlsProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  contentTypes: {
    id?: string;
    label?: string
  }[];
  activeContentType?: string;
  onContentTypeChange?: (id: string) => void;
  categories: CategoryItem[];
  selectedCategory?: string | number;
  onCategoryChange?: (id: string) => void;
  showCategoryFilter?: boolean;
  onRefresh?: () => void;
}

const GalleryControls = ({ searchTerm,
  onSearchChange,
  placeholder,
  contentTypes,
  activeContentType,
  onContentTypeChange,
  categories,
  selectedCategory,
  onCategoryChange,
  showCategoryFilter,
  onRefresh }: GalleryControlsProps): JSX.Element => {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleTemplateAdded = () => {
    onRefresh?.();
  };

  const categorySettingsContent = showCategoryFilter && Array.isArray(categories) && categories.length > 0 ? (
    <div className="gallery-settings-categories">
      <label>Kategorie</label>
      <div className="category-chips">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`category-chip ${selectedCategory === category.id ? 'active' : ''}`}
            onClick={() => onCategoryChange(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="gallery-controls">
      <div className="gallery-controls-row">
        <SearchBar
          onSearch={() => {}}
          value={searchTerm}
          onChange={onSearchChange}
          placeholder={placeholder}
          hideExamples
          hideDisclaimer
          settingsContent={categorySettingsContent}
        />

        {activeContentType === 'vorlagen' && (
          <button
            type="button"
            className="pabtn pabtn--primary pabtn--s"
            onClick={() => setShowAddModal(true)}
          >
            <HiPlus className="pabtn__icon" />
            <span className="pabtn__label">Vorlage hinzufügen</span>
          </button>
        )}
      </div>

      {Array.isArray(contentTypes) && contentTypes.length > 1 && (
        <div className="gallery-category-filter content-type-selector">
          {contentTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              className={`category-button ${activeContentType === type.id ? 'active' : ''}`}
              onClick={() => onContentTypeChange(type.id)}
              aria-pressed={activeContentType === type.id}
            >
              {type.label}
            </button>
          ))}
        </div>
      )}

      <AddTemplateModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleTemplateAdded}
      />
    </div>
  );
};

export default GalleryControls;
