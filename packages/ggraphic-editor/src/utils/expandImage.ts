// SPDX-License-Identifier: MPL-2.0
// „Erweitern": die KI ergänzt das Foto auf das Seitenverhältnis seines Rahmens; danach liegt es wie neu eingesetzt.

import { BACKGROUND_STRAIGHTEN_KEY, backgroundStraighten } from '@ggraphic/editor/utils/straighten';

import { cropTargetOf, type CropUpdate } from './cropTarget';
import { resolveValue } from './resolveElementValue';

import type { CanvasElementConfig, LayoutResult } from '../configs/types';

/** Die Bildquelle des Elements; `null`, wenn es fehlt oder kein Foto zeigt. */
export function cropImageSrc(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  id: string
): string | null {
  const target = cropTargetOf(state, elements, id);
  if (!target) return null;
  if (target.kind === 'user-image') return target.image.src || null;
  const src = target.config.srcKey ? state[target.config.srcKey] : null;
  return typeof src === 'string' && src ? src : null;
}

/**
 * Was erweitert wird: die Quelle und das Zielverhältnis (Breite/Höhe) —
 * beim Hintergrund das Fenster bei Zoom 1 (Seitenformat), beim eigenen Bild der Rahmen.
 */
export function expandTarget(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  layout: LayoutResult,
  id: string
): { src: string; fileName: string; aspect: number } | null {
  const src = cropImageSrc(state, elements, id);
  const target = cropTargetOf(state, elements, id);
  if (!src || !target) return null;
  const size =
    target.kind === 'background'
      ? {
          width: resolveValue(target.config.width, state, layout),
          height: resolveValue(target.config.height, state, layout),
        }
      : target.image;
  if (!(size.width > 0 && size.height > 0)) return null;
  const fileName = target.kind === 'background' ? 'hintergrund' : target.image.fileName || 'bild';
  return { src, fileName, aspect: size.width / size.height };
}

/** Zuschnitt zurück auf den Stand eines frisch eingesetzten Fotos: mittig, Zoom 1, 0°. */
export function expandResetPatch(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  id: string
): CropUpdate | null {
  const target = cropTargetOf(state, elements, id);
  if (!target) return null;
  if (target.kind === 'background') {
    const background = target.config;
    const patch: Record<string, unknown> = {};
    if (background.offsetKey) patch[background.offsetKey] = { x: 0, y: 0 };
    if (background.scaleKey) patch[background.scaleKey] = 1;
    for (const key of [background.positionStateKey, background.sizeStateKey]) {
      if (key && state[key] != null) patch[key] = null;
    }
    if (backgroundStraighten(state) !== null) patch[BACKGROUND_STRAIGHTEN_KEY] = 0;
    return { kind: 'template', patch };
  }
  return {
    kind: 'user-image',
    patch: {
      fit: 'cover',
      panX: 0,
      panY: 0,
      cropZoom: 1,
      ...(target.image.cropRotation ? { cropRotation: 0 } : {}),
    },
  };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** „foto.png" → „foto-erweitert.jpg": der Name bleibt erkennbar, die Endung folgt dem gelieferten Format. */
export function expandedFileName(original: string, type: string): string {
  const stem = original.replace(/\.[a-z0-9]+$/i, '') || 'bild';
  return `${stem}-erweitert.${EXTENSIONS[type] ?? 'png'}`;
}
