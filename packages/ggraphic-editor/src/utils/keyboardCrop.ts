// SPDX-License-Identifier: MPL-2.0
import {
  framedPhotoRect,
  panOfFramedPhoto,
  clampPan,
  panWindowPhoto,
  windowInPhoto,
  zoomWindow,
  type Rect,
  type Size,
} from '@ggraphic/editor/utils/coverFit';
import { isWidgetOwnedKey } from '@ggraphic/editor/utils/keyboardOwnership';
import {
  minStraightenZoom,
  panOfStraightPhoto,
  panStraightPhoto,
  straightFramedPhoto,
  windowPhotoOfStraight,
  zoomStraightPhoto,
} from '@ggraphic/editor/utils/straighten';

import type { UserImageInstance } from './userImageUtils.js';

/** Ein Tastendruck im Zuschneide-Modus: Pfeile verschieben (Umschalt = 10 px), +/- zoomen. */
export type CropKey = { pan: { dx: number; dy: number } } | { zoom: number };

const PAN_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

const ZOOM_STEP = 1.1;

/** `null` für jede Taste, die nicht dem Zuschnitt gehört (Textfeld, Menü, fokussiertes Widget). */
export function cropKeyOf(e: KeyboardEvent): CropKey | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey) return null;
  const target = e.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    (target instanceof Element && target.closest('[role="menu"]')) ||
    isWidgetOwnedKey(e)
  ) {
    return null;
  }
  const arrow = PAN_KEYS[e.key];
  const step = e.shiftKey ? 10 : 1;
  if (arrow) return { pan: { dx: arrow[0] * step, dy: arrow[1] * step } };
  if (e.key === '+' || e.key === '=') return { zoom: ZOOM_STEP };
  if (e.key === '-') return { zoom: 1 / ZOOM_STEP };
  return null;
}

/**
 * Eigenes Bild: der Zuschnitt nach einem Tastendruck, oder `null`, wenn er
 * sich nicht ändert. Begradigt geklemmt in Fotoachsen und nie unter dem
 * Mindestzoom des Winkels — so öffnet keine Taste eine Lücke im Rahmen.
 */
export function userImageKeyCrop(
  natural: Size,
  userImage: Pick<
    UserImageInstance,
    'width' | 'height' | 'panX' | 'panY' | 'cropZoom' | 'cropRotation'
  >,
  key: CropKey
): Partial<UserImageInstance> | null {
  const frame = { x: 0, y: 0, width: userImage.width, height: userImage.height };
  const deg = userImage.cropRotation ?? 0;
  const kept = { x: userImage.panX ?? 0, y: userImage.panY ?? 0 };
  const from = userImage.cropZoom ?? 1;
  if ('zoom' in key) {
    const floor = deg !== 0 ? minStraightenZoom(natural, frame, deg) : 1;
    const cropZoom = Math.max(floor, from * key.zoom);
    return Math.abs(cropZoom - from) > 1e-9 ? { fit: 'cover', cropZoom } : null;
  }
  const { dx, dy } = key.pan;
  if (deg !== 0) {
    const photo = straightFramedPhoto(natural, frame, kept, from, deg);
    const moved = panStraightPhoto(photo, deg, frame, dx, dy);
    if (Math.abs(moved.x - photo.x) < 1e-9 && Math.abs(moved.y - photo.y) < 1e-9) return null;
    const pan = panOfStraightPhoto(moved, deg, frame, kept);
    return { fit: 'cover', panX: pan.x, panY: pan.y };
  }
  const photo = framedPhotoRect(natural, frame, kept, from);
  const held = clampPan(photo, dx, dy, frame);
  if (held.dx === 0 && held.dy === 0) return null;
  const pan = panOfFramedPhoto({ ...photo, x: photo.x + held.dx, y: photo.y + held.dy }, frame);
  return { fit: 'cover', panX: pan.x, panY: pan.y };
}

/**
 * Hintergrundfoto: das Fenster (`x/y/width/height` des Elements) nach einem
 * Tastendruck, oder `null`, wenn es sich nicht ändert. `straight` ist das
 * begradigte Foto, sonst `null`; dieselben Grenzen wie beim Ziehen und Zoomen.
 */
export function backgroundKeyCrop(
  natural: Size,
  window: Rect,
  slot: Rect,
  straight: Rect | null,
  deg: number,
  key: CropKey
): Rect | null {
  let next: Rect;
  if (straight) {
    const moved =
      'zoom' in key
        ? zoomStraightPhoto(straight, key.zoom, deg, slot)
        : panStraightPhoto(straight, deg, slot, key.pan.dx, key.pan.dy);
    // Wie beim Ziehen: das Fenster behält sein Verhältnis, seine Mitte ist die des Fotos.
    next =
      'zoom' in key
        ? windowInPhoto(
            windowPhotoOfStraight(natural, moved, deg, slot),
            window.width / window.height
          )
        : {
            ...window,
            x: moved.x + moved.width / 2 - window.width / 2,
            y: moved.y + moved.height / 2 - window.height / 2,
          };
  } else if ('zoom' in key) {
    next = zoomWindow(window, key.zoom, slot);
  } else {
    const held = panWindowPhoto(natural, window, slot, key.pan.dx, key.pan.dy);
    next = { ...window, x: window.x + held.dx, y: window.y + held.dy };
  }
  const same =
    Math.abs(next.x - window.x) < 1e-9 &&
    Math.abs(next.y - window.y) < 1e-9 &&
    Math.abs(next.width - window.width) < 1e-9 &&
    Math.abs(next.height - window.height) < 1e-9;
  return same ? null : next;
}
