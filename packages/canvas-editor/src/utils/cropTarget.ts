// Worauf die Zuschneide-Werkzeuge (Begradigen, Automatisch, Erweitern) wirken: eine Tür für alle drei.

import { BACKGROUND_IMAGE_NODE_ID } from './printImageInfo';

import type { UserImageInstance } from './userImageUtils';
import type { CanvasElementConfig, ImageElementConfig } from '../configs/types';

/** Was ein Zuschneide-Werkzeug schreibt: Seitenzustand der Vorlage oder ein Patch am eigenen Bild. */
export type CropUpdate =
  | { kind: 'template'; patch: Record<string, unknown> }
  | { kind: 'user-image'; patch: Partial<UserImageInstance> };

export type CropTarget =
  | { kind: 'background'; config: ImageElementConfig }
  | { kind: 'user-image'; image: UserImageInstance };

export function userImageOf(state: Record<string, unknown>, id: string): UserImageInstance | null {
  const images = state.userImageInstances;
  return Array.isArray(images)
    ? ((images as UserImageInstance[]).find((u) => u.id === id) ?? null)
    : null;
}

// Nur ein cover-gefittetes Hintergrundfoto hat einen Ausschnitt-Modus; ohne coverFit gibt es nichts zu verschieben.
export function backgroundCropConfig(
  elements: readonly CanvasElementConfig[],
  id: string
): ImageElementConfig | null {
  if (id !== BACKGROUND_IMAGE_NODE_ID) return null;
  const element = elements.find((e) => e.id === id);
  return element?.type === 'image' && element.coverFit ? (element as ImageElementConfig) : null;
}

export function cropTargetOf(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  id: string
): CropTarget | null {
  const config = backgroundCropConfig(elements, id);
  if (config) return { kind: 'background', config };
  if (id === BACKGROUND_IMAGE_NODE_ID) return null;
  const image = userImageOf(state, id);
  return image ? { kind: 'user-image', image } : null;
}
