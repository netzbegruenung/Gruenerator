import { useQuery } from '@tanstack/react-query';
import { useCanvaTemplates } from '../features/templates/hooks/useCanvaTemplates';

export const useCanvaTemplatesGallery = (searchTerm, selectedCategory, searchMode) => {
  const { fetchCanvaTemplates, fetchAvailableCategories } = useCanvaTemplates();

  // Fetch available categories for filtering
  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: ['canvaAvailableCategories'],
    queryFn: () => fetchAvailableCategories(),
    select: (data) => [{ value: 'all', label: 'Alle Kategorien' }, ...data],
  });

  // Fetch Canva templates with filters
  const {
    data: templates,
    isLoading: templatesLoading,
    isFetching: templatesFetching,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ['canvaTemplatesGallery', searchTerm, selectedCategory, searchMode],
    queryFn: async () => {
      // We pass null for userId to fetch all templates, assuming auth is handled by backend
      const fetchedTemplates = await fetchCanvaTemplates(null);

      if (!fetchedTemplates) return [];

      // Client-side filtering (if necessary, or adjust backend query for more efficiency)
      let filteredData = fetchedTemplates;

      // Filter by search term (client-side example, can be pushed to backend)
      if (searchTerm) {
        const lowerSearchTerm = searchTerm.toLowerCase();
        filteredData = filteredData.filter(template => 
          template.title?.toLowerCase().includes(lowerSearchTerm) ||
          template.description?.toLowerCase().includes(lowerSearchTerm) ||
          template.tags?.some(tag => tag.name?.toLowerCase().includes(lowerSearchTerm))
        );
      }

      // Filter by category (client-side example)
      if (selectedCategory && selectedCategory !== 'all') {
        filteredData = filteredData.filter(template => 
          template.categories?.some(cat => cat.id === selectedCategory)
        );
      }
      
      return filteredData;
    },
  });

  return {
    templates: templates || [],
    categories: categories || [{ value: 'all', label: 'Alle Kategorien' }],
    isLoading: templatesLoading || categoriesLoading || templatesFetching,
    error: templatesError || categoriesError,
    refetchTemplates,
  };
}; 