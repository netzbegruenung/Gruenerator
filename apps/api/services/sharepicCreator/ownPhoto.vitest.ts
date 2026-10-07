import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { namesPhoto, ownPhotoGuard, ownPhotoKept, OWN_PHOTO_KEPT_HINWEIS } from './ownPhoto.js';

type Slide = SharepicSpec['slides'][number];
const slide = (background: Slide['background'], headline = 'Radweg jetzt'): Slide => ({
  background,
  position: 'unten',
  align: 'links',
  items: [{ type: 'headline', lines: [headline] }],
  logo: false,
});
const PHOTO: Slide['background'] = { kind: 'foto', filename: 'upload:1', textSeite: 'unten' };
const TANNE: Slide['background'] = { kind: 'farbe', color: 'tanne' };
const deck = (...slides: Slide[]): SharepicSpec => ({ locale: 'de-DE', slides });

describe('namesPhoto', () => {
  it.each([
    'Ersetze das Foto durch eine Fläche',
    'Bitte ohne Foto',
    'Nimm ein anderes Bild',
    'Das Hintergrundbild soll weg',
    'Andere Aufnahme bitte',
  ])('true for "%s"', (text) => expect(namesPhoto(text)).toBe(true));

  it.each(['Ändere die Hintergrundfarbe auf Tanne', 'Bildung stärken'])('false for "%s"', (text) =>
    expect(namesPhoto(text)).toBe(false)
  );
});

describe('ownPhotoKept', () => {
  const current = deck(slide(PHOTO), slide(TANNE, 'Zweite'));

  it('rejects a draft that swaps the own photo for a colour', () => {
    const result = ownPhotoKept(current, deck(slide(TANNE), slide(TANNE, 'Zweite')), 'Tanne bitte');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.slides).toEqual([0]);
    expect(result.error).toContain('upload:1');
    expect(result.error).toContain('foto-oben');
    expect(result.restored.slides[0]!.background).toEqual(PHOTO);
    expect(result.restored.slides[1]!.background).toEqual(TANNE);
  });

  it('accepts the photo kept under another layout', () => {
    const draft = deck(
      slide({ kind: 'foto-oben', filename: 'upload:1', panelColor: 'tanne' }),
      slide(TANNE, 'Zweite')
    );
    expect(ownPhotoKept(current, draft, 'Tanne bitte').ok).toBe(true);
  });

  it('accepts when the instruction names the photo', () => {
    const draft = deck(slide(TANNE), slide(TANNE, 'Zweite'));
    expect(ownPhotoKept(current, draft, 'Ersetze das Foto durch eine Fläche').ok).toBe(true);
  });

  it('accepts a deck without own photos', () => {
    expect(ownPhotoKept(deck(slide(TANNE)), deck(slide(TANNE)), 'Tanne').ok).toBe(true);
  });

  it('with a different slide count, accepts the photo anywhere in the draft', () => {
    const draft = deck(slide(TANNE, 'Neu'), slide(PHOTO), slide(TANNE, 'Zweite'));
    expect(ownPhotoKept(current, draft, 'Neue erste Folie').ok).toBe(true);
  });

  it('with a different slide count, rejects when the photo is gone everywhere', () => {
    const result = ownPhotoKept(current, deck(slide(TANNE)), 'Nur eine Folie');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.restored.slides).toHaveLength(1);
    expect(result.restored.slides[0]!.background).toEqual(PHOTO);
  });
});

describe('ownPhotoGuard', () => {
  const current = deck(slide(PHOTO));
  const lost = { spec: deck(slide(TANNE)), scene: null };

  it('passes everything through without a current draft', () => {
    const guard = ownPhotoGuard(null, 'Tanne');
    expect(guard.check(lost)).toEqual({ ok: true, value: lost });
    expect(guard.fallback('irgendwas')).toBeNull();
  });

  it('rejects, then offers the restored draft only for its own last rejection', () => {
    const guard = ownPhotoGuard(current, 'Tanne');
    const checked = guard.check(lost);
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(guard.fallback('ein anderer Fehler')).toBeNull();
    const kept = guard.fallback(checked.error);
    expect(kept!.spec.slides[0]!.background).toEqual(PHOTO);
    expect(kept!.hinweis).toBe(OWN_PHOTO_KEPT_HINWEIS);
  });

  it('drops a scene painted over the restored slide', () => {
    const guard = ownPhotoGuard(current, 'Tanne');
    const checked = guard.check({ spec: deck(slide(TANNE)), scene: { slide: 0 } });
    if (checked.ok) throw new Error('expected a rejection');
    expect(guard.fallback(checked.error)!.scene).toBeNull();
  });
});
