import { useQuery } from '@tanstack/react-query';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const useCustomGeneratorsGallery = (searchTerm, selectedCategory = 'all') => {
  // Kategorien für Custom Generators laden
  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError
  } = useQuery({
    queryKey: ['customGeneratorsCategories'],
    queryFn: async () => {
      // Generiere strukturierte Kategorien für Custom Generators
      return [
        { id: 'all', label: 'Alle Kategorien' },
        { id: 'own', label: 'Eigene Generatoren' },
        { id: 'shared', label: 'Geteilte Generatoren' },
        { id: 'popular', label: 'Beliebt' }
      ];
    }
  });

  // Custom Generators laden
  const {
    data: generators,
    isLoading: generatorsLoading,
    error: generatorsError,
    refetch: refetchGenerators
  } = useQuery({
    queryKey: ['customGenerators', searchTerm, selectedCategory],
    queryFn: async () => {
      const url = new URL(`${AUTH_BASE_URL}/auth/custom-generators`);
      
      // Suchfilter anwenden
      if (searchTerm) {
        url.searchParams.append('searchTerm', searchTerm);
      }
      
      // Kategoriefilter anwenden
      if (selectedCategory && selectedCategory !== 'all') {
        url.searchParams.append('category', selectedCategory);
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch custom generators' }));
        throw new Error(error.message || 'Fehler beim Laden der Custom Generators');
      }
      
      const result = await response.json();
      return result.generators || result || [];
    }
  });

  return {
    // Daten
    generators: generators || [],
    categories: categories || [{ id: 'all', label: 'Alle Kategorien' }],
    
    // Status
    loading: generatorsLoading || categoriesLoading,
    error: generatorsError || categoriesError,
    
    // Aktionen
    refetchGenerators
  };
}; 