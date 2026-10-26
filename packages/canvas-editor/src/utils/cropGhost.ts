import Konva from 'konva';

import { getActiveImageFilters, imageFilterAttrs } from './imageFilters';

import type { Mirror, Rect } from './coverFit';
import type { ImageAdjustments } from './userImageUtils';

/**
 * Konva-Name des abgedunkelten ganzen Fotos im Zuschneide-Modus (Hintergrund
 * und eigene Bilder). Die Bühne endet an der Seite; was darüber hinausragt,
 * zeichnet `CropGhostOverlay` im DOM nach.
 */
export const CROP_GHOST_NAME = 'crop-ghost';
export const CROP_GHOST_OPACITY = 0.35;

/** Lage eines Restbilds für `photo`; gespiegelt liegt der Ursprung an der fernen Kante. */
export function cropGhostAttrs(photo: Rect, mirror: Mirror | null) {
  return {
    x: photo.x + (mirror?.x ? photo.width : 0),
    y: photo.y + (mirror?.y ? photo.height : 0),
    width: photo.width,
    height: photo.height,
    scaleX: mirror?.x ? -1 : 1,
    scaleY: mirror?.y ? -1 : 1,
  };
}

/** Setzt ein Restbild direkt am Knoten (während Ziehen und Zoomen, ohne React-Zustand). */
export function placeCropGhost(node: Konva.Node | null, photo: Rect, mirror: Mirror | null): void {
  node?.setAttrs(cropGhostAttrs(photo, mirror));
}

// Grenzen der Overlay-Fläche in Gerätepixeln. iOS-WebKit verwirft Canvas über
// 16 777 216 px still; die Fläche bleibt mit Abstand darunter.
export const MAX_OVERLAY_SIDE = 8192;
export const MAX_OVERLAY_AREA = 8_388_608;

/**
 * Welcher Teil von `bounds` (Container-Koordinaten) gezeichnet wird und mit
 * welcher Auflösung: nur was in `visible` liegt (der sichtbare Ausschnitt;
 * `null` = unbekannt, dann alles), höchstens `MAX_OVERLAY_SIDE` je Kante und
 * `MAX_OVERLAY_AREA` insgesamt. `null`, wenn nichts davon sichtbar ist.
 */
export function overlayRegion(
  bounds: Rect,
  visible: Rect | null,
  devicePixelRatio: number
): { rect: Rect; ratio: number; pixelWidth: number; pixelHeight: number } | null {
  const x0 = Math.max(bounds.x, visible?.x ?? -Infinity);
  const y0 = Math.max(bounds.y, visible?.y ?? -Infinity);
  const x1 = Math.min(bounds.x + bounds.width, visible ? visible.x + visible.width : Infinity);
  const y1 = Math.min(bounds.y + bounds.height, visible ? visible.y + visible.height : Infinity);
  if (x1 <= x0 || y1 <= y0) return null;
  const left = Math.floor(x0);
  const top = Math.floor(y0);
  const width = Math.max(1, Math.ceil(x1) - left);
  const height = Math.max(1, Math.ceil(y1) - top);
  const ratio = Math.min(
    devicePixelRatio || 1,
    MAX_OVERLAY_SIDE / Math.max(width, height),
    Math.sqrt(MAX_OVERLAY_AREA / (width * height))
  );
  return {
    rect: { x: left, y: top, width, height },
    ratio,
    pixelWidth: Math.max(1, Math.floor(width * ratio)),
    pixelHeight: Math.max(1, Math.floor(height * ratio)),
  };
}

/**
 * Der sichtbare Teil von `container` in seinen eigenen CSS-Koordinaten: das
 * Browserfenster, zurückgerechnet durch die Zoom-Skalierung der Seiten.
 * `null`, wenn der Container nicht vermessen ist (jsdom, nicht eingehängt).
 */
export function visibleContainerRect(container: HTMLElement): Rect | null {
  const box = container.getBoundingClientRect();
  if (!box.width || !container.offsetWidth) return null;
  const scale = box.width / container.offsetWidth;
  return {
    x: -box.left / scale,
    y: -box.top / scale,
    width: window.innerWidth / scale,
    height: window.innerHeight / scale,
  };
}

/**
 * Zeichnet alle sichtbaren Restbilder der Bühne in `canvas`, das im selben
 * Koordinatensystem wie der Bühnen-Container liegt, und spart die Seite aus:
 * dort zeichnet Konva selbst. Gezeichnet wird nur, was in `visible` liegt.
 * Ohne sichtbares Restbild wird `canvas` ausgeblendet.
 */
export function paintCropGhosts(
  stage: Konva.Stage,
  canvas: HTMLCanvasElement,
  visible: Rect | null = null
): void {
  const ghosts = stage
    .find<Konva.Image>(`.${CROP_GHOST_NAME}`)
    .filter((node) => node.isVisible() && node.image());

  const placed = ghosts.map((node) => ({
    node,
    matrix: node.getAbsoluteTransform().getMatrix(),
    width: node.width(),
    height: node.height(),
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { matrix: m, width, height } of placed) {
    for (const [px, py] of [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as const) {
      const x = m[0] * px + m[2] * py + m[4];
      const y = m[1] * px + m[3] * py + m[5];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const region =
    placed.length > 0
      ? overlayRegion(
          { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
          visible,
          window.devicePixelRatio
        )
      : null;
  if (!region) {
    canvas.style.display = 'none';
    return;
  }

  const { rect, pixelWidth, pixelHeight } = region;
  // Neu anlegen nur bei neuer Größe; sonst genügt das Leeren.
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  Object.assign(canvas.style, {
    display: '',
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sx = pixelWidth / rect.width;
  const sy = pixelHeight / rect.height;
  const toOverlay = [sx, 0, 0, sy, -rect.x * sx, -rect.y * sy] as const;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const { node, matrix: m, width, height } of placed) {
    ctx.setTransform(...toOverlay);
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.globalAlpha = node.getAbsoluteOpacity();
    ctx.drawImage(node.image()!, 0, 0, width, height);
  }
  ctx.setTransform(...toOverlay);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, stage.width(), stage.height());
}

// Längste Kante der gefilterten Restbild-Vorlage; abgedunkelt braucht es keine volle Auflösung.
const GHOST_SOURCE_SIDE = 1024;

/**
 * Die Bildquelle des Restbilds mit dem Look des Fotos („Bearbeiten"-Filter,
 * Einfärbung), einmal auf eine verkleinerte Kopie gerechnet statt per Cache
 * auf dem ganzen, oft vielfach gezoomten Restbild. Spiegeln bleibt außen vor:
 * das Restbild spiegelt über seine Skalierung. `displayedWidth` ist die Breite
 * des ganzen Fotos auf der Bühne; der Weichzeichner-Radius gilt dort.
 */
export function cropGhostSource(
  image: HTMLImageElement,
  adjustments: ImageAdjustments | null,
  displayedWidth: number,
  color: string | null = null
): CanvasImageSource {
  const look = adjustments ? { ...adjustments, flipX: false, flipY: false } : null;
  const filters = [
    ...(color ? [Konva.Filters.RGB] : []),
    ...(look ? getActiveImageFilters(look) : []),
  ];
  const natural = { width: image.naturalWidth, height: image.naturalHeight };
  if (filters.length === 0 || !natural.width || !natural.height) return image;

  const scale = Math.min(1, GHOST_SOURCE_SIDE / Math.max(natural.width, natural.height));
  const width = Math.max(1, Math.round(natural.width * scale));
  const height = Math.max(1, Math.round(natural.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0, width, height);
  // Die Filter lesen ihre Werte vom Knoten (`this`), wie in Konvas Cache.
  const attrs = new Konva.Image({
    image,
    ...(look ? imageFilterAttrs(look) : {}),
    blurRadius: ((look?.blur ?? 0) * width) / Math.max(1, displayedWidth),
    ...(color
      ? {
          red: parseInt(color.slice(1, 3), 16),
          green: parseInt(color.slice(3, 5), 16),
          blue: parseInt(color.slice(5, 7), 16),
        }
      : {}),
  });
  const data = ctx.getImageData(0, 0, width, height);
  for (const filter of filters) if (typeof filter === 'function') filter.call(attrs, data);
  ctx.putImageData(data, 0, 0);
  attrs.destroy();
  return canvas;
}
