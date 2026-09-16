/**
 * renderSharepicToImage — Offscreen canvas rendering for sharepic previews
 *
 * Mounts a StandaloneCanvas in a hidden container, waits for Konva to render,
 * captures the canvas as a data URL, and cleans up.
 *
 * Two things make this expensive enough to need a queue. Every call mounts a
 * whole React root with a full Konva stage, and a chat thread asks for many at
 * once: the hero card and each variant chip render independently, so one
 * sharepic answer alone is four calls. And the capture is a PNG encode of the
 * entire canvas — at the export default of `pixelRatio: 2` a 1200px template
 * encodes 2400x3000 pixels, which is what both a 420px hero and a 96px chip
 * used to get.
 *
 * So: renders run one at a time, identical requests share one render, and the
 * preview is captured at preview size. Full resolution stays with the paths
 * that actually need it (download, studio, gallery thumbnails).
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { createSerialQueue } from './serialRenderQueue';

import type { CanvasConfigId } from '@gruenerator/canvas-editor';
import type { Root } from 'react-dom/client';

/**
 * Capture scale for chat previews, as a factor of the template's logical
 * width — `CanvasStage.toDataURL` compensates for display scaling, so the
 * output is always `logicalWidth * pixelRatio` regardless of how large the
 * offscreen stage happened to lay itself out.
 *
 * 0.7 puts a 1200px template at 840x1050: still 2x the 420px hero cap for
 * retina, and ~8x fewer pixels to encode, hold and decode than the export
 * default. The chips are the same image scaled down by CSS.
 */
const PREVIEW_PIXEL_RATIO = 0.7;

/**
 * Export scale, for the one path whose pixels leave the app: the download
 * button. Matches `captureStageImage`'s default, which is what every preview
 * used to get.
 */
const FULL_PIXEL_RATIO = 2;

interface CanvasHandle {
  toDataURL: (options?: { pixelRatio?: number }) => string | undefined;
}

function cleanup(root: Root | null, container: HTMLDivElement | null) {
  try {
    root?.unmount();
  } catch {
    /* already unmounted */
  }
  container?.remove();
}

function runRender(
  canvasType: string,
  initialProps: Record<string, unknown>,
  pixelRatio: number
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    void (async () => {
      const { StandaloneCanvas, ensureFontsReady } = await import('@gruenerator/canvas-editor');

      const container = document.createElement('div');
      container.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1200px;height:1500px;';
      document.body.appendChild(container);

      let root: Root | null = null;
      let resolved = false;
      let canvasRef: CanvasHandle | null = null;

      root = createRoot(container);
      root.render(
        createElement(StandaloneCanvas, {
          configId: canvasType as CanvasConfigId,
          initialProps,
          // Nothing here is ever clicked, dragged or saved. `preview` drops the
          // editor machinery that would otherwise run in a hidden div: gallery
          // auto-save (network writes plus its own pixelRatio-2 capture every
          // 1500ms), keyboard/undo listeners, and Konva's hit graph.
          preview: true,
          canvasRef: (ref: CanvasHandle | null) => {
            canvasRef = ref;
          },
        })
      );

      // Awaited once, not once per poll: a capture that beats the brand
      // @font-face loads bakes in the fallback face. It is idempotent, but the
      // old code paid for it on every 100ms tick of every concurrent render.
      await ensureFontsReady();

      // Poll for canvas readiness instead of blind timeout
      const maxWaitMs = 5000;
      const pollIntervalMs = 100;
      const startTime = Date.now();

      const finish = (dataUrl: string | null) => {
        clearInterval(pollTimer);
        clearTimeout(safetyTimer);
        resolved = true;
        cleanup(root, container);
        resolve(dataUrl);
      };

      const pollTimer = setInterval(() => {
        if (resolved) return;

        if (!canvasRef || Date.now() - startTime < 500) return;

        if (Date.now() - startTime > maxWaitMs) {
          finish(null);
          return;
        }

        try {
          const dataUrl = canvasRef.toDataURL({ pixelRatio });
          if (dataUrl && dataUrl.length > 100) finish(dataUrl);
        } catch {
          // Canvas not ready yet, keep polling
        }
      }, pollIntervalMs);

      // Safety timeout
      const safetyTimer = setTimeout(() => {
        if (!resolved) finish(null);
      }, maxWaitMs + 500);
    })();
  });
}

const queue = createSerialQueue<string | null>();

function keyFor(
  canvasType: string,
  initialProps: Record<string, unknown>,
  quality: string
): string {
  try {
    return `${quality}:${canvasType}:${JSON.stringify(initialProps)}`;
  } catch {
    // Circular or otherwise unserialisable props: use a key that can never
    // match, so the render still happens — it just does not dedupe.
    return `${quality}:${canvasType}:${Math.random()}`;
  }
}

/**
 * Renders one sharepic preview, or resolves null when it cannot be produced.
 *
 * Never rejects: a missing preview is a state the cards already draw, not an
 * exception every call site would have to catch.
 */
export function renderSharepicToImage(
  canvasType: string,
  initialProps: Record<string, unknown>,
  options?: { quality?: 'preview' | 'full' }
): Promise<string | null> {
  const quality = options?.quality ?? 'preview';
  const pixelRatio = quality === 'full' ? FULL_PIXEL_RATIO : PREVIEW_PIXEL_RATIO;
  return queue.run(keyFor(canvasType, initialProps, quality), () =>
    runRender(canvasType, initialProps, pixelRatio)
  );
}
