import { getContractsClient } from '@gruenerator/shared/api';
import { create } from 'zustand';

import apiClient from '../../components/utils/apiClient';

interface ExportState {
  isGenerating: boolean;
  loadingPDF: boolean;
  loadingDOCX: boolean;
  PDFLibrary: unknown | null;
  DOCXLibrary: unknown | null;
  setGenerating: (isGenerating: boolean) => void;
  setLoadingPDF: (loadingPDF: boolean) => void;
  setLoadingDOCX: (loadingDOCX: boolean) => void;
  loadPDFLibrary: () => Promise<null>;
  loadDOCXLibrary: () => Promise<null>;
  generatePDF: (content: string, title: string) => Promise<void>;
  generateDOCX: (content: string, title: string) => Promise<void>;
  generateNotebookDOCX: (
    content: string,
    title: string,
    citations: unknown[],
    sources?: unknown[]
  ) => Promise<void>;
}

// Export store for managing PDF and DOCX generation
export const useExportStore = create<ExportState>((set) => ({
  // State
  isGenerating: false,
  loadingPDF: false,
  loadingDOCX: false,
  PDFLibrary: null,
  DOCXLibrary: null,

  // Actions
  setGenerating: (isGenerating: boolean) => set({ isGenerating }),
  setLoadingPDF: (loadingPDF: boolean) => set({ loadingPDF }),
  setLoadingDOCX: (loadingDOCX: boolean) => set({ loadingDOCX }),

  // PDF library loading (frontend) is deprecated; PDFs are generated server-side now.
  loadPDFLibrary: async (): Promise<null> => null,

  // DOCX library loading (frontend) is deprecated; DOCX is generated server-side now.
  loadDOCXLibrary: async (): Promise<null> => null,

  // PDF Generation via backend (typed contract)
  generatePDF: async (content: string, title: string) => {
    set({ isGenerating: true });
    try {
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      const filename = `${extractFilenameFromContent(content, title)}.pdf`;
      const client = getContractsClient();
      const result = await client.exports.generatePdf({
        body: { content, title },
      });
      if (result.status !== 200) {
        throw new Error(`PDF generation failed (HTTP ${result.status})`);
      }
      // binaryFileResponseSchema is z.unknown(); axios adapter returns Blob
      // when the path is in BINARY_RESPONSE_PATHS in contractsClient.ts.
      const blob = result.body as Blob;
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

  // DOCX Generation via backend (typed contract)
  generateDOCX: async (content: string, title: string) => {
    set({ isGenerating: true });
    try {
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      const filename = `${extractFilenameFromContent(content, title)}.docx`;
      const client = getContractsClient();
      const result = await client.exports.generateDocx({
        body: { content, title },
      });
      if (result.status !== 200) {
        throw new Error(`DOCX generation failed (HTTP ${result.status})`);
      }
      const blob = result.body as Blob;
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
  generateNotebookDOCX: async (
    content: string,
    title: string,
    citations: unknown[],
    sources?: unknown[]
  ) => {
    set({ isGenerating: true });
    try {
      const { extractFilenameFromContent } = await import('../../components/utils/titleExtractor');
      const filename = `${extractFilenameFromContent(content, title)}.docx`;
      const response = await apiClient.post<Blob>(
        '/exports/docx',
        {
          content,
          title,
          citations,
          sources,
        },
        {
          responseType: 'blob',
        }
      );
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
  },
}));
