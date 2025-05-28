import useApiSubmit from '../../../components/hooks/useApiSubmit';

export const useAntragService = () => {
  const simpleAntragSubmit = useApiSubmit('antraege/generate-simple');
  
  return {
    simpleAntragSubmit
  };
};

export const AntragService = {
  async generateAntragWithWebSearch(formData, submitForm) {
    const payload = {
      ...formData,
      useWebSearchTool: true
    };
    const result = await submitForm(payload);
    console.log('[AntragService] Web Search Antrag Response:', result);
    return result;
  },

  async generateAntragClassic(formData, submitForm) {
    const payload = {
      ...formData,
      useWebSearchTool: false
    };
    const result = await submitForm(payload);
    console.log('[AntragService] Classic Antrag Response:', result);
    return result;
  },

  async generateSimpleAntrag(formData, submitForm) {
    const payload = {
      ...formData
    };
    const result = await submitForm(payload);
    console.log('[AntragService] Simple Antrag Response:', result);
    return result;
  },
}; 