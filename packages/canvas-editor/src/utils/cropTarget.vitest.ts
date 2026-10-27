import { describe, expect, it } from 'vitest';

import { canCropBackgroundPhoto } from './backgroundPhotoCrop';
import { canEnterCrop, cropTargetOf } from './cropTarget';
import { expandedFileName, expandTarget } from './expandImage';
import { smartCropView } from './smartCrop';
import { userFacingError, userFacingMessage } from './userFacingError';

import type { CanvasElementConfig } from '../configs/types';

const background = (coverFit: boolean): CanvasElementConfig[] => [
  {
    id: 'background-image',
    type: 'image',
    x: 0,
    y: 0,
    width: 1080,
    height: 1350,
    srcKey: 'currentImageSrc',
    offsetKey: 'imageOffset',
    scaleKey: 'imageScale',
    coverFit,
  },
];

const photo = {
  id: 'photo',
  src: '/p.jpg',
  fileName: 'p.jpg',
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

describe('Ziel der Zuschneide-Werkzeuge', () => {
  it('ist das Hintergrundfoto nur mit coverFit, für alle Werkzeuge gleich', () => {
    const state = { currentImageSrc: '/bg.jpg', userImageInstances: [photo] };
    expect(cropTargetOf(state, background(true), 'background-image')?.kind).toBe('background');
    expect(cropTargetOf(state, background(false), 'background-image')).toBeNull();
    // Erweitern und Automatisch folgen derselben Regel.
    expect(expandTarget(state, background(false), {}, 'background-image')).toBeNull();
    expect(expandTarget(state, background(true), {}, 'background-image')).not.toBeNull();
    const natural = { width: 1200, height: 800 };
    const input = (coverFit: boolean) => ({
      id: 'background-image',
      state,
      elements: background(coverFit),
      layout: {},
      natural,
    });
    expect(smartCropView(input(false))).toBeNull();
    expect(smartCropView(input(true))).not.toBeNull();
  });

  it('findet eigene Bilder und sonst nichts', () => {
    const state = { userImageInstances: [photo] };
    expect(cropTargetOf(state, background(true), 'photo')).toEqual({
      kind: 'user-image',
      image: photo,
    });
    expect(cropTargetOf(state, background(true), 'missing')).toBeNull();
  });
});

describe('Zuschneide-Modus betreten', () => {
  it('nur für ein cover-gefittetes Hintergrundfoto oder ein eigenes Bild', () => {
    const state = { currentImageSrc: '/bg.jpg', userImageInstances: [photo] };
    const draggable = (coverFit: boolean) =>
      background(coverFit).map((e) => ({ ...e, draggable: true }));
    expect(canEnterCrop(state, draggable(true), 'background-image')).toBe(true);
    expect(canEnterCrop(state, draggable(false), 'background-image')).toBe(false);
    expect(canCropBackgroundPhoto({ id: 'background-image', draggable: true })).toBe(false);
    expect(canEnterCrop(state, draggable(true), 'photo')).toBe(true);
    expect(canEnterCrop(state, draggable(true), 'headline')).toBe(false);
  });
});

describe('Erweitern: Dateiname und Fehlermeldung', () => {
  it('behält den Namen und nimmt die Endung vom Format', () => {
    expect(expandedFileName('urlaub.PNG', 'image/jpeg')).toBe('urlaub-erweitert.jpg');
    expect(expandedFileName('hintergrund', 'image/png')).toBe('hintergrund-erweitert.png');
    expect(expandedFileName('', 'image/webp')).toBe('bild-erweitert.webp');
  });

  it('zeigt nur ausdrücklich für Menschen geschriebene Meldungen', () => {
    expect(userFacingMessage(userFacingError('Budget aufgebraucht.'))).toBe('Budget aufgebraucht.');
    expect(userFacingMessage(new TypeError('Failed to fetch'))).toBeNull();
    expect(userFacingMessage('Budget')).toBeNull();
    expect(
      userFacingMessage(Object.assign(new Error('Einwilligung fehlt.'), { userFacing: true }))
    ).toBe('Einwilligung fehlt.');
  });
});
