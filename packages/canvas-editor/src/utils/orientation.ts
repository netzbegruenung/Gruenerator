import { CANVAS_ITEM_NAME } from './deepSelect';
import { SELECTION_COLOR } from './multiSelect';
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
 * Unter dem Element (Canva-Muster): darüber stehen am Desktop die schwebende
 * Leiste und am Touch-Gerät die `MobileSelectionPill`.
 */
const ROTATER_PREFERENCE: RotaterPreference = 'below';

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
 * Der sichtbare Teil der Bühne, in Bühnen-px: Fenster und jeder abschneidende
 * Vorfahr kappen, was darüber hinausragt. Gezoomt reicht die Seite am Handy
 * unter die Werkzeugleiste — dort endet die scrollende Seitenfläche, und ein
 * Griff darunter ist nicht greifbar. Ohne Layout (Test-DOM) die ganze Bühne.
 */
function visibleStageBox(stage: Konva.Stage): Box {
  const container = stage.container();
  const c = container.getBoundingClientRect();
  if (c.width === 0 || c.height === 0) {
    return { x: 0, y: 0, width: stage.width(), height: stage.height() };
  }
  let left = Math.max(c.left, 0);
  let top = Math.max(c.top, 0);
  let right = Math.min(c.right, window.innerWidth);
  let bottom = Math.min(c.bottom, window.innerHeight);
  for (let el = container.parentElement; el; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const r = el.getBoundingClientRect();
    left = Math.max(left, r.left);
    top = Math.max(top, r.top);
    right = Math.min(right, r.right);
    bottom = Math.min(bottom, r.bottom);
  }
  // Die Bühne kann per CSS skaliert sein (Zoom, Sheet).
  const k = c.width / stage.width();
  return {
    x: (left - c.left) / k,
    y: (top - c.top) / k,
    width: (right - left) / k,
    height: (bottom - top) / k,
  };
}

/**
 * Seite des Drehgriffs: die bevorzugte (sichtbar oben bzw. unten), sonst die
 * andere, sonst eine Seite — die erste, deren Griff ganz im sichtbaren Teil
 * der Bühne liegt (`visibleStageBox`); was darüber hinausragt, ist nicht greifbar.
 * „Oben" wird auf der Bühne gemessen, nicht in der Box: Konva dreht die Box
 * eines horizontal gespiegelten Knotens um 180°.
 */
export function chooseRotaterAngle(tr: Konva.Transformer, prefer: RotaterPreference): number {
  const stage = tr.getStage();
  if (!stage) return tr.rotateAnchorAngle();
  const margin = tr.findOne('.rotater')?.width() ?? tr.anchorSize();
  const visible = visibleStageBox(stage);
  const fits = (angle: number) => {
    const p = rotaterPoint(tr, angle);
    return (
      p.x >= visible.x + margin &&
      p.y >= visible.y + margin &&
      p.x <= visible.x + visible.width - margin &&
      p.y <= visible.y + visible.height - margin
    );
  };
  const [upper, lower] =
    rotaterPoint(tr, 0).y <= rotaterPoint(tr, 180).y + 0.5 ? [0, 180] : [180, 0];
  const order = prefer === 'above' ? [upper, lower, 90, 270] : [lower, upper, 90, 270];
  return order.find(fits) ?? order[0]!;
}

/** Mit Shift dreht der Griff in festen 15°-Schritten (Toleranz = halber Schritt). */
const SHIFT_ROTATION_SNAPS = Array.from({ length: 24 }, (_, i) => i * 15);
const SHIFT_ROTATION_SNAP_TOLERANCE = 7.5;

/** Optik der Griffe (Canva-Muster): weiße Kreise mit Schatten, Seiten als Pillen, Drehgriff mit Symbol. */
const ANCHOR_SIZE = COARSE_POINTER ? 14 : 12;
const PILL_LENGTH = COARSE_POINTER ? 22 : 18;
const PILL_THICKNESS = 6;
const ROTATER_SIZE = COARSE_POINTER ? 32 : 24;
// Lücke zwischen Rahmen und Drehgriff; Konva misst den Abstand bis zur Griffmitte.
const ROTATER_GAP = 12;
// Maus: Trefferrand rund um den Griff (Konva-Standard wäre nur die Strichbreite).
const FINE_ANCHOR_HIT_STROKE = 12;
const ANCHOR_RIM = 'rgba(0, 0, 0, 0.18)';
const HOVER_SCALE = 1.2;

const SIDE_ANCHORS = new Set(['middle-left', 'middle-right', 'top-center', 'bottom-center']);
const anchorKey = (anchor: Konva.Shape) => anchor.name().split(' ')[0]!;

/** Bögen des ⟳ in Canvas-Winkeln (0 = rechts, im Uhrzeigersinn): links hoch, rechts runter. */
const ROTATER_ARCS: readonly (readonly [number, number])[] = [
  [Math.PI * 0.6, Math.PI * 1.35],
  [Math.PI * 1.6, Math.PI * 2.35],
];

/** ⟳ im Kreis. Getrennter hitFunc: nur der Kreis, sonst landen die Symbol-Striche im Treffer-Canvas. */
function drawRotater(ctx: Konva.Context, shape: Konva.Shape): void {
  const r = shape.width() / 2;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2, false);
  ctx.closePath();
  ctx.fillStrokeShape(shape);

  // Zwei offene Bögen links und rechts, je mit Winkel-Spitze, im Uhrzeigersinn (Canva-Muster).
  const active = shape.fill() !== 'white';
  const icon = r * 0.4;
  const head = r * 0.2;
  ctx.save();
  ctx.setAttr('shadowColor', 'transparent');
  ctx.setAttr('strokeStyle', active ? 'white' : '#1f2937');
  ctx.setAttr('lineWidth', Math.max(1.5, r / 8));
  ctx.setAttr('lineCap', 'round');
  ctx.setAttr('lineJoin', 'round');
  for (const [from, to] of ROTATER_ARCS) {
    ctx.beginPath();
    ctx.arc(r, r, icon, from, to, false);
    ctx.stroke();
    const tipX = r + icon * Math.cos(to);
    const tipY = r + icon * Math.sin(to);
    // Laufrichtung an der Spitze; die Schenkel zeigen zurück.
    const back = to + Math.PI / 2 + Math.PI;
    ctx.beginPath();
    ctx.moveTo(tipX + head * Math.cos(back + 0.7), tipY + head * Math.sin(back + 0.7));
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX + head * Math.cos(back - 0.7), tipY + head * Math.sin(back - 0.7));
    ctx.stroke();
  }
  ctx.restore();
}

function hitRotater(ctx: Konva.Context, shape: Konva.Shape): void {
  const r = shape.width() / 2;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2, false);
  ctx.closePath();
  ctx.fillStrokeShape(shape);
}

/** Größe setzen und Konvas Versatz (halbe Größe + Padding) mitziehen. */
function resizeAnchor(anchor: Konva.Shape, width: number, height: number): void {
  const padX = anchor.offsetX() - anchor.width() / 2;
  const padY = anchor.offsetY() - anchor.height() / 2;
  anchor.setAttrs({ width, height, offsetX: width / 2 + padX, offsetY: height / 2 + padY });
}

const wired = new WeakSet<Konva.Node>();

/** Einmal je Knoten: Hover-Vergrößerung am Griff, Shift-Raster und Neuaufbau am Transformer. */
function wire(anchor: Konva.Shape, tr: Konva.Transformer): void {
  if (!wired.has(anchor)) {
    wired.add(anchor);
    anchor.on('mouseenter.chrome', () => {
      if (!tr.isTransforming()) anchor.scale({ x: HOVER_SCALE, y: HOVER_SCALE });
    });
    anchor.on('mouseleave.chrome', () => anchor.scale({ x: 1, y: 1 }));
  }
  if (wired.has(tr)) return;
  wired.add(tr);
  const applyShift = (evt: unknown) => {
    const shift = !!(evt as { shiftKey?: boolean } | undefined)?.shiftKey;
    tr.rotationSnaps(shift ? SHIFT_ROTATION_SNAPS : [...ROTATION_SNAPS]);
    tr.rotationSnapTolerance(shift ? SHIFT_ROTATION_SNAP_TOLERANCE : ROTATION_SNAP_TOLERANCE);
  };
  // Der Shift-Zustand des letzten Zugs gilt für den nächsten: Konva liest die Snaps vor `transform`.
  tr.on('transformstart.chrome', (e) => {
    applyShift(e.evt);
    tr.update();
  });
  tr.on('transform.chrome', (e) => applyShift(e.evt));
  tr.on('transformend.chrome', () => {
    applyShift(null);
    tr.update();
  });
}

/**
 * Griffe liegen über allen Elementen, sonst schnappt ein später gezeichnetes
 * Element den Klick auf den Drehgriff weg. Jede Primitive rendert ihren
 * Transformer in die eigene `canvas-item`-Gruppe; er zieht deshalb eine Ebene
 * höher, neben die Gruppen, und bleibt dort oben (wie `MultiSelectionTransformer`).
 * Gefahrlos für React: react-konva zerstört einen entfernten Knoten, egal wo er hängt.
 */
function keepOnTop(tr: Konva.Transformer): void {
  const item = tr.findAncestor(`.${CANVAS_ITEM_NAME}`);
  const parent = item?.getParent() ?? tr.getParent();
  if (!parent) return;
  if (tr.getParent() !== parent) tr.moveTo(parent);
  if (tr.zIndex() !== parent.children.length - 1) tr.moveToTop();
}

/**
 * Nach jeder Änderung der Elementliste (eingefügt, entfernt, umsortiert —
 * auch durch Mitarbeitende oder Rückgängig): ein neues Element landet hinter
 * dem Transformer und läge sonst bis zu dessen nächstem Neuaufbau darüber.
 * Nur Element-Transformer; der Zuschneide-Transformer bleibt, wo er ist.
 */
export function raiseElementTransformers(root: Konva.Container): void {
  for (const tr of root.find<Konva.Transformer>('Transformer')) {
    if (tr.anchorStyleFunc() === elementAnchorStyleFunc) keepOnTop(tr);
  }
}

/**
 * Konva ruft das bei jedem Neuaufbau des Transformers für jeden Griff — beim
 * Anhängen, nach einem Zug und beim Verschieben (Konvas eigenes `update()` auf
 * `dragmove`; dann nur diese Rechnung, kein React-Zustand). Konva setzt davor
 * jeden Griff auf seine Vorgaben zurück; die Optik wird deshalb jedes Mal neu
 * gesetzt. Während eines Drehens oder Skalierens wird keine Seite gewählt: der
 * Griff bleibt, wo er gepackt wurde.
 */
export function elementAnchorStyleFunc(anchor: Konva.Shape): void {
  touchAnchorStyleFunc?.(anchor as Konva.Rect);
  if (!COARSE_POINTER) anchor.hitStrokeWidth(FINE_ANCHOR_HIT_STROKE);
  const tr = anchor.getParent() as Konva.Transformer | null;
  if (!tr) return;
  wire(anchor, tr);

  const key = anchorKey(anchor);
  const active = tr.isTransforming() ? tr.getActiveAnchor() : null;
  anchor.setAttrs({
    fill: active === key ? SELECTION_COLOR : 'white',
    stroke: ANCHOR_RIM,
    strokeWidth: 1,
    shadowColor: 'black',
    shadowBlur: 4,
    shadowOpacity: 0.25,
    shadowOffsetY: 1,
    // Fill + Rand + Schatten zeichnet Konva sonst je Griff über eine Puffer-Leinwand.
    perfectDrawEnabled: false,
  });
  // Beim Drehen zählt nur der Drehgriff; die Größengriffe stören dabei.
  if (active === 'rotater' && key !== 'rotater') anchor.visible(false);

  if (key === 'rotater') {
    keepOnTop(tr);
    resizeAnchor(anchor, ROTATER_SIZE, ROTATER_SIZE);
    anchor.setAttrs({ sceneFunc: drawRotater, hitFunc: hitRotater });
    if (!tr.rotateEnabled() || tr.isTransforming()) return;
    const angle = chooseRotaterAngle(tr, ROTATER_PREFERENCE);
    // Löst ein zweites update() aus, das hier mit gleichem Winkel endet.
    if (angle !== tr.rotateAnchorAngle()) tr.rotateAnchorAngle(angle);
    return;
  }
  if (SIDE_ANCHORS.has(key)) {
    const vertical = key.startsWith('middle');
    resizeAnchor(
      anchor,
      vertical ? PILL_THICKNESS : PILL_LENGTH,
      vertical ? PILL_LENGTH : PILL_THICKNESS
    );
    (anchor as Konva.Rect).cornerRadius(PILL_THICKNESS / 2);
    return;
  }
  (anchor as Konva.Rect).cornerRadius(ANCHOR_SIZE / 2);
}

/** Drehpfeil als Cursor über dem Drehgriff (Mitte als Hotspot), sonst `grab`. */
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" stroke="white" stroke-width="4"/><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" stroke="black" stroke-width="2"/></g></svg>'
)}") 12 12, grab`;

/** Auf jeden Element-Transformer spreaden; `rotateEnabled` bleibt je Primitive. */
export const ELEMENT_TRANSFORMER = {
  // Veränderbare Kopie: Konvas Typ verlangt number[]; `as const` würde ein readonly-Tupel daraus machen.
  rotationSnaps: [...ROTATION_SNAPS] as number[],
  rotationSnapTolerance: ROTATION_SNAP_TOLERANCE,
  flipEnabled: false,
  anchorStyleFunc: elementAnchorStyleFunc,
  anchorSize: ANCHOR_SIZE,
  borderStroke: SELECTION_COLOR,
  borderStrokeWidth: 2,
  rotateLineVisible: false,
  rotateAnchorOffset: ROTATER_SIZE / 2 + ROTATER_GAP,
  rotateAnchorCursor: ROTATE_CURSOR,
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
