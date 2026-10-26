import type { Mirror, Rect } from './coverFit';
import type Konva from 'konva';

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

// Größte Kante der Overlay-Fläche in Gerätepixeln; darüber sinkt die Auflösung.
const MAX_OVERLAY_SIDE = 8192;

/**
 * Zeichnet alle sichtbaren Restbilder der Bühne in `canvas`, das im selben
 * Koordinatensystem wie der Bühnen-Container liegt, und spart die Seite aus:
 * dort zeichnet Konva selbst. Ohne Restbild wird `canvas` ausgeblendet.
 */
export function paintCropGhosts(stage: Konva.Stage, canvas: HTMLCanvasElement): void {
  const ghosts = stage
    .find<Konva.Image>(`.${CROP_GHOST_NAME}`)
    .filter((node) => node.isVisible() && node.image());
  if (ghosts.length === 0) {
    canvas.style.display = 'none';
    return;
  }

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
  const left = Math.floor(minX);
  const top = Math.floor(minY);
  const cssWidth = Math.max(1, Math.ceil(maxX) - left);
  const cssHeight = Math.max(1, Math.ceil(maxY) - top);
  const ratio = Math.min(
    window.devicePixelRatio || 1,
    MAX_OVERLAY_SIDE / Math.max(cssWidth, cssHeight)
  );

  canvas.width = Math.round(cssWidth * ratio);
  canvas.height = Math.round(cssHeight * ratio);
  Object.assign(canvas.style, {
    display: '',
    left: `${left}px`,
    top: `${top}px`,
    width: `${cssWidth}px`,
    height: `${cssHeight}px`,
  });

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const toOverlay = [ratio, 0, 0, ratio, -left * ratio, -top * ratio] as const;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
