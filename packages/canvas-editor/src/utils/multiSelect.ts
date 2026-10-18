import Konva from 'konva';

import { CANVAS_ITEM_ID_ATTR, CANVAS_ITEM_NAME } from './deepSelect';

/** Name des gemeinsamen Transformers, der bei Mehrfachauswahl alle Elemente umfasst. */
export const MULTI_SELECTION_TRANSFORMER_NAME = 'multi-selection-transformer';

/** Farbe von Auswahlrahmen, Transformer-Rand und Element-Umrissen. */
export const SELECTION_COLOR = 'rgb(0, 161, 255)';

/**
 * Umriss eines ausgewählten (oder vom Rahmen getroffenen) Elements. Heißt
 * `selection-chrome`, damit der Export ihn ausblendet.
 */
export function createSelectionOutline(): Konva.Rect {
  return new Konva.Rect({
    name: 'selection-chrome',
    stroke: SELECTION_COLOR,
    strokeWidth: 1,
    strokeScaleEnabled: false,
    listening: false,
  });
}

/** Legt je Knoten einen Umriss über dessen Umriss, überzählige werden ausgeblendet. */
export function syncOutlines(
  layer: Konva.Layer,
  outlines: Konva.Rect[],
  nodes: readonly Konva.Node[]
): void {
  nodes.forEach((node, i) => {
    let outline = outlines[i];
    if (!outline) {
      outline = createSelectionOutline();
      outlines.push(outline);
      layer.add(outline);
    }
    outline.setAttrs({ ...node.getClientRect({ relativeTo: layer }), visible: true });
    outline.moveToTop();
  });
  for (let i = nodes.length; i < outlines.length; i++) outlines[i]!.visible(false);
}

function insideTransformer(node: Konva.Node): boolean {
  return !!node.findAncestor((n: Konva.Node) => n instanceof Konva.Transformer);
}

/**
 * Der ziehbare Knoten eines Canvas-Elements — derselbe, an den sein eigener
 * Transformer hängt. Gesperrte Elemente und Hintergründe haben keinen.
 */
function dragNodeOfItem(item: Konva.Group): Konva.Node | null {
  if (item.draggable()) return item;
  return (
    item.findOne<Konva.Node>(
      (node: Konva.Node): boolean =>
        node.draggable() === true && node.isVisible() === true && !insideTransformer(node)
    ) ?? null
  );
}

function canvasItems(root: Konva.Container): Konva.Group[] {
  return root.find<Konva.Group>(`.${CANVAS_ITEM_NAME}`);
}

function itemId(item: Konva.Group): string | null {
  const id: unknown = item.getAttr(CANVAS_ITEM_ID_ATTR);
  return typeof id === 'string' ? id : null;
}

/** Die ziehbaren Knoten zu den ausgewählten Ids, in Auswahlreihenfolge. */
export function findDragNodes(root: Konva.Container, ids: readonly string[]): Konva.Node[] {
  const byId = new Map<string, Konva.Group>();
  for (const item of canvasItems(root)) {
    const id = itemId(item);
    if (id !== null) byId.set(id, item);
  }
  const nodes: Konva.Node[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    const node = item ? dragNodeOfItem(item) : null;
    if (node) nodes.push(node);
  }
  return nodes;
}

/** Was „Alles auswählen“ nimmt: jedes ziehbare Element, wie ein Rahmen über die ganze Fläche. */
export function selectableItemIds(root: Konva.Container): string[] {
  const ids: string[] = [];
  for (const item of canvasItems(root)) {
    const id = itemId(item);
    if (id !== null && dragNodeOfItem(item)) ids.push(id);
  }
  return ids;
}

/** Alle ziehbaren Elemente, deren Umriss das Rechteck (Bühnenkoordinaten) schneidet. */
export function itemsInRect(
  root: Konva.Container,
  rect: { x: number; y: number; width: number; height: number }
): Array<{ id: string; node: Konva.Node }> {
  const hits: Array<{ id: string; node: Konva.Node }> = [];
  for (const item of canvasItems(root)) {
    const id = itemId(item);
    const node = dragNodeOfItem(item);
    if (id === null || !node) continue;
    if (Konva.Util.haveIntersection(rect, node.getClientRect())) hits.push({ id, node });
  }
  return hits;
}

/**
 * Zieht der Knoten gerade als Teil einer Mehrfachauswahl? Dann darf er nicht
 * einzeln einrasten — Konva bewegt alle Knoten des Transformers gemeinsam, und
 * ein einzeln gesnappter Knoten risse aus der Gruppe aus.
 */
export function isGroupDrag(node: Konva.Node): boolean {
  const transformer = node
    .getLayer()
    ?.findOne<Konva.Transformer>(`.${MULTI_SELECTION_TRANSFORMER_NAME}`);
  if (!transformer) return false;
  const nodes = transformer.nodes();
  return nodes.length > 1 && nodes.includes(node);
}

/**
 * Darf ein Druck auf `target` einen Auswahlrahmen beginnen? Ja auf der leeren
 * Bühne und auf allem, was sich nicht ziehen lässt (Hintergrundbild, Fläche) —
 * nicht auf Elementen und nicht auf Transformer-Ankern.
 */
export function canStartMarquee(target: Konva.Node): boolean {
  if (target instanceof Konva.Stage) return true;
  if (insideTransformer(target)) return false;
  let node: Konva.Node | null = target;
  while (node && !(node instanceof Konva.Stage)) {
    if (node.draggable()) return false;
    node = node.getParent();
  }
  return true;
}
