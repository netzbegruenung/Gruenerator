/**
 * Canvas Editor Ref Registry
 * Manages non-serializable Konva refs outside of Zustand store
 *
 * Konva nodes (Stage, Layer, etc.) cannot be stored in Zustand because:
 * 1. They contain circular references
 * 2. They're not serializable
 * 3. Storing them would cause unnecessary re-renders
 *
 * This registry provides a centralized way to access Konva nodes
 * for operations like export, that need direct stage access.
 */

import { withSelectionChromeHidden } from '../utils/captureStage';

import type { ExportOptions, ExportResult, ExportFormat } from '@gruenerator/shared/canvas-editor';
import type Konva from 'konva';

type StageRefGetter = () => Konva.Stage | null;

class CanvasRefRegistry {
  private stageRefs: Map<string, StageRefGetter> = new Map();

  /**
   * Register a stage ref getter for a canvas instance
   * @param canvasId - Unique identifier for the canvas (e.g., config.id)
   * @param refGetter - Function that returns the Konva.Stage or null
   */
  setStageRef(canvasId: string, refGetter: StageRefGetter): void {
    if (process.env.NODE_ENV !== 'production' && this.stageRefs.has(canvasId)) {
      console.warn(
        `[CanvasRefRegistry] Overwriting existing stage ref for canvasId="${canvasId}". ` +
          'This may indicate two canvas instances sharing the same ID.'
      );
    }
    this.stageRefs.set(canvasId, refGetter);
  }

  /**
   * Get the Konva.Stage for a canvas instance
   * @param canvasId - Unique identifier for the canvas
   */
  getStage(canvasId: string): Konva.Stage | null {
    const getter = this.stageRefs.get(canvasId);
    return getter?.() ?? null;
  }

  /**
   * Export canvas to data URL
   * @param canvasId - Canvas instance to export
   * @param options - Export options (format, quality, pixelRatio)
   */
  exportCanvas(canvasId: string, options: ExportOptions = { format: 'png' }): ExportResult | null {
    const stage = this.getStage(canvasId);
    if (!stage) {
      console.warn(`[CanvasRefRegistry] No stage registered for canvasId="${canvasId}"`);
      return null;
    }

    const mimeType = `image/${options.format}` as `image/${ExportFormat}`;
    const pixelRatio = options.pixelRatio ?? 2;

    const dataUrl = withSelectionChromeHidden(stage, () =>
      stage.toDataURL({
        pixelRatio,
        mimeType,
        quality: options.quality,
      })
    );

    return {
      dataUrl,
      width: stage.width() * pixelRatio,
      height: stage.height() * pixelRatio,
      format: options.format,
    };
  }

  /**
   * Unregister a stage ref
   * @param canvasId - Canvas instance to unregister
   */
  unregister(canvasId: string): void {
    this.stageRefs.delete(canvasId);
  }

  /**
   * Clear all registered refs
   */
  clear(): void {
    this.stageRefs.clear();
  }
}

// Singleton instance
export const canvasRefRegistry = new CanvasRefRegistry();

// Export class for testing
export { CanvasRefRegistry };
