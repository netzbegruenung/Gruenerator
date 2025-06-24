import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { useLazyAuth } from '../../../hooks/useAuth';
import Spinner from '../../../components/common/Spinner'; // Corrected import for Spinner

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
    if (!user) return; // Warten auf User-Info für Auth

    setLoading(true);
    setError(null);

    try {
      const url = new URL(`${AUTH_BASE_URL}/api/pr-texts`);
      
      // Search term filter
      if (searchTerm) {
        url.searchParams.append('searchTerm', searchTerm);
        if (searchMode) {
          url.searchParams.append('searchMode', searchMode);
        }
      }

      // Category filter
      if (selectedCategory && selectedCategory !== 'all') {
        url.searchParams.append('categoryId', selectedCategory);
      }

      const response = await fetch(url, {
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