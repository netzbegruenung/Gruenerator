import axios from 'axios';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Hilfsfunktion zur Extraktion des Inhalts aus der Antwort
const extractContent = (response) => {
  if (!response) return null;
  
  if (typeof response === 'string') {
    return response;
  }
  
  if (response.content) {
    return response.content;
  }
  
  if (response.metadata && response.metadata.content) {
    return response.metadata.content;
  }
  
  console.error('[AntragService] Unbekanntes Antwortformat:', response);
  return null;
};

export const AntragService = {
  async generateSearchQuery(formData) {
    const response = await axios.post(`${API_BASE_URL}/claude/search-query`, formData);
    return response.data;
  },

  async searchInformation(searchQuery) {
    const response = await axios.post(`${API_BASE_URL}/search`, { 
      query: searchQuery.trim() 
    });
    console.log('[AntragService] Search Response:', response.data);
    return response.data;
  },

  async generateAntrag(formData, searchResults) {
    const payload = {
      ...formData,
      searchResults,
    };
    const response = await axios.post(`${API_BASE_URL}/claude/antrag`, payload);
    console.log('[AntragService] Antrag Response:', response.data);
    return extractContent(response.data);
  },

  async generateSimpleAntrag(formData) {
    const payload = {
      ...formData
    };
    const response = await axios.post(`${API_BASE_URL}/claude/antrag-simple`, payload);
    console.log('[AntragService] Simple Antrag Response:', response.data);
    return extractContent(response.data);
  },
};

export const useAntragService = () => {
  const searchQuerySubmit = useApiSubmit('claude/search-query');
  const searchSubmit = useApiSubmit('search');
  const antragSubmit = useApiSubmit('claude/antrag');
  const simpleAntragSubmit = useApiSubmit('claude/antrag-simple');

  return {
    searchQuerySubmit,
    searchSubmit,
    antragSubmit,
    simpleAntragSubmit
  };
}; 