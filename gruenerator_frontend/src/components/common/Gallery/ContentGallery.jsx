import React, { useState } from 'react';
import { useContentGallery } from '../../../hooks/useContentGallery';
import GalleryLayout from './GalleryLayout';
import SearchBar from './SearchBar';
import AntraegeGallery from '../../../features/templates/antraege/AntraegeGallery';
import CustomGeneratorsGallery from '../../../features/generators/components/CustomGeneratorsGallery';
import PRTextsGallery from '../../../features/texte/components/PRTextsGallery';
import { useAntraegeGallery } from '../../../hooks/useAntraegeGallery';
import { useCustomGeneratorsGallery } from '../../../hooks/useCustomGeneratorsGallery';
import { usePRTextsGallery } from '../../../hooks/usePRTextsGallery';

// Verfügbare Inhaltstypen
const contentTypes = [
  { id: 'all', label: 'Alle Kategorien' },
  { id: 'antraege', label: 'Anträge' },
  { id: 'generators', label: 'Grüneratoren' },
  { id: 'pr', label: 'Öffentlichkeitsarbeit', disabled: false }
];

// Suchoptionen
const searchModeOptions = [
  { value: 'title', label: 'Titel' },
  { value: 'fulltext', label: 'Volltext' },
  { value: 'semantic', label: 'Intelligent (bald)', disabled: true },
];

const ContentGallery = () => {
  // Base Gallery Hook für gemeinsame Funktionalität
  const {
    inputValue,
    searchTerm,
    searchMode,
    selectedCategory,
    contentType,
    setInputValue,
    setSearchMode,
    setSelectedCategory,
    setContentType
  } = useContentGallery('title');

  // Spezifische Hooks für verschiedene Inhaltstypen
  const { categories: antraegeCategories } = useAntraegeGallery();
  const { categories: generatorCategories } = useCustomGeneratorsGallery();
  const { categories: prTextCategories } = usePRTextsGallery();

  // Titel und Intro-Text je nach Inhaltstyp
  const getTitle = () => {
    switch (contentType) {
      case 'all': return 'Datenbank';
      case 'antraege': return 'Antragsdatenbank';
      case 'generators': return 'Grüneratoren-Datenbank';
      case 'pr': return 'Öffentlichkeitsarbeit-Datenbank';
      default: return 'Datenbank';
    }
  };

  const getIntroText = () => {
    switch (contentType) {
      case 'all': return 'Durchsuchen Sie unsere gesamte Datenbank mit allen Inhalten.';
      case 'antraege': return 'Durchsuchen und verwalten Sie hier eingereichte Anträge.';
      case 'generators': return 'Durchsuchen und verwalten Sie hier benutzerdefinierte Grüneratoren.';
      case 'pr': return 'Durchsuchen und verwalten Sie hier Texte für die Öffentlichkeitsarbeit.';
      default: return 'Durchsuchen Sie unsere Datenbank.';
    }
  };

  // Content basierend auf dem ausgewählten Typ rendern
  const renderContent = () => {
    // Wenn "Alle" ausgewählt ist, zeige alle Inhaltstypen
    if (contentType === 'all') {
      return (
        <div className="all-content-container">
          <div className="content-section">
            <h2 className="content-section-title">Anträge</h2>
            <div className="content-section-grid">
              <AntraegeGallery searchTerm={searchTerm} selectedCategory={selectedCategory} searchMode={searchMode} />
            </div>
          </div>
          
          <div className="content-section">
            <h2 className="content-section-title">Grüneratoren</h2>
            <div className="content-section-grid">
              <CustomGeneratorsGallery searchTerm={searchTerm} selectedCategory={selectedCategory} searchMode={searchMode} />
            </div>
          </div>

          
          <div className="content-section">
            <h2 className="content-section-title">Öffentlichkeitsarbeit</h2>
            <div className="content-section-grid">
              <PRTextsGallery searchTerm={searchTerm} selectedCategory={selectedCategory} searchMode={searchMode} />
            </div>
          </div>
        </div>
      );
    }

    // Einzelne Inhaltstypen
    switch (contentType) {
      case 'antraege':
        return <AntraegeGallery searchTerm={searchTerm} selectedCategory={selectedCategory} searchMode={searchMode} />;
      case 'generators':
        return <CustomGeneratorsGallery searchTerm={searchTerm} selectedCategory={selectedCategory} searchMode={searchMode} />;
      case 'pr':
        return <PRTextsGallery searchTerm={searchTerm} selectedCategory={selectedCategory} searchMode={searchMode} />;
      default:
        return <p>Bitte wählen Sie einen Inhaltstyp aus.</p>;
    }
  };

  let categoriesForFilter = [];
  if (contentType === 'antraege') {
    categoriesForFilter = antraegeCategories;
  } else if (contentType === 'generators') {
    categoriesForFilter = generatorCategories;
  } else if (contentType === 'pr') {
    categoriesForFilter = prTextCategories;
  }

  const mainSearchBarElement = (
    <SearchBar
      searchTerm={inputValue}
      onSearchChange={setInputValue}
      searchDepthOptions={searchModeOptions.map(opt => ({...opt, disabled: opt.disabled || (contentType === 'pr' && opt.value === 'semantic')}))}
      currentSearchDepth={searchMode}
      onSearchDepthChange={setSearchMode}
      contentType={contentType}
      categories={categoriesForFilter}
      selectedCategory={selectedCategory}
      onCategoryChange={setSelectedCategory}
      showCategoryFilter={contentType !== 'all' && categoriesForFilter && categoriesForFilter.length > 0}
    />
  );

  const contentTypeSelectorElement = (
    <div className="gallery-category-filter">
      {contentTypes.map(type => (
        <button
          key={type.id}
          className={`category-button ${contentType === type.id ? 'active' : ''}`}
          onClick={() => setContentType(type.id)}
          aria-pressed={contentType === type.id}
          disabled={type.disabled}
        >
          {type.label}
          {type.disabled && <span className="content-type-badge">Bald</span>}
        </button>
      ))}
    </div>
  );

  return (
    <GalleryLayout
      title={getTitle()}
      introText={getIntroText()}
      mainSearchBar={mainSearchBarElement}
      contentTypeSelectorElement={contentTypeSelectorElement}
      categoryFilter={null}
    >
      {renderContent()}
    </GalleryLayout>
  );
};

export default ContentGallery; 