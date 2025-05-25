import { useQuery } from '@tanstack/react-query';
import { useCanvaTemplates } from '../features/templates/hooks/useCanvaTemplates';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient'; // Ensure this path is correct

export const useCanvaTemplatesGallery = (searchTerm, selectedCategory, searchMode) => {
  const { fetchCanvaTemplates, fetchAvailableCategories } = useCanvaTemplates();

  // Fetch available categories for filtering
  const {
    data: categories,
    isLoading: categoriesLoading,
    error: categoriesError,
  } = useQuery({
    queryKey: ['canvaAvailableCategories'],
    queryFn: () => fetchAvailableCategories(templatesSupabase),
    select: (data) => [{ value: 'all', label: 'Alle Kategorien' }, ...data],
    enabled: !!templatesSupabase, // Only run if supabase client is available
  });

  // Fetch Canva templates with filters
  const {
    data: templates,
    isLoading: templatesLoading,
    isFetching: templatesFetching,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    // Note: UserId is not directly used here as templates might be global or user-specific handled by RLS or a different logic
    // If templates are strictly user-specific and user_id needs to be passed from a user session, adjust queryKey and queryFn accordingly.
    queryKey: ['canvaTemplatesGallery', searchTerm, selectedCategory, searchMode /*, userId (if needed) */],
    queryFn: async () => {
      // We pass null for userId to fetch all templates, assuming RLS handles user-specific access if needed
      // or templates are meant to be globally visible in this gallery context.
      // Adjust if a specific user's templates are required.
      const fetchedTemplates = await fetchCanvaTemplates(null, templatesSupabase);

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
    enabled: !!templatesSupabase, // Only run if supabase client is available
  });

  return {
    templates: templates || [],
    categories: categories || [{ value: 'all', label: 'Alle Kategorien' }],
    isLoading: templatesLoading || categoriesLoading || templatesFetching,
    error: templatesError || categoriesError,
    refetchTemplates,
  };
}; 