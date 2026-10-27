/**
 * Rendert ein Folienlayout offscreen mit dem echten Canvas (`StandaloneCanvas`
 * im Vorschaumodus) und liefert ein kleines JPEG — dieselben Schriften,
 * Umbrüche und Grafiken wie auf der Seite. Gleiches Muster wie
 * `renderSharepicToImage` in apps/web.
 */
import { ensureFontsReady } from '@ggraphic/editor/utils/ensureFontsReady';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { CanvasEditorProvider } from '../CanvasEditorProvider';

import {
  buildSlideLayout,
  SLIDE_LAYOUTS,
  slideLayoutConfigId,
  type SlideLayoutId,
} from './slideLayouts';

import type { BrandLocale } from '../brand/theme';
import type { GenericCanvasRef } from '../components/GenericCanvas';
import type { CanvasImageUrlService } from '../hostServices';

const SLIDE_FORMAT_ID = 'slide-16-9';
const SLIDE_WIDTH = 1920;
/** Länger wartet eine Vorschau nicht auf ihr Foto; danach ohne. */
const PHOTO_TIMEOUT_MS = 8000;
/** Nach dem Vorladen sollte das Foto aus dem Cache kommen. */
const SETTLE_TIMEOUT_MS = 3000;
const SAFETY_TIMEOUT_MS = 10000;
/** Bilder melden sich erst in den Effekten der Primitive an. */
const MOUNT_FLOOR_MS = 150;
const POLL_MS = 50;

function layoutState(id: SlideLayoutId, locale: BrandLocale) {
  const pageNumber = SLIDE_LAYOUTS.findIndex((l) => l.id === id) + 1;
  return buildSlideLayout(id, { locale, pageNumber, date: new Date() });
}

/**
 * Lädt das Foto eines Layouts vor, außerhalb der Render-Warteschlange: ein
 * langsames oder gesperrtes Foto hält so keine andere Kachel auf.
 */
export function preloadSlideLayoutPhoto(id: SlideLayoutId, locale: BrandLocale): Promise<void> {
  const src = layoutState(id, locale).currentImageSrc;
  if (typeof src !== 'string' || !src || typeof Image === 'undefined') return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(resolve, PHOTO_TIMEOUT_MS);
    img.onload = img.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
    img.src = src;
  });
}

/**
 * Null, wenn kein Bild entsteht; wirft nie. Die eigene Wurzel erbt keinen
 * Kontext, deshalb kommen die Bildadressen des Hosts als Argument.
 */
export async function renderSlideLayoutThumbnail(
  id: SlideLayoutId,
  locale: BrandLocale,
  widthPx: number,
  imageUrls: CanvasImageUrlService
): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  // Vor dem Mount: Konva misst Text beim ersten Zeichnen.
  await ensureFontsReady();
  const { StandaloneCanvas } = await import('../components/StandaloneCanvas');

  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:960px;height:540px;pointer-events:none;';
  document.body.appendChild(container);

  let root: Root | null = createRoot(container);
  let handle: GenericCanvasRef | null = null;

  root.render(
    createElement(
      CanvasEditorProvider,
      { services: { imageUrls } },
      createElement(StandaloneCanvas, {
        configId: slideLayoutConfigId(locale),
        formatId: SLIDE_FORMAT_ID,
        initialProps: layoutState(id, locale),
        preview: true,
        canvasRef: (ref: GenericCanvasRef | null) => {
          handle = ref;
        },
      })
    )
  );

  return new Promise<string | null>((resolve) => {
    const start = Date.now();
    let mountedAt: number | null = null;

    const finish = (url: string | null) => {
      clearInterval(poll);
      try {
        root?.unmount();
      } catch {
        /* schon abgebaut */
      }
      root = null;
      container.remove();
      resolve(url);
    };

    const poll = setInterval(() => {
      const now = Date.now();
      if (now - start > SAFETY_TIMEOUT_MS) return finish(null);
      const current = handle as GenericCanvasRef | null;
      if (!current) return;
      mountedAt ??= now;
      if (now - mountedAt < MOUNT_FLOOR_MS) return;
      if (current.imagesSettled() === false && now - mountedAt < SETTLE_TIMEOUT_MS) return;
      try {
        const url = current.toDataURL({
          format: 'jpeg',
          quality: 0.85,
          pixelRatio: widthPx / SLIDE_WIDTH,
        });
        finish(url && url.length > 100 ? url : null);
      } catch {
        finish(null);
      }
    }, POLL_MS);
  });
}
