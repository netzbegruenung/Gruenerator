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

import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';

import type { CanvasElementConfig } from '../configs/types';

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
