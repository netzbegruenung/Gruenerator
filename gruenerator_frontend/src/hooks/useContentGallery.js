import { useState, useEffect } from 'react';

const DEBOUNCE_DELAY = 500;

// Base Hook für gemeinsame Galerie-Funktionalität
export const useContentGallery = (initialSearchMode = 'title') => {
  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState(initialSearchMode);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [contentType, setContentType] = useState('antraege');

  // Debounce-Effekt für Sucheingabe
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(inputValue);
    }, DEBOUNCE_DELAY);

    return () => {
      clearTimeout(handler);
    };
  }, [inputValue]);

  return {
    // Suchstatus
    inputValue,
    searchTerm,
    searchMode,
    selectedCategory,
    contentType,

    // Aktionen
    setInputValue,
    setSearchTerm,
    setSearchMode,
    setSelectedCategory,
    setContentType,

    // Hilfsfunktionen
    resetSearch: () => {
      setInputValue('');
      setSearchTerm('');
      setSelectedCategory('all');
    }
  };
}; 