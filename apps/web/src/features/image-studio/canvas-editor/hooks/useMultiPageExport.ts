/**
 * useMultiPageExport - Coordinates batch export for multi-page canvases
 *
 * Collects PNG data URLs from multiple canvas refs and sends to backend
 * for ZIP generation. Handles progress tracking and error states.
 */

import { useState, useCallback, type RefObject } from 'react';

import type { GenericCanvasRef } from '../components/GenericCanvas';

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface UseMultiPageExportProps {
  canvasRefs: RefObject<GenericCanvasRef | null>[];
  canvasType: string;
}

export interface ExportProgress {
  current: number;
  total: number;
}

export interface UseMultiPageExportReturn {
  exportAllPages: () => Promise<string[]>;
  downloadAllAsZip: () => Promise<void>;
  isExporting: boolean;
  exportProgress: ExportProgress;
  error: string | null;
}

export function useMultiPageExport({
  canvasRefs,
  canvasType,
}: UseMultiPageExportProps): UseMultiPageExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const exportAllPages = useCallback(async (): Promise<string[]> => {
    const total = canvasRefs.length;
    const images: string[] = [];

    setExportProgress({ current: 0, total });

    for (let i = 0; i < canvasRefs.length; i++) {
      const ref = canvasRefs[i];
      if (ref.current) {
        const dataUrl = ref.current.toDataURL({ format: 'png', pixelRatio: 2 });
        if (dataUrl) {
          images.push(dataUrl);
        }
      }
      setExportProgress({ current: i + 1, total });
    }

    return images;
  }, [canvasRefs]);

  const downloadAllAsZip = useCallback(async (): Promise<void> => {
    if (canvasRefs.length === 0) {
      setError('Keine Seiten zum Exportieren');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // Capture all canvas images
      const images = await exportAllPages();

      if (images.length === 0) {
        throw new Error('Keine Bilder konnten exportiert werden');
      }

      // Send to backend for ZIP creation
      const response = await fetch(`${API_BASE}/api/exports/zip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images,
          canvasType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `ZIP-Export fehlgeschlagen (${response.status})`);
      }

      // Download the ZIP file
      const blob = await response.blob();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const filename = `gruenerator-${canvasType}-${timestamp}.zip`;

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler beim ZIP-Export';
      setError(message);
      console.error('[useMultiPageExport] ZIP download failed:', err);
    } finally {
      setIsExporting(false);
      setExportProgress({ current: 0, total: 0 });
    }
  }, [canvasRefs, canvasType, exportAllPages]);

  return {
    exportAllPages,
    downloadAllAsZip,
    isExporting,
    exportProgress,
    error,
  };
}
