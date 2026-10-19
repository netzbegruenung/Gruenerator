/**
 * Cover-fitted photos (Canva model): the whole photo keeps its aspect, a frame
 * shows part of it, and moving or zooming the photo never opens a gap in the
 * frame. Every placement is expressed as the rectangle the *whole* photo
 * occupies; the drawn node is that rectangle cut to the frame.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A photo mirrored by the flip filter (`flipX` / `flipY`). */
export interface Mirror {
  x?: boolean;
  y?: boolean;
}

/**
 * The whole photo around `window`, a box with its own aspect that shows the
 * photo's centred, aspect-matched part (the legacy background model): the
 * window widened along the axis where the photo has more.
 */
export function photoRectAround(natural: Size, window: Rect): Rect {
  const photoAspect = natural.width / natural.height;
  const windowAspect = window.width / window.height;
  if (photoAspect > windowAspect) {
    const width = window.height * photoAspect;
    return { x: window.x - (width - window.width) / 2, y: window.y, width, height: window.height };
  }
  const height = window.width / photoAspect;
  return { x: window.x, y: window.y - (height - window.height) / 2, width: window.width, height };
}

/** Inverse of `photoRectAround`: the centred box of `aspect` (width / height) that fits in `photo`. */
export function windowInPhoto(photo: Rect, aspect: number): Rect {
  const width = Math.min(photo.width, photo.height * aspect);
  const height = width / aspect;
  return {
    x: photo.x + (photo.width - width) / 2,
    y: photo.y + (photo.height - height) / 2,
    width,
    height,
  };
}

/**
 * The whole photo inside `frame` at `zoom` (1 = just covers), centred and then
 * moved by `offset` — the model `FramePrimitive` uses.
 */
export function coverPhotoRect(
  natural: Size,
  frame: Size,
  zoom = 1,
  offset: { x: number; y: number } = { x: 0, y: 0 }
): Rect {
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height) * zoom;
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    x: (frame.width - width) / 2 + offset.x,
    y: (frame.height - height) / 2 + offset.y,
    width,
    height,
  };
}

/**
 * A `cover` photo in a frame (frame-local px), moved by `pan`: a share of its
 * overhang on each axis, -1 … 1 from one edge to the other, 0 centred. Being a
 * share, the chosen part survives a resize of the frame, and no pan in range
 * can open a gap.
 */
export function framedPhotoRect(
  natural: Size,
  frame: Size,
  pan: { x: number; y: number } = { x: 0, y: 0 },
  zoom = 1
): Rect {
  const photo = coverPhotoRect(natural, frame, Math.max(1, zoom));
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return {
    ...photo,
    x: photo.x * (1 - clamp(pan.x)),
    y: photo.y * (1 - clamp(pan.y)),
  };
}

/** Inverse of `framedPhotoRect`: the pan that puts the photo at `photo.x` / `photo.y`. */
export function panOfFramedPhoto(photo: Rect, frame: Size): { x: number; y: number } {
  const share = (start: number, size: number, frameSize: number) => {
    const half = (size - frameSize) / 2;
    return half > 0 ? 1 + start / half : 0;
  };
  return {
    x: share(photo.x, photo.width, frame.width),
    y: share(photo.y, photo.height, frame.height),
  };
}

/**
 * The drawn part: where `photo` overlaps `frame`, and which source pixels that
 * is (Konva `crop`). Null when nothing overlaps.
 */
export function visiblePart(
  natural: Size,
  photo: Rect,
  frame: Rect,
  mirror: Mirror | null = null
): { box: Rect; crop: Rect } | null {
  const left = Math.max(photo.x, frame.x);
  const top = Math.max(photo.y, frame.y);
  const right = Math.min(photo.x + photo.width, frame.x + frame.width);
  const bottom = Math.min(photo.y + photo.height, frame.y + frame.height);
  if (right <= left || bottom <= top) return null;
  const sx = natural.width / photo.width;
  const sy = natural.height / photo.height;
  const width = (right - left) * sx;
  const height = (bottom - top) * sy;
  const x = (left - photo.x) * sx;
  const y = (top - photo.y) * sy;
  return {
    box: { x: left, y: top, width: right - left, height: bottom - top },
    // A flip filter mirrors the drawn pixels; mirroring the crop as well makes
    // the drawn part the mirror of the whole photo, not of its middle.
    crop: {
      x: mirror?.x ? natural.width - x - width : x,
      y: mirror?.y ? natural.height - y - height : y,
      width,
      height,
    },
  };
}

/**
 * Keeps a moved photo covering `frame`. A photo that did not cover the frame
 * to begin with (an old composer strip under a colour panel) may still move
 * between where it was and the covering range — it is never yanked across.
 */
export function clampPan(
  from: Rect,
  dx: number,
  dy: number,
  frame: Rect
): { dx: number; dy: number } {
  const range = (start: number, size: number, frameStart: number, frameSize: number) => {
    const lo = frameStart + frameSize - (start + size);
    const hi = frameStart - start;
    return lo <= hi ? [Math.min(lo, 0), Math.max(hi, 0)] : [Math.min(hi, 0), Math.max(lo, 0)];
  };
  const [minX, maxX] = range(from.x, from.width, frame.x, frame.width);
  const [minY, maxY] = range(from.y, from.height, frame.y, frame.height);
  return {
    dx: Math.min(maxX!, Math.max(minX!, dx)),
    dy: Math.min(maxY!, Math.max(minY!, dy)),
  };
}

/**
 * Where a window-placed photo may show. A photo that fills the frame shows
 * across all of it. One that does not (an old composer strip pushed under a
 * colour panel, a photo zoomed below 100 %) keeps drawing only inside its
 * window, so saved designs look as they always did.
 */
export function shownArea(natural: Size, window: Rect, frame: Rect): Rect {
  if (covers(photoRectAround(natural, window), frame)) return frame;
  const x = Math.max(window.x, frame.x);
  const y = Math.max(window.y, frame.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(window.x + window.width, frame.x + frame.width) - x),
    height: Math.max(0, Math.min(window.y + window.height, frame.y + frame.height) - y),
  };
}

/**
 * Moves a window-placed photo by (dx, dy) inside `slot` and returns the move
 * it allows plus what to draw. A photo that covers the slot pans across its
 * whole overhang. An old one that does not keeps its window over the area it
 * shows, so no drag can open a gap there.
 */
export function panWindowPhoto(
  natural: Size,
  window: Rect,
  slot: Rect,
  dx: number,
  dy: number,
  mirror: Mirror | null = null
): { dx: number; dy: number; part: { box: Rect; crop: Rect } | null } {
  const photo = photoRectAround(natural, window);
  // An old window that does not fill the slot moves as it always did: inside
  // the slot, or towards covering it — never so that its strip opens a gap.
  const held = clampPan(covers(photo, slot) ? photo : window, dx, dy, slot);
  const moved = { ...window, x: window.x + held.dx, y: window.y + held.dy };
  return {
    ...held,
    part: visiblePart(
      natural,
      photoRectAround(natural, moved),
      shownArea(natural, moved, slot),
      mirror
    ),
  };
}

/** Whether `photo` fills `frame` completely. */
export function covers(photo: Rect, frame: Rect, epsilon = 0.5): boolean {
  return (
    photo.x <= frame.x + epsilon &&
    photo.y <= frame.y + epsilon &&
    photo.x + photo.width >= frame.x + frame.width - epsilon &&
    photo.y + photo.height >= frame.y + frame.height - epsilon
  );
}

/**
 * A window scaled by `factor` about the middle of the slot (what the viewer
 * sees stays centred), never smaller than the slot (100 %), and held over the
 * slot so the zoom cannot open a gap.
 */
export function zoomWindow(window: Rect, factor: number, slot: Rect): Rect {
  const f = Math.max(slot.width / window.width, slot.height / window.height, factor);
  const width = window.width * f;
  const height = window.height * f;
  const about = (start: number, middle: number) => middle - (middle - start) * f;
  const hold = (start: number, size: number, slotStart: number, slotSize: number) =>
    Math.min(slotStart, Math.max(slotStart + slotSize - size, start));
  return {
    x: hold(about(window.x, slot.x + slot.width / 2), width, slot.x, slot.width),
    y: hold(about(window.y, slot.y + slot.height / 2), height, slot.y, slot.height),
    width,
    height,
  };
}

/**
 * `zoomWindow` for a background's `imageOffset` / `imageScale` over a slot at
 * the origin. A `centerZoom` slot anchors its window on its own middle.
 */
export function zoomBackground(
  current: { imageOffset?: { x: number; y: number } | null; imageScale?: number | null },
  nextScale: number,
  slot: Size,
  centerZoom = false,
  /** The part of the slot the photo fills, when not all of it (a composer strip). */
  frame: Rect | null = null
): { imageOffset: { x: number; y: number }; imageScale: number } {
  const from = current.imageScale ?? 1;
  const offset = current.imageOffset ?? { x: 0, y: 0 };
  const anchor = (s: number, size: number) => (centerZoom ? (size * (1 - s)) / 2 : 0);
  const window = {
    x: anchor(from, slot.width) + offset.x,
    y: anchor(from, slot.height) + offset.y,
    width: slot.width * from,
    height: slot.height * from,
  };
  const zoomed = zoomWindow(
    window,
    Math.max(1, nextScale) / from,
    frame ?? { x: 0, y: 0, ...slot }
  );
  const imageScale = Math.max(1, zoomed.width / slot.width);
  return {
    imageScale,
    imageOffset: {
      x: zoomed.x - anchor(imageScale, slot.width),
      y: zoomed.y - anchor(imageScale, slot.height),
    },
  };
}
