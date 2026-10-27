/**
 * Browser-Seite des PPTX-Exports: Seitenzustände → Modell → Datei. Texte
 * werden mit derselben Messung wie auf dem Canvas vermessen, Raster-Anfragen
 * gehen an das Stage der jeweiligen Seite, Bilder werden als PNG/JPEG geladen.
 */

import { measureTextWidthWithFont } from '@ggraphic/editor/utils/textUtils';

import { buildPptxModel, type PptxPageState } from '@ggraphic/editor/export/pptx/buildPptxModel';
import { writePptx, type PptxLoadedImage, type PptxRasterImage } from './writePptx';

import type { PptxRasterRequest } from '@ggraphic/editor/export/pptx/types';
import type { CanvasFormat } from '@ggraphic/editor/formats/index';

const PPTX_IMAGE_TYPES = ['image/png', 'image/jpeg'];
/** SVGs ohne Eigenmaße werden in dieser Breite gerastert. */
const FALLBACK_IMAGE_SIZE = 1600;

function readAsDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Ein Bild als PNG/JPEG-Data-URL mit Eigenmaßen. WebP, GIF und SVG kennt
 * nicht jedes Präsentationsprogramm, sie werden zu PNG. `null`, wenn die
 * Quelle nicht lädt (z. B. CORS) — der Writer rastert das Element dann.
 */
export async function loadPptxImage(src: string): Promise<PptxLoadedImage | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = await decode(objectUrl);
      if (!image) return null;
      const width = image.naturalWidth || FALLBACK_IMAGE_SIZE;
      const height = image.naturalHeight || FALLBACK_IMAGE_SIZE;
      if (PPTX_IMAGE_TYPES.includes(blob.type)) {
        const dataUrl = await readAsDataUrl(blob);
        return dataUrl ? { dataUrl, width, height } : null;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/png');
      canvas.width = 0;
      canvas.height = 0;
      return { dataUrl, width, height };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

export interface ExportPptxDeckOptions {
  pages: readonly PptxPageState[];
  format: CanvasFormat;
  /** Rastert ein Element der Seite `slideIndex`; null ohne Knoten. */
  rasterizeElement: (slideIndex: number, elementId: string) => Promise<PptxRasterImage | null>;
  title?: string;
  onProgress?: (done: number, total: number) => void;
}

export async function exportPptxDeck({
  pages,
  format,
  rasterizeElement,
  title,
  onProgress,
}: ExportPptxDeckOptions): Promise<Blob> {
  const model = buildPptxModel(pages, format, { measure: measureTextWidthWithFont });
  const { blob } = await writePptx(model, {
    rasterize: (request: PptxRasterRequest, slideIndex: number) =>
      rasterizeElement(slideIndex, request.elementId),
    loadImage: loadPptxImage,
    ...(title ? { title } : {}),
    ...(onProgress ? { onProgress } : {}),
  });
  return blob;
}
