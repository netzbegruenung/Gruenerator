import type { CanvasStageRef } from '../primitives/CanvasStage';
import type { ExportOptions } from '@gruenerator/shared/canvas-editor';
import type Konva from 'konva';

/**
 * Runs `capture` with all selection chrome on the stage hidden — Konva
 * Transformers plus the dashed selection Rects primitives render alongside
 * them (tagged `name="selection-chrome"`). Callers don't have to mutate the
 * user's selection (or wait for a deselect re-render) to get a clean shot;
 * exactly the nodes that were hidden are restored.
 */
export function withSelectionChromeHidden<T>(stage: Konva.Stage | null, capture: () => T): T {
  const hidden = stage
    ? [...stage.find('Transformer'), ...stage.find('.selection-chrome')].filter((node) =>
        node.visible()
      )
    : [];
  if (hidden.length === 0 || !stage) return capture();
  hidden.forEach((node) => node.hide());
  stage.draw();
  try {
    return capture();
  } finally {
    hidden.forEach((node) => node.show());
    stage.draw();
  }
}

/**
 * The one stage-image capture used by auto-save (debounced and unmount
 * flush), the imperative captureCanvas/captureCanvasForAi handles, and any
 * future export path. Never throws; returns null when the stage is gone
 * (e.g. capture during teardown).
 *
 * Hiding the selection chrome is CanvasStage.toDataURL's job — every export
 * goes through it, so wrapping again here would only be a no-op.
 */
export function captureStageImage(
  stageApi: CanvasStageRef | null,
  options: Partial<ExportOptions> = {}
): string | null {
  if (!stageApi) return null;
  try {
    return stageApi.toDataURL({ format: 'png', pixelRatio: 2, ...options }) ?? null;
  } catch {
    return null;
  }
}

/**
 * captureStageImage without the synchronous encode: the scene is rendered on
 * the spot, the PNG is encoded off the main thread. For captures that nobody
 * waits on frame-by-frame (gallery snapshots, share, multi-page export).
 */
export async function captureStageImageAsync(
  stageApi: CanvasStageRef | null,
  options: Partial<ExportOptions> = {}
): Promise<string | null> {
  if (!stageApi) return null;
  try {
    return await stageApi.toDataURLAsync({ format: 'png', pixelRatio: 2, ...options });
  } catch {
    return null;
  }
}
