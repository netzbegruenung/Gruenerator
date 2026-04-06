/**
 * renderSharepicToImage — Offscreen canvas rendering for sharepic previews
 *
 * Mounts a StandaloneCanvas in a hidden container, waits for Konva to render,
 * captures the canvas as a data URL, and cleans up.
 */

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import type { CanvasConfigId } from '@gruenerator/canvas-editor';
import type { Root } from 'react-dom/client';

function cleanup(root: Root | null, container: HTMLDivElement | null) {
  try { root?.unmount(); } catch { /* already unmounted */ }
  container?.remove();
}

export async function renderSharepicToImage(
  canvasType: string,
  initialProps: Record<string, unknown>
): Promise<string | null> {
  const { StandaloneCanvas } = await import('@gruenerator/canvas-editor');

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1200px;height:1500px;';
  document.body.appendChild(container);

  let root: Root | null = null;

  return new Promise<string | null>((resolve) => {
    let resolved = false;
    let canvasRef: { captureCanvas: () => Promise<string | null> } | null = null;

    root = createRoot(container);
    root.render(
      createElement(StandaloneCanvas, {
        configId: canvasType as CanvasConfigId,
        initialProps,
        canvasRef: (ref: { captureCanvas: () => Promise<string | null> } | null) => {
          canvasRef = ref;
        },
      })
    );

    // Poll for canvas readiness instead of blind timeout
    const maxWaitMs = 5000;
    const pollIntervalMs = 100;
    const startTime = Date.now();

    const pollTimer = setInterval(async () => {
      if (resolved) return;

      if (!canvasRef || Date.now() - startTime < 500) return;

      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(pollTimer);
        resolved = true;
        cleanup(root, container);
        resolve(null);
        return;
      }

      try {
        const dataUrl = await canvasRef.captureCanvas();
        if (dataUrl && dataUrl.length > 100) {
          clearInterval(pollTimer);
          resolved = true;
          cleanup(root, container);
          resolve(dataUrl);
        }
      } catch {
        // Canvas not ready yet, keep polling
      }
    }, pollIntervalMs);

    // Safety timeout
    setTimeout(() => {
      if (!resolved) {
        clearInterval(pollTimer);
        resolved = true;
        cleanup(root, container);
        resolve(null);
      }
    }, maxWaitMs + 500);
  });
}
