import { create } from 'zustand';

// Export store for managing PDF and DOCX generation
export const useExportStore = create((set, get) => ({
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
  
  // PDF Operations
  loadPDFLibrary: async () => {
    const state = get();
    if (state.PDFLibrary || state.loadingPDF) return state.PDFLibrary;
    
    set({ loadingPDF: true });
    try {
      const { loadPDFRenderer } = await import('../../components/common/exportUtils');
      const library = await loadPDFRenderer();
      set({ PDFLibrary: library, loadingPDF: false });
      return library;
    } catch (error) {
      console.error('Failed to load PDF library:', error);
      set({ loadingPDF: false });
      throw error;
    }
  },
  
  // DOCX Operations
  loadDOCXLibrary: async () => {
    const state = get();
    if (state.DOCXLibrary || state.loadingDOCX) return state.DOCXLibrary;
    
    set({ loadingDOCX: true });
    try {
      const { loadDOCXLibrary } = await import('../../components/common/exportUtils');
      const library = await loadDOCXLibrary();
      set({ DOCXLibrary: library, loadingDOCX: false });
      return library;
    } catch (error) {
      console.error('Failed to load DOCX library:', error);
      set({ loadingDOCX: false });
      throw error;
    }
  },
  
  // PDF Generation using pdf-lib (much lighter than @react-pdf/renderer)
  generatePDF: async (content, title) => {
    const state = get();
    let library = state.PDFLibrary;
    
    if (!library) {
      library = await get().loadPDFLibrary();
    }
    
    if (!library) {
      throw new Error('PDF library not available');
    }
    
    set({ isGenerating: true });
    
    try {
      const { generatePDFBuffer } = library;
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      
      // Generate PDF buffer
      const pdfBytes = await generatePDFBuffer(content, title);
      
      // Create blob and download
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${extractFilenameFromContent(content, title)}.pdf`;
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('PDF generation error:', error);
      throw error;
    } finally {
      setTimeout(() => set({ isGenerating: false }), 1000);
    }
  },
  
  // DOCX Generation
  generateDOCX: async (content, title) => {
    const state = get();
    let library = state.DOCXLibrary;
    
    if (!library) {
      library = await get().loadDOCXLibrary();
    }
    
    if (!library) {
      throw new Error('DOCX library not available');
    }
    
    set({ isGenerating: true });
    
    try {
      const { createDOCXDocument, Packer, downloadBlob } = library;
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      
      const baseFileName = extractFilenameFromContent(content, title);
      const fileName = `${baseFileName}.docx`;
      const doc = createDOCXDocument(content, title);
      const blob = await Packer.toBlob(doc);
      downloadBlob(blob, fileName);
      
    } catch (error) {
      console.error('DOCX generation error:', error);
      throw error;
    } finally {
      setTimeout(() => set({ isGenerating: false }), 1000);
    }
  }
}));