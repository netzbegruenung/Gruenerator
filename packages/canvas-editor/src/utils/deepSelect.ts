import Konva from 'konva';

/** Name and attribute (`canvasItemId`) of the Group `CanvasRenderLayer` wraps around every canvas item. */
export const CANVAS_ITEM_NAME = 'canvas-item';
export const CANVAS_ITEM_ID_ATTR = 'canvasItemId';

export interface ItemUnderPointer {
  id: string;
  /** The item's topmost shape at the point: firing a press on it is a press on the item. */
  shape: Konva.Shape;
}

function itemIdOf(shape: Konva.Shape): string | null {
  let node: Konva.Node | null = shape;
  while (node) {
    if (node instanceof Konva.Transformer) return null;
    const id: unknown = node.getAttr(CANVAS_ITEM_ID_ATTR);
    if (typeof id === 'string') return id;
    node = node.getParent();
  }
  return null;
}

/**
 * The box of an item's drawn body — its children other than the Transformer —
 * relative to `relativeTo`, else in absolute stage pixels. Null when the item
 * is not on the stage.
 */
export function itemBodyRect(
  root: Konva.Container,
  id: string,
  relativeTo?: Konva.Container
): { x: number; y: number; width: number; height: number } | null {
  const item = root.findOne<Konva.Group>(
    (node: Konva.Node) => node.getAttr(CANVAS_ITEM_ID_ATTR) === id
  );
  const rects = (item?.getChildren() ?? [])
    .filter((child) => !(child instanceof Konva.Transformer))
    .map((child) => child.getClientRect({ relativeTo }));
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * The canvas items under a stage point, topmost first, one entry per item.
 * Hit testing is Konva's own, so non-listening nodes and the clear part of a
 * scrim (its `hitFunc`) are left out as they are for a click.
 */
export function itemsUnderPointer(
  stage: Konva.Stage,
  pos: { x: number; y: number }
): ItemUnderPointer[] {
  const seen = new Set<string>();
  const items: ItemUnderPointer[] = [];
  // Konva lists them in tree order, i.e. bottom first.
  for (const shape of stage.getAllIntersections(pos).reverse()) {
    const id = itemIdOf(shape);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    items.push({ id, shape });
  }
  return items;
}

/**
 * The item a ctrl/⌘-click picks: the one below the selection, wrapping round
 * to the top. Without a selection under the pointer, the one below the top.
 */
export function nextDeepTarget<T extends { id: string }>(
  stack: readonly T[],
  selectedId: string | null
): T | null {
  if (stack.length === 0) return null;
  const at = stack.findIndex((item) => item.id === selectedId);
  return stack[(Math.max(at, 0) + 1) % stack.length]!;
}
