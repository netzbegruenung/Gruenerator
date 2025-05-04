import useApiSubmit from '../../../components/hooks/useApiSubmit';

export const useAntragService = () => {
  const searchQuerySubmit = useApiSubmit('antraege/search-query');
  const searchSubmit = useApiSubmit('search');
  const antragSubmit = useApiSubmit('antraege/antrag');
  const simpleAntragSubmit = useApiSubmit('antraege/generate-simple');
  

  return {
    searchQuerySubmit,
    searchSubmit,
    antragSubmit,
    simpleAntragSubmit
  };
};

export const AntragService = {
  async generateSearchQuery(formData) {
    const { submitForm } = useApiSubmit('antraege/search-query');
    return await submitForm(formData);
  },

  async searchInformation(searchQuery) {
    const { submitForm } = useApiSubmit('search');
    const result = await submitForm({ query: searchQuery.trim() });
    console.log('[AntragService] Search Response:', result);
    return result;
  },

  async generateAntrag(formData, searchResults) {
    const { submitForm } = useApiSubmit('antraege/antrag');
    const payload = {
      ...formData,
      searchResults,
    };
    const result = await submitForm(payload);
    console.log('[AntragService] Antrag Response:', result);
    return result;
  },

  async generateSimpleAntrag(formData) {
    const { submitForm } = useApiSubmit('antraege/generate-simple');
    const payload = {
      ...formData
    };
    const result = await submitForm(payload);
    console.log('[AntragService] Simple Antrag Response:', result);
    return result;
  },
}; 