import { useState, useEffect } from 'react';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient';

export const usePRTextsGallery = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPRTexts = async () => {
      if (!templatesSupabase) {
        setCategories([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const { data, error } = await templatesSupabase
          .from('pr_texts')
          .select('*')
          .order('category')
          .order('title');

        if (error) throw error;

        // Group by category
        const groupedData = data.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(item);
          return acc;
        }, {});

        // Convert to array format
        const categoriesArray = Object.entries(groupedData).map(([name, items]) => ({
          name,
          items
        }));

        setCategories(categoriesArray);
        setError(null);
      } catch (err) {
        console.error('Error fetching PR texts:', err);
        setError(err.message);
        setCategories([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPRTexts();
  }, []);

  return { categories, loading, error };
}; 