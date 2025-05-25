import { useQuery } from '@tanstack/react-query';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient.js';

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
      let query = templatesSupabase
        .from('custom_generators')
        .select('*');

      // Suchfilter anwenden
      if (searchTerm) {
        query = query.or(`name.ilike.%${searchTerm}%,title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      // Kategoriefilter anwenden (nur client-seitiger Filter für jetzt)
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Filtere nach Kategorie (hier als Beispiel - kann später serverseitig implementiert werden)
      let filtered = data || [];
      if (selectedCategory !== 'all') {
        // Diese Logik würde durch tatsächliche Kategorien aus der DB ersetzt werden
        switch (selectedCategory) {
          case 'own':
            // Implementierung, sobald Benutzerauthentifizierung integriert ist
            break;
          case 'shared':
            // Implementierung für geteilte Generatoren
            break;
          case 'popular':
            // Beispiel: Filter nach Nutzungshäufigkeit
            break;
        }
      }
      
      return filtered;
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