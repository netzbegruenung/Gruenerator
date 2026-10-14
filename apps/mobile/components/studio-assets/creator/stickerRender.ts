import { alphaBounds } from '@gruenerator/shared/profilbild';
import {
  BADGE_OUTLINE,
  BADGE_OUTLINE_COLOR,
  BADGE_PAD,
  effectPadding,
  hasTransparency,
  outlineEdgeHardness,
  outlineWorkScale,
  STICKER_MAX_SIDE,
  stickerLayout,
  type BadgeGeometry,
  type StickerEffects,
} from '@gruenerator/shared/stickers';
import {
  AlphaType,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  PaintStyle,
  Skia,
  StrokeJoin,
  type SkImage,
  type SkPaint,
  type SkSurface,
  type SkTypeface,
} from '@shopify/react-native-skia';

import { base64ToFileUri } from '../../../services/imageStudio';

import {
  badgeBaselines,
  badgeCanvas,
  discRects,
  hardenAlphaMatrix,
  tintThresholdMatrix,
} from './creatorModel';

export class StickerImageError extends Error {}

const PROCESS_ERROR = 'Das Bild konnte nicht verarbeitet werden.';
/** Picked images are scaled to this before their pixels are read. */
const READ_MAX_SIDE = STICKER_MAX_SIDE * 2;

/** GPU when available; the CPU raster surface keeps it working without one. */
function makeSurface(width: number, height: number): SkSurface {
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new StickerImageError(PROCESS_ERROR);
  return surface;
}

function snapshot(surface: SkSurface): SkImage {
  surface.flush();
  return surface.makeImageSnapshot();
}

/** A finished sticker in CPU memory, so the UI thread's canvas can draw it. */
function finished(image: SkImage): SkImage {
  return image.makeNonTextureImage() ?? image;
}

const rect = (x: number, y: number, width: number, height: number) =>
  Skia.XYWHRect(x, y, width, height);

const fullRect = (image: SkImage) => rect(0, 0, image.width(), image.height());

function smoothPaint(): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  return paint;
}

function drawScaled(surface: SkSurface, image: SkImage, dest: ReturnType<typeof rect>) {
  surface
    .getCanvas()
    .drawImageRectOptions(image, fullRect(image), dest, FilterMode.Linear, MipmapMode.None, null);
}

export async function decodeImage(uri: string): Promise<SkImage> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new StickerImageError('Das Bild konnte nicht gelesen werden.');
  return image;
}

/** Crops a picture to its visible motif and tells whether it has any transparency. */
export function motifFromImage(source: SkImage): { motif: SkImage; transparent: boolean } {
  const fit = Math.min(1, READ_MAX_SIDE / Math.max(source.width(), source.height()));
  let image = source;
  if (fit < 1) {
    const surface = makeSurface(
      Math.round(source.width() * fit),
      Math.round(source.height() * fit)
    );
    drawScaled(surface, source, rect(0, 0, surface.width(), surface.height()));
    image = snapshot(surface);
  }
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new StickerImageError(PROCESS_ERROR);
  const box = alphaBounds(pixels, width, height);
  if (!box) throw new StickerImageError('Auf dem Bild ist nichts zu sehen.');
  const surface = makeSurface(box.width, box.height);
  surface
    .getCanvas()
    .drawImageRect(
      image,
      rect(box.x, box.y, box.width, box.height),
      rect(0, 0, box.width, box.height),
      Skia.Paint()
    );
  return { motif: snapshot(surface), transparent: hasTransparency(pixels) };
}

/**
 * Die-cut outline: the silhouette, tinted and thresholded by one colour
 * matrix, is grown by Skia's dilate filter — a union of rectangles that
 * approximates a disc — at reduced resolution for wide outlines, then scaled
 * back up with a re-hardened edge under the full-resolution image.
 */
function addOutline(base: SkImage, width: number, color: string): SkImage {
  const k = outlineWorkScale(width);
  const rects = discRects(width * k);
  if (rects.length === 0) return base;
  const w = Math.max(1, Math.round(base.width() * k));
  const h = Math.max(1, Math.round(base.height() * k));
  const silhouette = Skia.ImageFilter.MakeColorFilter(
    Skia.ColorFilter.MakeMatrix(tintThresholdMatrix(color)),
    null
  );
  const paint = Skia.Paint();
  paint.setImageFilter(
    Skia.ImageFilter.MakeMerge(
      rects.map(({ rx, ry }) => Skia.ImageFilter.MakeDilate(rx, ry, silhouette))
    )
  );
  const work = makeSurface(w, h);
  work
    .getCanvas()
    .drawImageRectOptions(
      base,
      fullRect(base),
      rect(0, 0, w, h),
      FilterMode.Linear,
      MipmapMode.None,
      paint
    );

  const out = makeSurface(base.width(), base.height());
  const hardness = outlineEdgeHardness(width);
  const hardened = Skia.Paint();
  if (hardness > 1) {
    hardened.setColorFilter(Skia.ColorFilter.MakeMatrix(hardenAlphaMatrix(hardness)));
  }
  const dilated = snapshot(work);
  out
    .getCanvas()
    .drawImageRectOptions(
      dilated,
      fullRect(dilated),
      fullRect(base),
      FilterMode.Linear,
      MipmapMode.None,
      hardened
    );
  out.getCanvas().drawImage(base, 0, 0);
  return snapshot(out);
}

function addShadow(base: SkImage, blur: number, offsetY: number, opacity: number): SkImage {
  const paint = Skia.Paint();
  // A canvas shadowBlur (web) is twice the Gaussian sigma.
  paint.setImageFilter(
    Skia.ImageFilter.MakeDropShadow(
      0,
      offsetY,
      blur / 2,
      blur / 2,
      Skia.Color(`rgba(0, 0, 0, ${opacity})`),
      null
    )
  );
  const out = makeSurface(base.width(), base.height());
  out.getCanvas().drawImage(base, 0, 0, paint);
  return snapshot(out);
}

/** Trimmed motif → fitted, padded, outlined and shadowed sticker, as on web. */
export function renderImageSticker(motif: SkImage, effects: StickerEffects): SkImage {
  const layout = stickerLayout(
    { width: motif.width(), height: motif.height() },
    effectPadding(effects)
  );
  const surface = makeSurface(layout.width, layout.height);
  drawScaled(
    surface,
    motif,
    rect(
      layout.x,
      layout.y,
      Math.round(motif.width() * layout.scale),
      Math.round(motif.height() * layout.scale)
    )
  );
  let image = snapshot(surface);
  const k = layout.effectScale;
  if (effects.outline) image = addOutline(image, effects.outline.width * k, effects.outline.color);
  if (effects.shadow) {
    const { blur, offsetY, opacity } = effects.shadow;
    image = addShadow(image, blur * k, offsetY * k, opacity);
  }
  return finished(image);
}

export interface BadgeSpec {
  geometry: BadgeGeometry;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  typeface: SkTypeface;
  background: string;
  textColor: string;
  outline: boolean;
}

/** Width of a line at font size 100, for `fitFontSize`. */
export function measureBadgeLine(typeface: SkTypeface, line: string): number {
  return Skia.Font(typeface, 100).measureText(line).width;
}

/** The badge drawn straight at export size: longer side {@link STICKER_MAX_SIDE}. */
export function renderBadge(spec: BadgeSpec): SkImage {
  const { geometry, lines, fontSize, lineHeight, typeface } = spec;
  const canvasSize = badgeCanvas(geometry);
  const surface = makeSurface(
    Math.round(canvasSize.width * canvasSize.scale),
    Math.round(canvasSize.height * canvasSize.scale)
  );
  const canvas = surface.getCanvas();
  canvas.scale(canvasSize.scale, canvasSize.scale);
  canvas.translate(BADGE_PAD, BADGE_PAD);

  const path = Skia.Path.MakeFromSVGString(geometry.path);
  if (!path) throw new StickerImageError(PROCESS_ERROR);
  if (spec.outline) {
    const stroke = smoothPaint();
    stroke.setStyle(PaintStyle.Stroke);
    stroke.setStrokeWidth(BADGE_OUTLINE * 2);
    stroke.setStrokeJoin(StrokeJoin.Round);
    stroke.setColor(Skia.Color(BADGE_OUTLINE_COLOR));
    canvas.drawPath(path, stroke);
  }
  const fill = smoothPaint();
  fill.setColor(Skia.Color(spec.background));
  canvas.drawPath(path, fill);

  const font = Skia.Font(typeface, fontSize);
  const ink = smoothPaint();
  ink.setColor(Skia.Color(spec.textColor));
  const box = geometry.textBox;
  const baselines = badgeBaselines(lines.length, box, fontSize, lineHeight, font.getMetrics());
  lines.forEach((line, i) => {
    const x = box.x + (box.width - font.measureText(line).width) / 2;
    canvas.drawText(line, x, baselines[i] ?? 0, ink, font);
  });
  return finished(snapshot(surface));
}

/** A sticker as a cached PNG file, ready for the multipart upload. */
export async function writeStickerPng(image: SkImage, filename: string): Promise<string> {
  const png = image.encodeToBase64(ImageFormat.PNG, 100);
  if (!png) throw new StickerImageError('Der Sticker konnte nicht erstellt werden.');
  return base64ToFileUri(png, `${Date.now()}-${filename}`);
}
