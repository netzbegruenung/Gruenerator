// Begradigen. Gedrehte Fotos sind Rechtecke ihrer ungedrehten Lage, gedreht um die Mitte (Grad, wie Konva).

import {
  coverPhotoRect,
  framedPhotoRect,
  panOfFramedPhoto,
  type Mirror,
  type Rect,
  type Size,
} from './coverFit';

import type Konva from 'konva';

export const STRAIGHTEN_LIMIT = 45;

interface Point {
  x: number;
  y: number;
}

export function clampStraighten(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-STRAIGHTEN_LIMIT, Math.min(STRAIGHTEN_LIMIT, Math.round(value))) || 0;
}

/** `null` heißt: nie begradigt — der alte Zeichenweg, unverändert. */
export function storedStraighten(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Wer `imageOffset`/`imageScale` liest, muss diesen Winkel beachten (`straightenWindowPhoto`): gedreht verschoben liegt das Fenster außerhalb der 0°-Grenzen.
export const BACKGROUND_STRAIGHTEN_KEY = 'backgroundImageRotation';

export function backgroundStraighten(state: Record<string, unknown>): number | null {
  return storedStraighten(state[BACKGROUND_STRAIGHTEN_KEY]);
}

const radians = (deg: number) => (deg * Math.PI) / 180;

function toPhotoAxes(v: Point, deg: number): Point {
  const r = radians(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: v.x * cos + v.y * sin, y: -v.x * sin + v.y * cos };
}

function toPageAxes(v: Point, deg: number): Point {
  const r = radians(deg);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

const centreOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Deckt das Foto dieses Rechteck in seinen Achsen, deckt es den ganzen Rahmen. */
export function rotatedExtent(frame: Size, deg: number): Size {
  const r = radians(deg);
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  return {
    width: frame.width * cos + frame.height * sin,
    height: frame.width * sin + frame.height * cos,
  };
}

export function minCoverScale(natural: Size, frame: Size, deg: number): number {
  const extent = rotatedExtent(frame, deg);
  return Math.max(extent.width / natural.width, extent.height / natural.height);
}

export function minStraightenZoom(natural: Size, frame: Size, deg: number): number {
  return minCoverScale(natural, frame, deg) / minCoverScale(natural, frame, 0);
}

function slackOf(size: Size, frame: Size, deg: number): Point {
  const extent = rotatedExtent(frame, deg);
  return {
    x: Math.max(0, (size.width - extent.width) / 2),
    y: Math.max(0, (size.height - extent.height) / 2),
  };
}

const clampTo = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

/** In Fotoachsen geklemmt: dort ist der erlaubte Bereich achsparallel, und Drehen erhält Abstände. */
export function clampStraightCentre(centre: Point, size: Size, deg: number, frame: Rect): Point {
  const middle = centreOf(frame);
  const local = toPhotoAxes({ x: centre.x - middle.x, y: centre.y - middle.y }, deg);
  const slack = slackOf(size, frame, deg);
  const held = { x: clampTo(local.x, slack.x), y: clampTo(local.y, slack.y) };
  if (held.x === local.x && held.y === local.y) return centre;
  const page = toPageAxes(held, deg);
  return { x: middle.x + page.x, y: middle.y + page.y };
}

/** Ohne Korrektur kommt `photo` selbst zurück: bei 0° rendert ein deckendes Foto bytegleich. */
export function straightenPhoto(photo: Rect, deg: number, frame: Rect): Rect {
  const extent = rotatedExtent(frame, deg);
  const grow = Math.max(1, extent.width / photo.width, extent.height / photo.height);
  const size = { width: photo.width * grow, height: photo.height * grow };
  const centre = centreOf(photo);
  const held = clampStraightCentre(centre, size, deg, frame);
  if (grow === 1 && held === centre) return photo;
  return { x: held.x - size.width / 2, y: held.y - size.height / 2, ...size };
}

export function panStraightPhoto(
  photo: Rect,
  deg: number,
  frame: Rect,
  dx: number,
  dy: number
): Rect {
  const centre = centreOf(photo);
  const held = clampStraightCentre({ x: centre.x + dx, y: centre.y + dy }, photo, deg, frame);
  return { ...photo, x: held.x - photo.width / 2, y: held.y - photo.height / 2 };
}

/** Zoom um die Rahmenmitte: was man sieht, bleibt mittig. */
export function zoomStraightPhoto(photo: Rect, factor: number, deg: number, frame: Rect): Rect {
  const middle = centreOf(frame);
  const centre = centreOf(photo);
  const width = photo.width * factor;
  const height = photo.height * factor;
  const zoomed = {
    x: middle.x + (centre.x - middle.x) * factor - width / 2,
    y: middle.y + (centre.y - middle.y) * factor - height / 2,
    width,
    height,
  };
  return straightenPhoto(zoomed, deg, frame);
}

function scaledAbout(photo: Rect, factor: number): Rect {
  const centre = centreOf(photo);
  const width = photo.width * factor;
  const height = photo.height * factor;
  return { x: centre.x - width / 2, y: centre.y - height / 2, width, height };
}

/** Hintergrund: der Fenster-Zoom setzt auf dem Mindestzoom des Winkels auf, sonst bliebe der Zoom-Regler darunter wirkungslos. */
export function straightenWindowPhoto(natural: Size, photo: Rect, deg: number, frame: Rect): Rect {
  const floor = minStraightenZoom(natural, frame, deg);
  return straightenPhoto(floor === 1 ? photo : scaledAbout(photo, floor), deg, frame);
}

export function windowPhotoOfStraight(
  natural: Size,
  straight: Rect,
  deg: number,
  frame: Rect
): Rect {
  const floor = minStraightenZoom(natural, frame, deg);
  return floor === 1 ? straight : scaledAbout(straight, 1 / floor);
}

export function straightPhotoCovers(photo: Rect, deg: number, frame: Rect, epsilon = 0.5): boolean {
  const centre = centreOf(photo);
  const corners: Point[] = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.width, y: frame.y },
    { x: frame.x, y: frame.y + frame.height },
    { x: frame.x + frame.width, y: frame.y + frame.height },
  ];
  return corners.every((corner) => {
    const local = toPhotoAxes({ x: corner.x - centre.x, y: corner.y - centre.y }, deg);
    return (
      Math.abs(local.x) <= photo.width / 2 + epsilon &&
      Math.abs(local.y) <= photo.height / 2 + epsilon
    );
  });
}

export function clampPointToStraightPhoto(point: Point, photo: Rect, deg: number): Point {
  const centre = centreOf(photo);
  const local = toPhotoAxes({ x: point.x - centre.x, y: point.y - centre.y }, deg);
  const held = { x: clampTo(local.x, photo.width / 2), y: clampTo(local.y, photo.height / 2) };
  if (held.x === local.x && held.y === local.y) return point;
  const page = toPageAxes(held, deg);
  return { x: centre.x + page.x, y: centre.y + page.y };
}

/** Eigenes Bild: `pan` ist der Anteil am Spielraum in Fotoachsen, damit Zurückdrehen den Ausschnitt wiederfindet. */
export function straightFramedPhoto(
  natural: Size,
  frame: Size,
  pan: Point,
  zoom: number,
  deg: number
): Rect {
  if (deg === 0) return framedPhotoRect(natural, frame, pan, zoom);
  // Ohne max(1, …): ein Rahmen, der gedreht ins Foto passt, darf ungedreht darüber hinausragen.
  const base = coverPhotoRect(natural, frame, zoom > 0 ? zoom : 1);
  const extent = rotatedExtent(frame, deg);
  const grow = Math.max(1, extent.width / base.width, extent.height / base.height);
  const width = base.width * grow;
  const height = base.height * grow;
  const slack = slackOf({ width, height }, frame, deg);
  const local = { x: clampTo(pan.x, 1) * slack.x, y: clampTo(pan.y, 1) * slack.y };
  const page = toPageAxes(local, deg);
  return {
    x: frame.width / 2 + page.x - width / 2,
    y: frame.height / 2 + page.y - height / 2,
    width,
    height,
  };
}

/** Eine Achse ohne Spielraum sagt nichts über den Anteil; dort bleibt `kept`. */
export function panOfStraightPhoto(
  photo: Rect,
  deg: number,
  frame: Size,
  kept: Point = { x: 0, y: 0 }
): Point {
  if (deg === 0) return panOfFramedPhoto(photo, frame);
  const centre = centreOf(photo);
  const local = toPhotoAxes({ x: centre.x - frame.width / 2, y: centre.y - frame.height / 2 }, deg);
  const slack = slackOf(photo, frame, deg);
  // Unter einem halben Pixel Spielraum ist der Anteil Rauschen.
  return {
    x: slack.x > 0.5 ? clampTo(local.x / slack.x, 1) : kept.x,
    y: slack.y > 0.5 ? clampTo(local.y / slack.y, 1) : kept.y,
  };
}

export function frameForAspectOnStraightPhoto(
  frame: Rect,
  photo: Rect,
  deg: number,
  ratio: number
): Rect {
  const r = radians(deg);
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const halfW = photo.width / 2;
  const halfH = photo.height / 2;
  // Ecken (±a, ±a/ratio) in Fotoachsen: |x| = a·cos + b·sin ≤ halfW, |y| = a·sin + b·cos ≤ halfH.
  const a = Math.min(halfW / (cos + sin / ratio), halfH / (sin + cos / ratio));
  const width = 2 * a;
  const height = width / ratio;
  const box = { width, height };
  const free = {
    width: photo.width - 2 * (a * cos + (a / ratio) * sin),
    height: photo.height - 2 * (a * sin + (a / ratio) * cos),
  };
  const centre = centreOf(photo);
  const local = toPhotoAxes(
    { x: centreOf(frame).x - centre.x, y: centreOf(frame).y - centre.y },
    deg
  );
  const held = toPageAxes(
    {
      x: clampTo(local.x, Math.max(0, free.width / 2)),
      y: clampTo(local.y, Math.max(0, free.height / 2)),
    },
    deg
  );
  return {
    x: centre.x + held.x - box.width / 2,
    y: centre.y + held.y - box.height / 2,
    ...box,
  };
}

/** Knoten-lokal; x/y ist die Mitte des Fotos. */
export interface StraightDraw {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Der Flip-Filter spiegelt danach den Knoten; daher hier Lage gespiegelt, Winkel je Achse umgekehrt. */
export function straightDrawOf(
  photo: Rect,
  deg: number,
  box: Rect,
  mirror: Mirror | null
): StraightDraw {
  const centre = centreOf(photo);
  const x = centre.x - box.x;
  const y = centre.y - box.y;
  const flips = (mirror?.x ? 1 : 0) + (mirror?.y ? 1 : 0);
  return {
    x: mirror?.x ? box.width - x : x,
    y: mirror?.y ? box.height - y : y,
    width: photo.width,
    height: photo.height,
    rotation: flips === 1 ? -deg : deg,
  };
}

// Ziehen setzt das Attribut direkt, ohne React-Zustand.
export const STRAIGHT_DRAW_ATTR = 'straightDraw';

/** Konvas `crop` schneidet nur achsparallel aus; das gedrehte Foto zeichnet diese Funktion. */
export function straightSceneFunc(context: Konva.Context, shape: Konva.Shape): void {
  const image = shape.getAttr('image') as CanvasImageSource | undefined;
  const draw = shape.getAttr(STRAIGHT_DRAW_ATTR) as StraightDraw | undefined;
  if (!image || !draw) return;
  const width = shape.width();
  const height = shape.height();
  const radius = Number(shape.getAttr('cornerRadius')) || 0;
  context.save();
  context.beginPath();
  if (radius > 0) {
    const r = Math.min(radius, width / 2, height / 2);
    context.moveTo(r, 0);
    context.arcTo(width, 0, width, height, r);
    context.arcTo(width, height, 0, height, r);
    context.arcTo(0, height, 0, 0, r);
    context.arcTo(0, 0, width, 0, r);
  } else {
    context.rect(0, 0, width, height);
  }
  context.closePath();
  context.clip();
  context.translate(draw.x, draw.y);
  context.rotate(radians(draw.rotation));
  context.drawImage(image, -draw.width / 2, -draw.height / 2, draw.width, draw.height);
  context.restore();
}

/** Trägt nur den Maßstab: `printImageInfo` liest `cropWidth` für die Druck-DPI. */
export function straightScaleCrop(natural: Size, photo: Rect, box: Rect): Rect {
  const sx = natural.width / photo.width;
  const sy = natural.height / photo.height;
  const width = box.width * sx;
  const height = box.height * sy;
  return {
    x: natural.width / 2 - width / 2,
    y: natural.height / 2 - height / 2,
    width,
    height,
  };
}
