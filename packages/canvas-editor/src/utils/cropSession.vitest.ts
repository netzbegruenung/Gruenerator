import { describe, expect, it } from 'vitest';

import { restoreCropSnapshot, takeCropSnapshot } from './cropSession';

import type { UserImageInstance } from './userImageUtils';
import type { CanvasElementConfig } from '../configs/types';

const elements: CanvasElementConfig[] = [
  {
    id: 'background-image',
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    offsetKey: 'imageOffset',
    scaleKey: 'imageScale',
  },
];

const photo: UserImageInstance = {
  id: 'photo',
  src: '/p.jpg',
  fileName: 'p.jpg',
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

describe('Zuschnitt-Schnappschuss', () => {
  it('Hintergrundfoto: merkt Versatz und Zoom aus den Schlüsseln der Vorlage', () => {
    const state = { imageOffset: { x: 0, y: 0 }, imageScale: 1, line1: 'a' };
    const snapshot = takeCropSnapshot(state, elements, 'background-image')!;
    const later = { imageOffset: { x: 40, y: -5 }, imageScale: 1.8, line1: 'b' };
    expect(restoreCropSnapshot(later, snapshot)).toEqual({
      imageOffset: { x: 0, y: 0 },
      imageScale: 1,
    });
  });

  it('eigenes Bild: stellt Rahmen und Foto-Lage her, entfernt Felder, die es vorher nicht gab', () => {
    const other = { ...photo, id: 'other' };
    const snapshot = takeCropSnapshot({ userImageInstances: [photo, other] }, elements, 'photo')!;
    const cropped = {
      ...photo,
      x: 60,
      width: 150,
      fit: 'cover' as const,
      panX: 0.2,
      panY: 0.5,
      cropZoom: 2,
      opacity: 0.5,
    };
    const movedOther = { ...other, x: 99 };
    const restored = restoreCropSnapshot({ userImageInstances: [cropped, movedOther] }, snapshot)!;
    const images = restored.userImageInstances as UserImageInstance[];
    expect(images[0]).toEqual({ ...photo, opacity: 0.5 });
    expect(images[0]).not.toHaveProperty('cropZoom');
    expect(images[1]).toBe(movedOther);
  });

  it('ein inzwischen entferntes Bild stellt nichts her', () => {
    const snapshot = takeCropSnapshot({ userImageInstances: [photo] }, elements, 'photo')!;
    expect(restoreCropSnapshot({ userImageInstances: [] }, snapshot)).toBeNull();
    expect(takeCropSnapshot({ userImageInstances: [] }, elements, 'photo')).toBeNull();
  });
});
