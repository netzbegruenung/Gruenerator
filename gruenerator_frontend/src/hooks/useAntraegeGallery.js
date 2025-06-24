import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

const DEBOUNCE_DELAY = 500;

export const useAntraegeGallery = (searchTermExternal, selectedCategoryExternal, searchModeExternal) => {
  const searchModeRef = useRef(searchModeExternal);

  // Aktualisiere Ref bei Änderung des searchModeExternal
  if (searchModeRef.current !== searchModeExternal) {
    searchModeRef.current = searchModeExternal;
  }

  // Kategorien laden
  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError
  } = useQuery({
    queryKey: ['antraegeCategories'],
    queryFn: async () => {
      const response = await fetch(`${AUTH_BASE_URL}/auth/antraege-categories`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch categories' }));
        throw new Error(error.message || 'Fehler beim Laden der Kategorien');
      }

      const data = await response.json();
      return [{ id: 'all', label: 'Alle Kategorien' }, ...(data.categories || [])];
    },
  });

  // Anträge laden mit Filtern
  const {
    data: antraege,
    isLoading: antraegeLoading,
    isFetching: antraegeFetching,
    error: antraegeError,
    refetch: refetchAntraege
  } = useQuery({
    queryKey: ['antraege', searchTermExternal, selectedCategoryExternal, searchModeExternal],
    queryFn: async () => {
      const url = new URL(`${AUTH_BASE_URL}/auth/antraege`);
      
      // Suchfilter anwenden
      if (searchTermExternal) {
        url.searchParams.append('searchTerm', searchTermExternal);
        if (searchModeExternal) {
          url.searchParams.append('searchMode', searchModeExternal);
        }
      }

      // Kategoriefilter anwenden
      if (selectedCategoryExternal && selectedCategoryExternal !== 'all') {
        url.searchParams.append('categoryId', selectedCategoryExternal);
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch antraege' }));
        throw new Error(error.message || 'Fehler beim Laden der Anträge');
      }

      const data = await response.json();
      return data.antraege || [];
    },
    enabled: true,
  });

  return {
    // Daten
    antraege: antraege || [],
    categories: categories || [{ id: 'all', label: 'Alle Kategorien' }],
    
    // Status
    loading: antraegeLoading || categoriesLoading || antraegeFetching,
    error: antraegeError || categoriesError,
    
    // Actions
    refetchAntraege
  };
}; 