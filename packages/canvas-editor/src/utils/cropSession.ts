import { type CanvasElementConfig } from '../configs/types';

import { type UserImageInstance } from './userImageUtils';

/** Was ein Zuschnitt an einem eigenen Bild ändert: Rahmen und Lage des Fotos darin. */
const USER_IMAGE_CROP_FIELDS = [
  'x',
  'y',
  'width',
  'height',
  'fit',
  'panX',
  'panY',
  'cropZoom',
] as const satisfies readonly (keyof UserImageInstance)[];

/**
 * Der Zuschnitt-Zustand eines Elements beim Betreten des Modus. Gemerkt wird
 * nur, was der Modus schreibt — „Abbrechen" setzt sonst Fremdänderungen am
 * übrigen Zustand (Mitarbeitende, KI) mit zurück.
 */
export type CropSnapshot =
  | { kind: 'template'; values: Record<string, unknown> }
  | { kind: 'user-image'; id: string; fields: Partial<UserImageInstance> };

export function takeCropSnapshot(
  state: Record<string, unknown>,
  elements: readonly CanvasElementConfig[],
  id: string
): CropSnapshot | null {
  const element = elements.find((e) => e.id === id);
  if (element?.type === 'image') {
    const keys = [
      element.offsetKey,
      element.scaleKey,
      element.positionStateKey,
      element.sizeStateKey,
    ].filter((key): key is string => typeof key === 'string');
    const values: Record<string, unknown> = {};
    for (const key of keys) values[key] = state[key];
    return { kind: 'template', values };
  }
  const images = state.userImageInstances;
  const image = Array.isArray(images)
    ? (images as UserImageInstance[]).find((u) => u.id === id)
    : null;
  if (!image) return null;
  const fields: Partial<UserImageInstance> = {};
  for (const field of USER_IMAGE_CROP_FIELDS) {
    if (field in image) Object.assign(fields, { [field]: image[field] });
  }
  return { kind: 'user-image', id, fields };
}

/** Die Zustands-Teile, die den gemerkten Zuschnitt wiederherstellen; `null`, wenn das Element fehlt. */
export function restoreCropSnapshot(
  state: Record<string, unknown>,
  snapshot: CropSnapshot
): Record<string, unknown> | null {
  if (snapshot.kind === 'template') return { ...snapshot.values };
  const images = state.userImageInstances;
  if (!Array.isArray(images)) return null;
  const list = images as UserImageInstance[];
  if (!list.some((u) => u.id === snapshot.id)) return null;
  return {
    userImageInstances: list.map((u) => {
      if (u.id !== snapshot.id) return u;
      const restored: Record<string, unknown> = { ...u };
      for (const field of USER_IMAGE_CROP_FIELDS) {
        if (field in snapshot.fields) restored[field] = snapshot.fields[field];
        else delete restored[field];
      }
      return restored as unknown as UserImageInstance;
    }),
  };
}
