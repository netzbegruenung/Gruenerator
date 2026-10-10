import {
  clampPerson,
  PROFILBILD_SIZE,
  PROFILBILD_SNAP_THRESHOLD,
  snapPerson,
  type Rect,
  type SnapResult,
} from '@gruenerator/shared/profilbild';

import type { ProfilbildModel, SceneSticker } from '../../components/profilbild/sceneModel';

export const MIN_PERSON_SCALE = 0.4;
export const MAX_PERSON_SCALE = 1.6;

export function viewToCanvas(d: number, viewSize: number): number {
  return (d * PROFILBILD_SIZE) / viewSize;
}

export function snapThreshold(viewSize: number): number {
  return viewToCanvas(PROFILBILD_SNAP_THRESHOLD, viewSize);
}

export function dragPerson(start: Rect, dx: number, dy: number, threshold: number): SnapResult {
  const moved = { ...start, x: start.x + dx, y: start.y + dy };
  return snapPerson(
    { ...moved, ...clampPerson(moved, PROFILBILD_SIZE) },
    PROFILBILD_SIZE,
    threshold
  );
}

export function pinchScale(startScale: number, factor: number): number {
  return Math.min(Math.max(startScale * factor, MIN_PERSON_SCALE), MAX_PERSON_SCALE);
}

export function hitSticker(stickers: SceneSticker[], x: number, y: number): string | null {
  for (let i = stickers.length - 1; i >= 0; i--) {
    const s = stickers[i];
    const rad = (s.rotation * Math.PI) / 180;
    const dx = x - s.x;
    const dy = y - s.y;
    const lx = dx * Math.cos(rad) + dy * Math.sin(rad);
    const ly = -dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= s.width / 2 && Math.abs(ly) <= s.height / 2) return s.uid;
  }
  return null;
}

const roundTo = (v: number, decimals: number) => Math.round(v * 10 ** decimals) / 10 ** decimals;

export function roundModel(model: ProfilbildModel): ProfilbildModel {
  const { person } = model;
  return {
    ...model,
    person: { x: Math.round(person.x), y: Math.round(person.y), scale: roundTo(person.scale, 3) },
    stickers: model.stickers.map((s) => ({
      ...s,
      x: Math.round(s.x),
      y: Math.round(s.y),
      width: Math.round(s.width),
      height: Math.round(s.height),
      rotation: roundTo(s.rotation, 1),
    })),
  };
}

export interface LiveGesture {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  scaleBase: number;
  rotationBase: number;
}

export function restGesture(): LiveGesture {
  return { dx: 0, dy: 0, scale: 1, rotation: 0, scaleBase: 1, rotationBase: 0 };
}

export function startPinch(g: LiveGesture): LiveGesture {
  return { ...g, scaleBase: g.scale };
}

export function updatePinch(g: LiveGesture, scale: number): LiveGesture {
  return { ...g, scale: g.scaleBase * scale };
}

export function startRotation(g: LiveGesture): LiveGesture {
  return { ...g, rotationBase: g.rotation };
}

export function updateRotation(g: LiveGesture, rotation: number): LiveGesture {
  return { ...g, rotation: g.rotationBase + rotation };
}
