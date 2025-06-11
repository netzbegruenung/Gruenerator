import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../../../components/utils/supabaseClient'; // Adjusted path to supabaseClient
import { useLazyAuth } from '../../../hooks/useAuth';
import Spinner from '../../../components/common/Spinner'; // Corrected import for Spinner

// Placeholder für PRTextCard, wird später erstellt oder importiert
const PRTextCard = ({ text }) => (
  <div style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
    <h4>{text.title}</h4>
    <p>{text.content ? `${text.content.substring(0, 100)}...` : 'Kein Inhalt'}</p>
    {/* Weitere Details wie Kategorien, Tags, Autor, Datum können hier hinzugefügt werden */}
  </div>
);

PRTextCard.propTypes = {
  text: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    content: PropTypes.string,
    // Fügen Sie hier weitere erwartete Props hinzu
  }).isRequired,
};

const PRTextsGallery = ({ searchTerm, selectedCategory, searchMode }) => {
  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { user } = useLazyAuth(); // RLS benötigt möglicherweise user info

  const fetchPRTexts = useCallback(async () => {
    if (!user) return; // Warten auf User-Info für RLS

    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('pr_texts')
        .select('id, title, content, created_at, pr_texts_to_categories!inner(category_id)') // Include category join
        .order('created_at', { ascending: false });

      // Search term filter
      if (searchTerm) {
        if (searchMode === 'title') {
          query = query.ilike('title', `%${searchTerm}%`);
        } else { // 'fulltext' or other modes, treat as fulltext for now
          query = query.or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);
        }
      }

      // Category filter
      if (selectedCategory && selectedCategory !== 'all') { // Assuming 'all' means no category filter
        // We need to filter based on the pr_texts_to_categories table
        // This requires a subquery or careful use of .eq on the joined table
        query = query.eq('pr_texts_to_categories.category_id', selectedCategory);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setTexts(data || []);
    } catch (e) {
      console.error("Error fetching PR texts:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedCategory, searchMode, user]);

  useEffect(() => {
    fetchPRTexts();
  }, [fetchPRTexts]);

  if (loading) return <Spinner size="medium" message="Lade PR-Texte..." />;
  if (error) return <div className="error-message"><h4>Fehler beim Laden der PR-Texte</h4><p>{error}</p></div>;
  if (!texts.length && !loading) return <p>Keine PR-Texte gefunden, die Ihren Kriterien entsprechen.</p>;

  return (
    <div className="pr-texts-gallery">
      {texts.map(text => (
        <PRTextCard key={text.id} text={text} />
      ))}
    </div>
  );
};

PRTextsGallery.propTypes = {
  searchTerm: PropTypes.string,
  selectedCategory: PropTypes.string, // Kann 'all' oder eine categoryId sein
  searchMode: PropTypes.string, // 'title', 'fulltext'
};

export default PRTextsGallery; 