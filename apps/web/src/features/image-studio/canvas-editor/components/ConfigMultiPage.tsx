/**
 * ConfigMultiPage - Generic multi-page wrapper for any config-driven canvas
 *
 * Renders all pages stacked vertically (scrollable), no pagination.
 * Works with any canvas type that has multiPage.enabled in its config.
 * Supports batch export of all pages as a ZIP file.
 */

import React, { useCallback, useRef, useMemo, useEffect } from 'react';

import { useMultiPageCanvas, useMultiPageExport } from '../hooks';

import { GenericCanvas } from './GenericCanvas';

import type { GenericCanvasRef } from './GenericCanvas';
import type { FullCanvasConfig } from '../configs/types';
import './ConfigMultiPage.css';

interface ConfigMultiPageProps {
  config: FullCanvasConfig;
  canvasType: string;
  initialProps: Record<string, unknown>;
  onExport: (base64: string) => void;
  onCancel: () => void;
  callbacks?: Record<string, (val: unknown) => void>;
}

export function ConfigMultiPage({
  config,
  canvasType,
  initialProps,
  onExport,
  onCancel,
  callbacks = {},
}: ConfigMultiPageProps) {
  const { pages, addPage, removePage, canAddMore, pageCount } = useMultiPageCanvas({
    config,
    initialProps,
    maxPages: config.multiPage?.maxPages ?? 10,
  });

  // Create refs array for all canvas instances
  const canvasRefsRef = useRef<React.RefObject<GenericCanvasRef | null>[]>([]);

  // Ensure we have the right number of refs for the current pages
  useEffect(() => {
    const currentLength = canvasRefsRef.current.length;
    if (currentLength < pages.length) {
      // Add new refs
      for (let i = currentLength; i < pages.length; i++) {
        canvasRefsRef.current.push(React.createRef<GenericCanvasRef>());
      }
    }
    // Note: We don't remove refs when pages are removed to avoid ref instability
  }, [pages.length]);

  // Get stable refs array for the hook
  const canvasRefs = useMemo(() => {
    return canvasRefsRef.current.slice(0, pages.length);
  }, [pages.length]);

  // Multi-page export hook
  const {
    downloadAllAsZip,
    isExporting: isMultiExporting,
    exportProgress,
  } = useMultiPageExport({
    canvasRefs,
    canvasType,
  });

  const handleExport = useCallback(
    (base64: string, _pageIndex: number) => {
      onExport(base64);
    },
    [onExport]
  );

  // Multi-page export props - only passed to first canvas so button appears once
  const multiPageExportProps = useMemo(
    () => ({
      pageCount,
      onDownloadAllZip: downloadAllAsZip,
      isExporting: isMultiExporting,
      exportProgress,
    }),
    [pageCount, downloadAllAsZip, isMultiExporting, exportProgress]
  );

  return (
    <div className="config-multipage" data-canvas-type={canvasType}>
      {pages.map((page, index) => (
        <div key={page.id} className="config-multipage__page">
          <GenericCanvas
            forwardedRef={canvasRefsRef.current[index]}
            key={page.id}
            config={config}
            initialProps={page.state}
            onExport={(base64) => handleExport(base64, index)}
            onCancel={onCancel}
            callbacks={callbacks}
            onAddPage={index === pages.length - 1 && canAddMore ? addPage : undefined}
            bare={false}
            onDelete={pageCount > 1 && index > 0 ? () => removePage(page.id) : undefined}
            multiPageExport={index === 0 ? multiPageExportProps : undefined}
          />
        </div>
      ))}
    </div>
  );
}

export default ConfigMultiPage;
