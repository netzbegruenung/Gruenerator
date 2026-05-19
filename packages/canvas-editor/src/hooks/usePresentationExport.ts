/**
 * usePresentationExport - Export presentation slides as PPTX or PDF
 *
 * PPTX: Client-side via pptxgenjs — native editable text + decoration PNG overlay
 * PDF: Captures all slides as high-res PNGs, sends to backend /api/exports/pdf-slides
 * ZIP: Reuses existing multi-page ZIP export
 */

import { useState, useCallback, type RefObject } from 'react';

import { useCanvasEditorServices } from '../CanvasEditorProvider';

import type { GenericCanvasRef } from '../components/GenericCanvas';
import type { HeterogeneousPage } from '../configs/types';

export interface ExportProgress {
  current: number;
  total: number;
  phase: 'capturing' | 'generating' | 'done';
}

export interface UsePresentationExportReturn {
  exportAsPptx: () => Promise<void>;
  exportAsPdf: () => Promise<void>;
  exportAsPngZip: () => Promise<void>;
  isExporting: boolean;
  exportProgress: ExportProgress;
  error: string | null;
}

export function usePresentationExport(
  pages: HeterogeneousPage[],
  canvasRefs: RefObject<GenericCanvasRef | null>[]
): UsePresentationExportReturn {
  const { apiBaseUrl: API_BASE = '' } = useCanvasEditorServices();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({
    current: 0,
    total: 0,
    phase: 'capturing',
  });
  const [error, setError] = useState<string | null>(null);

  const captureAllPages = useCallback(async (): Promise<string[]> => {
    const total = canvasRefs.length;
    const images: string[] = [];

    setExportProgress({ current: 0, total, phase: 'capturing' });

    for (let i = 0; i < canvasRefs.length; i++) {
      const ref = canvasRefs[i];
      if (ref.current) {
        const dataUrl = await ref.current.captureCanvas();
        if (dataUrl) {
          images.push(dataUrl);
        }
      }
      setExportProgress({ current: i + 1, total, phase: 'capturing' });
    }

    return images;
  }, [canvasRefs]);

  // ─── PPTX Export (client-side, editable text) ───
  const exportAsPptx = useCallback(async () => {
    if (pages.length === 0) {
      setError('Keine Folien zum Exportieren');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      // Capture decoration layers (shapes, icons, badges) as PNG overlays
      const decorationImages = await captureAllPages();

      setExportProgress({ current: 0, total: pages.length, phase: 'generating' });

      // Dynamic import to keep pptxgenjs out of the main bundle
      const { exportSlidesToPptx } = await import('../utils/pptxExport');

      await exportSlidesToPptx(pages, decorationImages, {
        title: 'Grünerator Präsentation',
      });

      setExportProgress({ current: pages.length, total: pages.length, phase: 'done' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PPTX-Export fehlgeschlagen';
      setError(msg);
      console.error('[usePresentationExport] PPTX export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [pages, captureAllPages]);

  // ─── PDF Export (backend, high-res PNGs → pdf-lib) ───
  const exportAsPdf = useCallback(async () => {
    if (pages.length === 0) {
      setError('Keine Folien zum Exportieren');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const images = await captureAllPages();

      setExportProgress({ current: 0, total: 1, phase: 'generating' });

      const response = await fetch(`${API_BASE}/api/exports/pdf-slides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ images, title: 'Grünerator Präsentation' }),
      });

      if (!response.ok) {
        throw new Error(`PDF-Export fehlgeschlagen (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'Praesentation.pdf';
      link.click();
      URL.revokeObjectURL(url);

      setExportProgress({ current: 1, total: 1, phase: 'done' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF-Export fehlgeschlagen';
      setError(msg);
      console.error('[usePresentationExport] PDF export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [pages, captureAllPages, API_BASE]);

  // ─── PNG ZIP Export (reuses existing pattern) ───
  const exportAsPngZip = useCallback(async () => {
    if (pages.length === 0) {
      setError('Keine Folien zum Exportieren');
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const images = await captureAllPages();

      setExportProgress({ current: 0, total: 1, phase: 'generating' });

      const response = await fetch(`${API_BASE}/api/exports/zip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ images, canvasType: 'presentation' }),
      });

      if (!response.ok) {
        throw new Error(`ZIP-Export fehlgeschlagen (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'Praesentation.zip';
      link.click();
      URL.revokeObjectURL(url);

      setExportProgress({ current: 1, total: 1, phase: 'done' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ZIP-Export fehlgeschlagen';
      setError(msg);
      console.error('[usePresentationExport] ZIP export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [pages, captureAllPages, API_BASE]);

  return {
    exportAsPptx,
    exportAsPdf,
    exportAsPngZip,
    isExporting,
    exportProgress,
    error,
  };
}
