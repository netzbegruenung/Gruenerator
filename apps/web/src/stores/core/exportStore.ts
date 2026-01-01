import { create } from 'zustand';
import apiClient from '../../components/utils/apiClient';

// Export store for managing PDF and DOCX generation
export const useExportStore = create<any>((set, get) => ({
  // State
  isGenerating: false,
  loadingPDF: false,
  loadingDOCX: false,
  PDFLibrary: null,
  DOCXLibrary: null,
  
  // Actions
  setGenerating: (isGenerating) => set({ isGenerating }),
  setLoadingPDF: (loadingPDF) => set({ loadingPDF }),
  setLoadingDOCX: (loadingDOCX) => set({ loadingDOCX }),
  
  // PDF library loading (frontend) is deprecated; PDFs are generated server-side now.
  loadPDFLibrary: async () => null,
  
  // DOCX library loading (frontend) is deprecated; DOCX is generated server-side now.
  loadDOCXLibrary: async () => null,
  
  // PDF Generation via backend
  generatePDF: async (content, title) => {
    set({ isGenerating: true });
    try {
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      const filename = `${extractFilenameFromContent(content, title)}.pdf`;
      const response = await apiClient.post('/exports/pdf', { content, title }, {
        responseType: 'blob'
      });
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    } finally {
      setTimeout(() => set({ isGenerating: false }), 500);
    }
  },
  
  // DOCX Generation via backend
  generateDOCX: async (content, title) => {
    set({ isGenerating: true });
    try {
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      const filename = `${extractFilenameFromContent(content, title)}.docx`;
      const response = await apiClient.post('/exports/docx', { content, title }, {
        responseType: 'blob'
      });
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('DOCX generation error:', error);
      throw error;
    } finally {
      setTimeout(() => set({ isGenerating: false }), 500);
    }
  },

  // Notebook DOCX Generation with citations and sources
  generateNotebookDOCX: async (content: string, title: string, citations: any[], sources?: any[]) => {
    set({ isGenerating: true });
    try {
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      const filename = `${extractFilenameFromContent(content, title)}.docx`;
      const response = await apiClient.post('/exports/docx', {
        content,
        title,
        citations,
        sources
      }, {
        responseType: 'blob'
      });
      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Notebook DOCX generation error:', error);
      throw error;
    } finally {
      setTimeout(() => set({ isGenerating: false }), 500);
    }
  }
}));
