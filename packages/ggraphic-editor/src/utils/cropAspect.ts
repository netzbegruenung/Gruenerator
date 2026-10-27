// SPDX-License-Identifier: MPL-2.0
import { messages } from '@ggraphic/editor/i18n/messages';

import { type Rect, type Size } from './coverFit';

/** Seitenverhältnis-Vorgaben im Zuschneide-Modus eigener Bilder, in Anzeige-Reihenfolge. */
export const CROP_ASPECT_PRESETS = [
  {
    id: 'free',
    get label() {
      return messages().crop.free;
    },
    ratio: null,
  },
  {
    id: 'original',
    get label() {
      return messages().crop.original;
    },
    ratio: null,
  },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
] as const;

export type CropAspectId = (typeof CROP_ASPECT_PRESETS)[number]['id'];

export function isCropAspectId(value: string): value is CropAspectId {
  return CROP_ASPECT_PRESETS.some((preset) => preset.id === value);
}

/** Breite ÷ Höhe der Vorgabe; `null` bei „Freiform". „Original" ist das Verhältnis des Fotos. */
export function cropAspectRatio(id: CropAspectId, natural: Size): number | null {
  if (id === 'original') return natural.width / natural.height;
  return CROP_ASPECT_PRESETS.find((preset) => preset.id === id)?.ratio ?? null;
}

/**
 * Der Rahmen für eine Vorgabe: das größte Rechteck mit `ratio`, das ins Foto
 * passt, um die Mitte des aktuellen Rahmens — und so weit verschoben, wie es
 * nötig ist, damit es ganz auf dem Foto liegt. Gemessen am Foto statt am
 * aktuellen Rahmen, damit ein Wechsel zwischen Vorgaben den Rahmen nicht
 * Schritt für Schritt schrumpfen lässt.
 */
export function frameForAspect(frame: Rect, photo: Rect, ratio: number): Rect {
  const width = Math.min(photo.width, photo.height * ratio);
  const height = width / ratio;
  const centre = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    x: clamp(centre.x - width / 2, photo.x, photo.x + photo.width - width),
    y: clamp(centre.y - height / 2, photo.y, photo.y + photo.height - height),
    width,
    height,
  };
}
