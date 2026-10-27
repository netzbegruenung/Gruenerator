// SPDX-License-Identifier: MPL-2.0
/**
 * Drehung der Vorlagen-Elemente.
 *
 * Konva dreht um den Ursprung oben links, also verschiebt jede Drehung x/y.
 * Drehen darf deshalb nur, wessen Position einen Zustandsschlüssel hat — sonst
 * ginge die Verschiebung verloren und das Element spränge beim nächsten
 * Neuzeichnen zurück auf die Layout-Position. Die Drehung selbst steht in
 * `templateRotations`, je Element-ID.
 *
 * Hintergrundfoto und cover-gefüllte Bilder drehen nie: sie füllen ihren Platz.
 * `BACKGROUND_IMAGE_NODE_ID` ist `'background-image'`.
 */

import { normalizeRotation } from '@ggraphic/editor/utils/orientation';

import { resolveValue } from './canvasValueResolver';
import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';

import type { CanvasElementConfig, LayoutResult } from '../configs/types';

export function isTemplateElementRotatable<TState extends Record<string, unknown>>(
  config: CanvasElementConfig<TState>
): boolean {
  if (config.type === 'text') return !!config.positionStateKey;
  if (config.type !== 'image') return false;
  if (config.coverFit || config.id === BACKGROUND_IMAGE_NODE_ID) return false;
  return !!(config.positionStateKey || config.offsetKey);
}

/** Die gespeicherte Drehung eines Vorlagen-Elements in Grad; 0 ohne Eintrag. */
export function templateRotationOf(state: Record<string, unknown>, id: string): number {
  const record = state.templateRotations as Record<string, unknown> | null | undefined;
  const value = record && typeof record === 'object' ? record[id] : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** `templateRotations` with this element's turn, normalised. */
export function withTemplateRotation(
  prev: Record<string, unknown>,
  id: string,
  rotation: number
): Record<string, number> {
  const current = prev.templateRotations;
  const record =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Record<string, number>)
      : {};
  return { ...record, [id]: normalizeRotation(rotation) };
}

/**
 * Die Zustandsschlüssel, in die die Position eines Vorlagen-Elements
 * geschrieben wird. Ein `offsetKey` hält die Position relativ zur
 * Layout-Basis, `positionStateKey` absolut; ein Bild kann beide tragen.
 */
export function templatePositionUpdates<TState extends Record<string, unknown>>(
  config: CanvasElementConfig<TState>,
  x: number,
  y: number,
  state: TState,
  layout: LayoutResult
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (config.type === 'image' && config.offsetKey) {
    const baseX = resolveValue<number, TState>(config.x, state, layout);
    const baseY = resolveValue<number, TState>(config.y, state, layout);
    updates[config.offsetKey] = { x: x - baseX, y: y - baseY };
  }
  if ((config.type === 'image' || config.type === 'text') && config.positionStateKey) {
    updates[config.positionStateKey as string] = { x, y };
  }
  return updates;
}
