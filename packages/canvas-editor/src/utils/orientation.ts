import { COARSE_POINTER, touchAnchorStyleFunc } from './touchInput';

import type Konva from 'konva';

/**
 * Drehen & Spiegeln: reine Geometrie.
 * Transform eines Knotens: translate(x,y) · rotate · scale · translate(-offset).
 */

export const ROTATION_SNAPS: readonly number[] = [0, 45, 90, 135, 180, 225, 270, 315];
export const ROTATION_SNAP_TOLERANCE = 5;

/** Wo der Drehgriff zuerst hin soll. */
export type RotaterPreference = 'above' | 'below';

/**
 * Maus: über dem Element. Finger: darunter, denn darüber steht die
 * `MobileSelectionPill` — und der Griff soll nicht unter dem Daumen-Ziel liegen.
 */
const ROTATER_PREFERENCE: RotaterPreference = COARSE_POINTER ? 'below' : 'above';

/** Mitte des Drehgriffs für `rotateAnchorAngle = angle`, in Bühnen-px (wie Konvas `getRotaterLine`). */
function rotaterPoint(tr: Konva.Transformer, angle: number): { x: number; y: number } {
  const width = tr.width();
  const height = tr.height();
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  // Nur 0/90/180/270 kommen vor: der Rand liegt eine halbe Höhe bzw. Breite entfernt.
  const edge = (Math.abs(dy) > 0.5 ? height : width) / 2;
  const reach = edge + tr.rotateAnchorOffset() + tr.padding();
  return tr.getAbsoluteTransform().point({ x: width / 2 + dx * reach, y: height / 2 + dy * reach });
}

/**
 * Seite des Drehgriffs: die bevorzugte (sichtbar oben bzw. unten), sonst die
 * andere, sonst eine Seite — die erste, deren Griff ganz auf der Bühne liegt.
 * Die Bühne ist die Seite; was darüber hinausragt, ist nicht greifbar.
 * „Oben" wird auf der Bühne gemessen, nicht in der Box: Konva dreht die Box
 * eines horizontal gespiegelten Knotens um 180°.
 */
export function chooseRotaterAngle(tr: Konva.Transformer, prefer: RotaterPreference): number {
  const stage = tr.getStage();
  if (!stage) return tr.rotateAnchorAngle();
  const margin = tr.anchorSize();
  const fits = (angle: number) => {
    const p = rotaterPoint(tr, angle);
    return (
      p.x >= margin &&
      p.y >= margin &&
      p.x <= stage.width() - margin &&
      p.y <= stage.height() - margin
    );
  };
  const [upper, lower] =
    rotaterPoint(tr, 0).y <= rotaterPoint(tr, 180).y + 0.5 ? [0, 180] : [180, 0];
  const order = prefer === 'above' ? [upper, lower, 90, 270] : [lower, upper, 90, 270];
  return order.find(fits) ?? order[0]!;
}

/**
 * Konva ruft das bei jedem Neuaufbau des Transformers für jeden Griff — beim
 * Anhängen, nach einem Zug und beim Verschieben (Konvas eigenes `update()` auf
 * `dragmove`; dann nur diese Rechnung, kein React-Zustand). Während eines
 * Drehens oder Skalierens wird nichts gewählt: der Griff bleibt, wo er gepackt wurde.
 */
export function elementAnchorStyleFunc(anchor: Konva.Shape): void {
  touchAnchorStyleFunc?.(anchor as Konva.Rect);
  if (!anchor.hasName('rotater')) return;
  const tr = anchor.getParent() as Konva.Transformer | null;
  if (!tr || !tr.rotateEnabled() || tr.isTransforming()) return;
  const angle = chooseRotaterAngle(tr, ROTATER_PREFERENCE);
  // Löst ein zweites update() aus, das hier mit gleichem Winkel endet.
  if (angle !== tr.rotateAnchorAngle()) tr.rotateAnchorAngle(angle);
}

/** Auf jeden Element-Transformer spreaden; `rotateEnabled` bleibt je Primitive. */
export const ELEMENT_TRANSFORMER = {
  // Veränderbare Kopie: Konvas Typ verlangt number[]; `as const` würde ein readonly-Tupel daraus machen.
  rotationSnaps: [...ROTATION_SNAPS] as number[],
  rotationSnapTolerance: ROTATION_SNAP_TOLERANCE,
  flipEnabled: false,
  anchorStyleFunc: elementAnchorStyleFunc,
} as const;

/**
 * Die sichtbaren Drehgriffe auf der Bühne, in Bühnen-px samt Treffer-Rand —
 * die `MobileSelectionPill` rechnet sie zur Auswahl und liegt so nie darüber.
 */
export function rotaterRects(stage: Konva.Stage): Box[] {
  const rects: Box[] = [];
  for (const tr of stage.find<Konva.Transformer>('Transformer')) {
    const rotater = tr.findOne<Konva.Rect>('.rotater');
    if (tr.nodes().length === 0 || !rotater?.isVisible()) continue;
    const r = rotater.getClientRect();
    const hit = rotater.hitStrokeWidth();
    const pad = typeof hit === 'number' ? hit / 2 : 0;
    rects.push({
      x: r.x - pad,
      y: r.y - pad,
      width: r.width + 2 * pad,
      height: r.height + 2 * pad,
    });
  }
  return rects;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeFrame {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** Box im Knotenraum (getClientRect mit skipTransform). */
  local: Box;
}

// Rundet auf 1e-6 und macht aus -0 eine 0.
const clean = (n: number): number => Math.round(n * 1e6) / 1e6 + 0;

export function normalizeRotation(deg: number): number {
  const r = deg % 360;
  const wrapped = r > 180 ? r - 360 : r <= -180 ? r + 360 : r;
  return clean(wrapped);
}

/**
 * Attribut eines Knotens, dessen Spiegelung in der eigenen Skala steckt (Formen;
 * Icon, Illustration und Asset spiegeln ihr Bild als Kind). Wert: gespeichertes `flipX`.
 *
 * Konvas Transformer zerlegt jede gespiegelte Matrix mit scaleX > 0
 * (`Transform.decompose`): aus Drehung θ mit scaleX < 0 wird θ + 180° mit
 * scaleY < 0 — dieselbe Matrix, aber `rotation()` liegt 180° daneben.
 */
export const MIRROR_X_ATTR = 'mirrorX';

/** Liegt der Knoten in Konvas Zerlegung statt in unserer (Vorzeichen von scaleX ≠ flipX)? */
function inKonvaForm(node: Konva.Node): boolean {
  const mirrorX: unknown = node.getAttr(MIRROR_X_ATTR);
  return typeof mirrorX === 'boolean' && node.scaleX() < 0 !== mirrorX;
}

/** Drehung in der Form, in der sie gespeichert wird — auch mitten im Transformer-Zug. */
export function nodeRotation(node: Konva.Node): number {
  return inKonvaForm(node) ? normalizeRotation(node.rotation() + 180) : node.rotation();
}

export function readNodeFrame(node: Konva.Node): NodeFrame {
  const local = node.getClientRect({ skipTransform: true, skipShadow: true, skipStroke: true });
  // R(θ + 180°) · diag(−sx, −sy) = R(θ) · diag(sx, sy): dieselbe Matrix in unserer Form.
  const sign = inKonvaForm(node) ? -1 : 1;
  return {
    x: node.x(),
    y: node.y(),
    rotation: nodeRotation(node),
    scaleX: sign * node.scaleX(),
    scaleY: sign * node.scaleY(),
    offsetX: node.offsetX(),
    offsetY: node.offsetY(),
    local: { x: local.x, y: local.y, width: local.width, height: local.height },
  };
}

const toStage = (
  f: NodeFrame,
  p: { x: number; y: number },
  rotation: number,
  scaleX: number,
  scaleY: number,
  origin: { x: number; y: number }
): { x: number; y: number } => {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = (p.x - f.offsetX) * scaleX;
  const sy = (p.y - f.offsetY) * scaleY;
  return { x: origin.x + sx * cos - sy * sin, y: origin.y + sx * sin + sy * cos };
};

const localCentre = (f: NodeFrame) => ({
  x: f.local.x + f.local.width / 2,
  y: f.local.y + f.local.height / 2,
});

export function centreOf(frame: NodeFrame): { x: number; y: number } {
  const c = toStage(frame, localCentre(frame), frame.rotation, frame.scaleX, frame.scaleY, frame);
  return { x: clean(c.x), y: clean(c.y) };
}

/** Neue x/y, damit die Mitte beim Drehen/Spiegeln auf dem Fleck bleibt. */
export function placeKeepingCentre(
  frame: NodeFrame,
  next: { rotation: number; scaleX?: number; scaleY?: number }
): { x: number; y: number } {
  const centre = centreOf(frame);
  const offset = toStage(
    frame,
    localCentre(frame),
    next.rotation,
    next.scaleX ?? frame.scaleX,
    next.scaleY ?? frame.scaleY,
    { x: 0, y: 0 }
  );
  return { x: clean(centre.x - offset.x), y: clean(centre.y - offset.y) };
}

/** Achsparallele Ausdehnung eines gedrehten Rahmens, relativ zum Knotenursprung. */
export interface Extent {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

// Modulweit, damit der Drag-Pfad nichts anlegt; gelesen wird es sofort nach dem Aufruf.
const extent: Extent = { minX: 0, minY: 0, width: 0, height: 0 };

/**
 * Box der vier gedrehten Ecken, relativ zu (frame.x, frame.y): der eine Kern
 * für Snapping und `axisAlignedBounds`. Ungerundet — bei 0° muss das Snapping
 * Bit für Bit dem alten Rechenweg entsprechen (Golden-Test in
 * `snapping.vitest.ts`) — und ohne Anlegen, weil es bei jedem `dragmove`
 * läuft. Liefert ein geteiltes Objekt, das der nächste Aufruf überschreibt.
 */
export function measureExtent(frame: NodeFrame): Readonly<Extent> {
  const rad = (frame.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x0 = (frame.local.x - frame.offsetX) * frame.scaleX;
  const x1 = (frame.local.x + frame.local.width - frame.offsetX) * frame.scaleX;
  const y0 = (frame.local.y - frame.offsetY) * frame.scaleY;
  const y1 = (frame.local.y + frame.local.height - frame.offsetY) * frame.scaleY;

  const ax = x0 * cos - y0 * sin;
  const bx = x1 * cos - y0 * sin;
  const cx = x1 * cos - y1 * sin;
  const dx = x0 * cos - y1 * sin;
  const ay = x0 * sin + y0 * cos;
  const by = x1 * sin + y0 * cos;
  const cy = x1 * sin + y1 * cos;
  const dy = x0 * sin + y1 * cos;

  const minX = Math.min(ax, bx, cx, dx);
  const minY = Math.min(ay, by, cy, dy);
  extent.minX = minX;
  extent.minY = minY;
  extent.width = Math.max(ax, bx, cx, dx) - minX;
  extent.height = Math.max(ay, by, cy, dy) - minY;
  return extent;
}

/** Sichtbare Box in Bühnen-px, auf 1e-6 gerundet — für Befehle, nicht für den Drag-Pfad. */
export function axisAlignedBounds(frame: NodeFrame): Box {
  const e = measureExtent(frame);
  return {
    x: clean(frame.x + e.minX),
    y: clean(frame.y + e.minY),
    width: clean(e.width),
    height: clean(e.height),
  };
}

export function signedScale(magnitude: number, flipped: boolean): number {
  const m = Math.abs(magnitude);
  return flipped ? -m : m;
}
