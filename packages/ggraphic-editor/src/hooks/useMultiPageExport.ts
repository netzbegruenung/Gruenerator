// SPDX-License-Identifier: MPL-2.0
/**
 * useMultiPageExport - Coordinates batch export for multi-page canvases
 *
 * Collects page images (PNG unless another format is asked for) from multiple
 * canvas refs and packs them into a ZIP in the browser. Handles progress
 * tracking and error states.
 */

import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';

import { messages } from '@ggraphic/editor/i18n/messages';
import { type ExportFormat } from '@ggraphic/editor/types/editorTypes';
import { isDownloadTooLarge } from '@ggraphic/editor/utils/downloadError';
import { zipPageImages } from '@ggraphic/editor/utils/zipPageImages';

import { useCanvasEditorServices } from '../CanvasEditorProvider';
import { browserFileDelivery } from '../hostServices';

import type { GenericCanvasRef } from '../components/GenericCanvas';

const NOTICE_LIFETIME_MS = 5000;

export interface UseMultiPageExportProps {
  canvasRefs: RefObject<GenericCanvasRef | null>[];
  canvasType: string;
}

export interface ExportProgress {
  current: number;
  total: number;
}

export interface UseMultiPageExportReturn {
  exportAllPages: (options?: { pixelRatio?: number; format?: ExportFormat }) => Promise<string[]>;
  downloadAllAsZip: (format?: ExportFormat) => Promise<void>;
  isExporting: boolean;
  exportProgress: ExportProgress;
  error: string | null;
  notice: string | null;
}

export function useMultiPageExport({
  canvasRefs,
  canvasType,
}: UseMultiPageExportProps): UseMultiPageExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress>({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { fileDelivery = browserFileDelivery } = useCanvasEditorServices();
  const prefix = fileDelivery.filenamePrefix ?? 'ggraphic';

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // A page whose stage is not mounted or whose capture fails must surface as
  // an error, not silently shrink the export — a ZIP with fewer images than
  // pages reads as data loss.
  const exportAllPages = useCallback(
    async (options?: { pixelRatio?: number; format?: ExportFormat }): Promise<string[]> => {
      const total = canvasRefs.length;
      const images: string[] = [];
      const failedPages: number[] = [];

      setExportProgress({ current: 0, total });

      for (let i = 0; i < canvasRefs.length; i++) {
        const ref = canvasRefs[i];
        let dataUrl: string | null = null;
        if (ref.current) {
          try {
            dataUrl = await ref.current.captureCanvas(options);
          } catch {
            dataUrl = null;
          }
        }
        if (dataUrl) {
          images.push(dataUrl);
        } else {
          failedPages.push(i + 1);
        }
        setExportProgress({ current: i + 1, total });
      }

      if (failedPages.length > 0) {
        throw new Error(messages().errors.pagesExport(failedPages.join(', ')));
      }

      return images;
    },
    [canvasRefs]
  );

  const downloadAllAsZip = useCallback(
    async (format: ExportFormat = 'png') => {
      if (canvasRefs.length === 0) {
        setError(messages().errors.noPagesToExport);
        return;
      }

      setIsExporting(true);
      setError(null);
      clearTimeout(noticeTimer.current);
      setNotice(null);

      try {
        // Capture all canvas images
        const images = await exportAllPages({ format });

        if (images.length === 0) {
          throw new Error(messages().errors.noImagesExported);
        }

        const blob = zipPageImages(images);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${prefix}-${canvasType}-${timestamp}.zip`;

        try {
          await fileDelivery.downloadBlob(blob, filename);
        } catch (err) {
          if (!isDownloadTooLarge(err)) throw err;
          // A payload the bridge refuses (any other failure lands in setError
          // below): the pages are smaller than their ZIP, so send them one by one.
          let sent = 0;
          try {
            for (let i = 0; i < images.length; i++) {
              setNotice(messages().export.sending(i + 1, images.length));
              await fileDelivery.downloadDataUrl(
                images[i],
                `${prefix}-${canvasType}-seite-${i + 1}.${format === 'jpeg' ? 'jpg' : format}`
              );
              sent = i + 1;
            }
          } catch (pageErr) {
            setNotice(sent === 0 ? null : messages().export.partlySent(sent));
            throw pageErr;
          }
          setNotice(messages().export.allSent);
          noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_LIFETIME_MS);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : messages().errors.zipUnknown;
        setError(message);
        console.error('[useMultiPageExport] ZIP download failed:', err);
      } finally {
        setIsExporting(false);
        setExportProgress({ current: 0, total: 0 });
      }
    },
    [canvasRefs, canvasType, exportAllPages, fileDelivery, prefix]
  );

  return {
    exportAllPages,
    downloadAllAsZip,
    isExporting,
    exportProgress,
    error,
    notice,
  };
}
