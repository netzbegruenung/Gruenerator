import { useState, useEffect } from 'react';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const usePRTextsGallery = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPRTexts = async () => {
      try {
        setLoading(true);
        
        const response = await fetch(`${AUTH_BASE_URL}/api/pr-texts`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: 'Failed to fetch PR texts' }));
          throw new Error(error.message || 'Fehler beim Laden der PR-Texte');
        }

        const data = await response.json();

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