import { CANVAS_ITEM_NAME } from './deepSelect';

import type { CanvasStageRef } from '../primitives/CanvasStage';
import type { ExportOptions } from '../types/editorTypes';
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

/**
 * One element alone as PNG, for the PPTX export: the `canvas-item` group
 * `CanvasRenderLayer` wraps around it, rendered over its axis-aligned box.
 * Rotation, opacity and shadow are in the picture; the box comes back in
 * page px (the stage is shown scaled). Null when no group carries the id
 * or the canvas cannot be read (cross-origin image).
 */
export function rasterizeStageElement(
  stage: Konva.Stage | null,
  elementId: string,
  pixelRatio = 2
): { dataUrl: string; box: { x: number; y: number; width: number; height: number } } | null {
  if (!stage) return null;
  const node = stage
    .find(`.${CANVAS_ITEM_NAME}`)
    .find((candidate) => candidate.getAttr('canvasItemId') === elementId);
  if (!node || !node.isVisible()) return null;
  // Absolut (inkl. Zoom und Verschiebung des Stage) für toDataURL, das in
  // diesen Koordinaten schneidet; relativ zum Stage = Seiten-px für die Box.
  const rect = node.getClientRect();
  const box = node.getClientRect({ relativeTo: stage });
  if (rect.width <= 0 || rect.height <= 0 || box.width <= 0) return null;
  const scale = rect.width / box.width;
  let dataUrl: string;
  try {
    dataUrl = withSelectionChromeHidden(stage, () =>
      node.toDataURL({ ...rect, pixelRatio: pixelRatio / scale, mimeType: 'image/png' })
    );
  } catch {
    // Ein fremdes Bild ohne CORS macht die Leinwand „tainted“: toDataURL wirft
    // SecurityError. Das Element fehlt dann im Export (der Writer meldet es),
    // statt ihn abzubrechen.
    return null;
  }
  return {
    dataUrl,
    box: { x: box.x, y: box.y, width: box.width, height: box.height },
  };
}

/** A bullet or arrow glyph alone carries nothing a reader needs. */
const BULLET_ONLY = /^[•·●○▪■◦‣–—\-→➜➔►▶▸]+$/;

/**
 * The texts a page shows, one entry per text element, roughly in reading
 * order (top to bottom, then left to right). A rich text block draws one node
 * per run; its runs are joined back into the block's text (the runs keep
 * their spaces, so they join without a separator). Selection chrome
 * and hidden nodes are skipped — the same view an export shows.
 */
export function visibleStageTexts(stage: Konva.Stage | null): string[] {
  if (!stage) return [];
  const blocks = new Map<Konva.Node, Konva.Text[]>();
  for (const node of stage.find<Konva.Text>('Text, TextPath')) {
    if (!node.isVisible() || node.getAbsoluteOpacity() === 0) continue;
    if (node.findAncestor('Transformer') || node.findAncestor('.selection-chrome')) continue;
    const text = node.text().trim();
    if (!text || BULLET_ONLY.test(text)) continue;
    // A text element carries its own id; the runs of a rich text block, the
    // lines of a Balken and a badge's label do not — their group does.
    const parent = node.getParent();
    const key = !node.id() && parent?.id() ? parent : node;
    const runs = blocks.get(key) ?? [];
    runs.push(node);
    blocks.set(key, runs);
  }

  const byPosition = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.y - b.y) > 1 ? a.y - b.y : a.x - b.x;

  return [...blocks.entries()]
    .map(([block, runs]) => {
      const text = runs
        .map((run) => ({ ...run.position(), text: run.text() }))
        .sort(byPosition)
        .reduce((acc, run, i, all) => {
          const sameLine = i > 0 && Math.abs(all[i - 1].y - run.y) <= 1;
          return i === 0 ? run.text : acc + (sameLine ? '' : ' ') + run.text;
        }, '')
        .replace(/\s+/g, ' ')
        .trim();
      return { ...block.getClientRect({ relativeTo: stage }), text };
    })
    .sort(byPosition)
    .map((block) => block.text);
}
