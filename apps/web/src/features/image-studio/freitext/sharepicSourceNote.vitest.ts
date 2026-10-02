import { type SharepicPhotoAttribution, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { sharepicSourceNote } from './sharepicSourceNote';

type Slide = SharepicSpec['slides'][number];
const color = { background: { kind: 'farbe', color: 'tanne' } } as Slide;
const photo = { background: { kind: 'foto', filename: 'a.jpg', textSeite: 'unten' } } as Slide;
const credit = (photographer: string): SharepicPhotoAttribution => ({
  photographer,
  profileUrl: 'https://unsplash.com/@x',
  photoUrl: 'https://unsplash.com/photos/x',
});

describe('sharepicSourceNote', () => {
  it('names the Unsplash photographer and says it is no AI image', () => {
    const note = sharepicSourceNote([photo], [credit('Ada Muster')]);
    expect(note).toContain('Bilder: Stockfoto von Ada Muster auf Unsplash – kein KI-Bild.');
    expect(note).toContain('„KI-Generiert“');
  });

  it('says so when there is no photo', () => {
    const note = sharepicSourceNote([color, color], [null, null]);
    expect(note).toContain('Kein Foto, nur Farbflächen.');
    expect(note).not.toContain('Unsplash');
  });

  it('lists each slide when the sources differ', () => {
    const note = sharepicSourceNote([photo, color], [credit('Ada Muster'), null]);
    expect(note).toContain(
      'Bilder: Slide 1 Stockfoto von Ada Muster auf Unsplash, Slide 2 Farbfläche.'
    );
  });

  it('stays short for a carousel with one photographer', () => {
    const note = sharepicSourceNote([photo, photo], [credit('Ada Muster'), credit('Ada Muster')]);
    expect(note).toContain('Bilder: Stockfoto von Ada Muster auf Unsplash – kein KI-Bild.');
  });

  it('falls back without a credit', () => {
    expect(sharepicSourceNote([photo], [null])).toContain('Bilder: Stockfoto von Unsplash');
  });
});
