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

import type { ExportOptions, ExportResult, ExportFormat } from '@gruenerator/shared/canvas-editor';
import type Konva from 'konva';

type StageRefGetter = () => Konva.Stage | null;

class CanvasRefRegistry {
  private stageRefs: Map<string, StageRefGetter> = new Map();
  private defaultCanvasId = 'default';

  /**
   * Register a stage ref getter for a canvas instance
   * @param canvasId - Unique identifier for the canvas (optional, uses 'default')
   * @param refGetter - Function that returns the Konva.Stage or null
   */
  setStageRef(canvasId: string | undefined, refGetter: StageRefGetter): void {
    this.stageRefs.set(canvasId ?? this.defaultCanvasId, refGetter);
  }

  /**
   * Get the Konva.Stage for a canvas instance
   * @param canvasId - Unique identifier for the canvas (optional, uses 'default')
   */
  getStage(canvasId?: string): Konva.Stage | null {
    const getter = this.stageRefs.get(canvasId ?? this.defaultCanvasId);
    return getter?.() ?? null;
  }

  /**
   * Export canvas to data URL
   * @param options - Export options (format, quality, pixelRatio)
   * @param canvasId - Canvas instance to export
   */
  exportCanvas(options: ExportOptions = { format: 'png' }, canvasId?: string): ExportResult | null {
    const stage = this.getStage(canvasId);
    if (!stage) {
      console.warn('[CanvasRefRegistry] No stage registered for export');
      return null;
    }

    const mimeType = `image/${options.format}` as `image/${ExportFormat}`;
    const pixelRatio = options.pixelRatio ?? 2;

    const dataUrl = stage.toDataURL({
      pixelRatio,
      mimeType,
      quality: options.quality,
    });

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
  unregister(canvasId?: string): void {
    this.stageRefs.delete(canvasId ?? this.defaultCanvasId);
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
