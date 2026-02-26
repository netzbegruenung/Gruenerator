import { useMemo, useCallback } from 'react';
import { FaFileWord, FaFilePdf } from 'react-icons/fa6';

import { useExportStore } from '../stores/core/exportStore';
import useGeneratedTextStore from '../stores/core/generatedTextStore';
import { type CustomExportOption } from '../types/baseform';

/**
 * Reusable hook that provides DOCX/PDF export options for a background document
 * stored in generatedTextMetadata. Any generator that returns a backgroundDocument
 * can use this hook by storing it in metadata and passing the result to BaseForm's
 * customExportOptions prop.
 */
export function useBackgroundDocumentExport(componentName: string): CustomExportOption[] {
  const metadata = useGeneratedTextStore((state) => state.generatedTextMetadata[componentName]) as {
    backgroundDocument?: string;
  } | null;

  const backgroundDocument = metadata?.backgroundDocument || '';
  const { generateDOCX, generatePDF } = useExportStore();

  const handleDOCX = useCallback(async () => {
    if (!backgroundDocument) return;
    await generateDOCX(backgroundDocument, 'Hintergrundpapier');
  }, [backgroundDocument, generateDOCX]);

  const handlePDF = useCallback(async () => {
    if (!backgroundDocument) return;
    await generatePDF(backgroundDocument, 'Hintergrundpapier');
  }, [backgroundDocument, generatePDF]);

  return useMemo(() => {
    if (!backgroundDocument) return [];
    return [
      {
        id: 'background-docx',
        label: 'Hintergrundpapier',
        subtitle: 'Recherche als Word',
        icon: <FaFileWord size={16} />,
        onClick: handleDOCX,
      },
      {
        id: 'background-pdf',
        label: 'Hintergrundpapier',
        subtitle: 'Recherche als PDF',
        icon: <FaFilePdf size={16} />,
        onClick: handlePDF,
      },
    ];
  }, [backgroundDocument, handleDOCX, handlePDF]);
}
