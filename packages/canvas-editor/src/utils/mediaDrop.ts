import type Konva from 'konva';

/** Drag type of an upload tile; the payload is `MediaDragPayload` as JSON. */
export const MEDIA_DRAG_TYPE = 'application/x-gruenerator-media';

export interface MediaDragPayload {
  /** A durable URL (`buildPlacementUrl`), never a `blob:`. */
  url: string;
  name: string;
}

export function isMediaDrag(dataTransfer: DataTransfer | null): boolean {
  return !!dataTransfer && Array.from(dataTransfer.types).includes(MEDIA_DRAG_TYPE);
}

export function readMediaDrag(dataTransfer: DataTransfer | null): MediaDragPayload | null {
  const raw = dataTransfer?.getData(MEDIA_DRAG_TYPE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<MediaDragPayload>;
    return typeof parsed.url === 'string' && parsed.url && !parsed.url.startsWith('blob:')
      ? { url: parsed.url, name: typeof parsed.name === 'string' ? parsed.name : 'bild' }
      : null;
  } catch {
    return null;
  }
}

/**
 * Where a DOM drop lands on a page: the point in the template's reference space
 * (instances live there, inside the logical-scale Group) and the frame under it,
 * if any. Konva undoes the CSS zoom itself; `logicalScale` is format width over
 * reference width (CanvasStage's Group).
 */
export function locateDrop(
  stage: Konva.Stage,
  evt: { clientX: number; clientY: number },
  logicalScale: number
): { point: { x: number; y: number }; frameId: string | null } | null {
  stage.setPointersPositions(evt as unknown as Event);
  const pointer = stage.getPointerPosition();
  const relative = stage.getRelativePointerPosition();
  if (!pointer || !relative) return null;
  const hit = stage.getIntersection(pointer);
  const frame = hit?.findAncestor((n: Konva.Node) => n.name().startsWith('frame-'), true);
  return {
    point: { x: relative.x / logicalScale, y: relative.y / logicalScale },
    frameId: frame ? frame.name().slice('frame-'.length) : null,
  };
}
