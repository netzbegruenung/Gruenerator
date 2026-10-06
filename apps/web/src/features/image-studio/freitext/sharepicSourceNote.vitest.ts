import { type SharepicPhotoAttribution, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { sharepicSourceNote } from './sharepicSourceNote';

type Slide = SharepicSpec['slides'][number];
const base: Omit<Slide, 'background'> = {
  position: 'unten',
  align: 'links',
  logo: false,
  items: [],
};
const color: Slide = { ...base, background: { kind: 'farbe', color: 'tanne' } };
const photo: Slide = {
  background: { kind: 'foto', filename: 'a.jpg', textSeite: 'unten' },
  ...base,
};
const credit = (photographer: string): SharepicPhotoAttribution => ({
  photographer,
  profileUrl: 'https://unsplash.com/@x',
  photoUrl: 'https://unsplash.com/photos/x',
});

const own: Slide = {
  background: { kind: 'foto', filename: 'upload:1', textSeite: 'unten' },
  ...base,
};

describe('sharepicSourceNote', () => {
  it('calls an own photo an own photo — no photographer, no Unsplash — and says it is no AI image', () => {
    const note = sharepicSourceNote([own], [null]);
    expect(note).toContain('Bilder: Eigenes Foto – kein KI-Bild.');
    expect(note).not.toContain('Unsplash');
  });

  it('keeps own and stock photos apart per slide', () => {
    const note = sharepicSourceNote([own, photo], [null, credit('Ada Muster')]);
    expect(note).toContain(
      'Slide 1 Eigenes Foto, Slide 2 Stockfoto von Ada Muster auf Unsplash – kein KI-Bild.'
    );
  });

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
      'Bilder: Slide 1 Stockfoto von Ada Muster auf Unsplash, Slide 2 Farbfläche – kein KI-Bild.'
    );
  });

  it('stays short for a carousel with one photographer', () => {
    const note = sharepicSourceNote([photo, photo], [credit('Ada Muster'), credit('Ada Muster')]);
    expect(note).toContain('Bilder: Stockfoto von Ada Muster auf Unsplash – kein KI-Bild.');
  });

  it('falls back without a credit', () => {
    expect(sharepicSourceNote([photo], [null])).toContain('Bilder: Stockfoto von Unsplash');
  });

  it('names painted infographic illustrations as AI images', () => {
    const info = {
      ...color,
      items: [
        {
          type: 'infografik',
          form: 'raster',
          punkte: [
            { titel: 'Rad', icon: 'fahrrad', bild: 'ki:abcdefghijklmnop1234' },
            { titel: 'Bus', icon: 'bus' },
          ],
        },
      ],
    } as unknown as Slide;
    expect(sharepicSourceNote([info], [null])).toContain('Die Illustrationen sind KI-generiert.');
    expect(sharepicSourceNote([color], [null])).not.toContain('Illustrationen');
  });
});
