import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../components/utils/supabaseClient'; // Assuming supabaseClient is in the parent directory
import { useAuthStore } from '../stores/authStore';

export const usePRTextsGallery = () => {
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [errorCategories, setErrorCategories] = useState(null);
  const { supabaseUser: user } = useAuthStore();

  const fetchCategories = useCallback(async () => {
    if (!user) return; // Ensure user is available for RLS

    setLoadingCategories(true);
    setErrorCategories(null);
    try {
      const { data, error } = await supabase
        .from('pr_text_categories')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) throw error;
      
      // Transform data to match the expected format for CategoryFilter { id: 'string', label: 'string' }
      const formattedCategories = data.map(cat => ({ id: cat.id, label: cat.name }));
      setCategories(formattedCategories);
    } catch (error) {
      console.error("Error fetching PR text categories:", error);
      setErrorCategories(error.message);
    } finally {
      setLoadingCategories(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loadingCategories,
    errorCategories,
    fetchCategories, // Expose fetchCategories if manual refetch is needed
  };
}; 