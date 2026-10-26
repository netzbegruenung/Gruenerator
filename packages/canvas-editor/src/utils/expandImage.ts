// „Erweitern": die KI ergänzt das Foto auf das Seitenverhältnis seines Rahmens; danach liegt es wie neu eingesetzt.

import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';
import { resolveValue } from './resolveElementValue';
import { BACKGROUND_STRAIGHTEN_KEY, backgroundStraighten } from './straighten';

import type { UserImageInstance } from './userImageUtils';
import type { CanvasElementConfig, ImageElementConfig, LayoutResult } from '../configs/types';

export type ExpandResetUpdate =
  | { kind: 'template'; patch: Record<string, unknown> }
  | { kind: 'user-image'; patch: Partial<UserImageInstance> };

function backgroundConfig(
  elements: readonly CanvasElementConfig[],
  id: string
): ImageElementConfig | null {
  if (id !== BACKGROUND_IMAGE_NODE_ID) return null;
  const element = elements.find((e) => e.id === id);
  return element?.type === 'image' ? (element as ImageElementConfig) : null;
}

function userImageOf(state: Record<string, unknown>, id: string): UserImageInstance | null {
  const images = state.userImageInstances;
  return Array.isArray(images)
    ? ((images as UserImageInstance[]).find((u) => u.id === id) ?? null)
    : null;
}

/** Die Bildquelle des Elements; `null`, wenn es fehlt oder kein Foto zeigt. */
export function cropImageSrc(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  id: string
): string | null {
  const background = backgroundConfig(elements, id);
  if (background) {
    const src = background.srcKey ? state[background.srcKey] : null;
    return typeof src === 'string' && src ? src : null;
  }
  return userImageOf(state, id)?.src || null;
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
  if (!src) return null;
  const background = backgroundConfig(elements, id);
  const size = background
    ? {
        width: resolveValue(background.width, state, layout),
        height: resolveValue(background.height, state, layout),
      }
    : userImageOf(state, id);
  if (!size || !(size.width > 0 && size.height > 0)) return null;
  const fileName = background ? 'hintergrund' : userImageOf(state, id)?.fileName || 'bild';
  return { src, fileName, aspect: size.width / size.height };
}

/** Zuschnitt zurück auf den Stand eines frisch eingesetzten Fotos: mittig, Zoom 1, 0°. */
export function expandResetPatch(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  id: string
): ExpandResetUpdate | null {
  const background = backgroundConfig(elements, id);
  if (background) {
    const patch: Record<string, unknown> = {};
    if (background.offsetKey) patch[background.offsetKey] = { x: 0, y: 0 };
    if (background.scaleKey) patch[background.scaleKey] = 1;
    for (const key of [background.positionStateKey, background.sizeStateKey]) {
      if (key && state[key] != null) patch[key] = null;
    }
    if (backgroundStraighten(state) !== null) patch[BACKGROUND_STRAIGHTEN_KEY] = 0;
    return { kind: 'template', patch };
  }
  const image = userImageOf(state, id);
  if (!image) return null;
  return {
    kind: 'user-image',
    patch: {
      fit: 'cover',
      panX: 0,
      panY: 0,
      cropZoom: 1,
      ...(image.cropRotation ? { cropRotation: 0 } : {}),
    },
  };
}
