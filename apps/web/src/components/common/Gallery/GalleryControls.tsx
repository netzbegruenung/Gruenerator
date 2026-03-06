import { type JSX, useState, memo } from 'react';
import { HiPlus } from 'react-icons/hi';
import { HiCog6Tooth } from 'react-icons/hi2';

import SearchBar from '../../../features/search/components/SearchBar';
import AddTemplateModal from '../AddTemplateModal/AddTemplateModal';

import '../../../assets/styles/components/profile/profile-action-buttons.css';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

interface CategoryItem {
  id: string;
  label: string;
}

interface SearchModeItem {
  value: string;
  label: string;
}

interface GalleryControlsProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  contentTypes: {
    id?: string;
    label?: string;
  }[];
  activeContentType?: string;
  onContentTypeChange?: (id: string) => void;
  categories: CategoryItem[];
  selectedCategory?: string | number;
  onCategoryChange?: (id: string) => void;
  showCategoryFilter?: boolean;
  onRefresh?: () => void;
  searchModes?: SearchModeItem[];
  selectedSearchMode?: string;
  onSearchModeChange?: (mode: string) => void;
}

function GallerySettingsPopover({
  searchModes,
  selectedSearchMode,
  onSearchModeChange,
  categories,
  selectedCategory,
  onCategoryChange,
  showCategoryFilter,
}: {
  searchModes?: SearchModeItem[];
  selectedSearchMode?: string;
  onSearchModeChange?: (mode: string) => void;
  categories: CategoryItem[];
  selectedCategory?: string | number;
  onCategoryChange?: (id: string) => void;
  showCategoryFilter?: boolean;
}) {
  const hasSearchModes = Array.isArray(searchModes) && searchModes.length > 1;
  const hasCategories = showCategoryFilter && Array.isArray(categories) && categories.length > 0;

  if (!hasSearchModes && !hasCategories) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center rounded-full border-none bg-transparent p-2 text-foreground opacity-70 transition-colors hover:bg-background-alt hover:text-primary-500 hover:opacity-100"
          aria-label="Einstellungen"
          title="Einstellungen"
        >
          <HiCog6Tooth className="size-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[16rem] space-y-3 p-3">
        {hasSearchModes && (
          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
              Suchmodus
            </span>
            <div className="flex flex-wrap gap-1.5">
              {searchModes!.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={cn(
                    'rounded-2xl border px-2.5 py-1 text-xs font-medium transition-colors',
                    selectedSearchMode === mode.value
                      ? 'border-transparent bg-primary-500 text-white'
                      : 'border-grey-300 text-grey-700 hover:border-grey-400 dark:border-grey-600 dark:text-grey-300'
                  )}
                  onClick={() => onSearchModeChange?.(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasCategories && (
          <div>
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-grey-500 dark:text-grey-400">
              Kategorie
            </span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={cn(
                    'rounded-2xl border px-2.5 py-1 text-xs font-medium transition-colors',
                    selectedCategory === category.id
                      ? 'border-transparent bg-primary-500 text-white'
                      : 'border-grey-300 text-grey-700 hover:border-grey-400 dark:border-grey-600 dark:text-grey-300'
                  )}
                  onClick={() => onCategoryChange?.(category.id)}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const GalleryControls = memo(
  ({
    searchTerm,
    onSearchChange,
    placeholder,
    contentTypes,
    activeContentType,
    onContentTypeChange,
    categories,
    selectedCategory,
    onCategoryChange,
    showCategoryFilter,
    onRefresh,
    searchModes,
    selectedSearchMode,
    onSearchModeChange,
  }: GalleryControlsProps): JSX.Element => {
    const [showAddModal, setShowAddModal] = useState(false);

    const handleTemplateAdded = () => {
      onRefresh?.();
    };

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
            settingsContent={
              <GallerySettingsPopover
                searchModes={searchModes}
                selectedSearchMode={selectedSearchMode}
                onSearchModeChange={onSearchModeChange}
                categories={categories}
                selectedCategory={selectedCategory}
                onCategoryChange={onCategoryChange}
                showCategoryFilter={showCategoryFilter}
              />
            }
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
                onClick={() => type.id && onContentTypeChange?.(type.id)}
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
  }
);

GalleryControls.displayName = 'GalleryControls';

export default GalleryControls;
