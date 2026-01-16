/**
 * Backend Canvas Export Hook
 * Uses the Free Canvas API for server-side rendering
 * Alternative to frontend Konva export for better quality and consistency
 */

import { useState, useCallback } from 'react';
import { exportFreeCanvas } from '../utils/canvasSerializer';
import type { FullCanvasConfig } from '../configs/types';

export interface UseBackendCanvasExportResult {
  exportViaBackend: () => Promise<string | null>;
  isExporting: boolean;
  error: string | null;
}

/**
 * Hook for backend canvas export via Free Canvas API
 * @param config - Canvas configuration
 * @param state - Current canvas state
 * @returns Export function, loading state, and error state
 */
export function useBackendCanvasExport<TState, TActions>(
  config: FullCanvasConfig<TState, TActions>,
  state: TState
): UseBackendCanvasExportResult {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportViaBackend = useCallback(async (): Promise<string | null> => {
    setIsExporting(true);
    setError(null);

    try {
      const result = await exportFreeCanvas(config as unknown as any, state as unknown as any);

      if (!result) {
        setError('Export failed: No image returned from API');
        return null;
      }

      setIsExporting(false);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Export failed: ${errorMessage}`);
      setIsExporting(false);
      return null;
    }
  }, [config, state]);

  return {
    exportViaBackend,
    isExporting,
    error,
  };
}
