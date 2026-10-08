import {
  namedSharepicSlides,
  type SharepicPhotoAttribution,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { sharepicRevisionReply } from './sharepicRevisionReply';

type Slide = SharepicSpec['slides'][number];

const slide = (lines: string[], extra: Partial<Slide> = {}): Slide => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines }],
  logo: false,
  ...extra,
});
const quoteSlide: Slide = {
  ...slide([]),
  items: [
    { type: 'zitat', text: 'Wer auf dem Land wohnt, braucht einen Bus.', name: 'Anna Muster' },
  ],
};
const deck = (...slides: Slide[]): SharepicSpec => ({ locale: 'de-DE', slides });
const before = deck(
  slide(['5 Gründe für', 'mehr ==Radwege==']),
  slide(['Sicherer', 'für alle']),
  slide(['Gesünder'])
);
const credit = (photographer: string): SharepicPhotoAttribution => ({
  photographer,
  profileUrl: 'https://unsplash.com/@x',
  photoUrl: 'https://unsplash.com/photos/x',
});
const reply = (
  after: SharepicSpec,
  order: string,
  from: SharepicSpec = before,
  hinweis: string | null = null,
  attributions: (SharepicPhotoAttribution | null)[] = after.slides.map(() => null)
) => sharepicRevisionReply({ before: from, after, order, hinweis, attributions });

describe('sharepicRevisionReply', () => {
  it('names the new headline of the slide that changed', () => {
    const after = deck(
      slide(['Mehr ==Radwege==', 'für eine', 'bessere Stadt']),
      ...before.slides.slice(1)
    );
    const text = reply(after, 'bei der 1. slide einen anderen text wählen');
    expect(text).toBe(
      'Erledigt – Folie 1: Überschrift jetzt „Mehr Radwege für eine bessere Stadt“.'
    );
  });

  it('does not confirm when the named slide stayed as it was, and says what changed instead', () => {
    const after = deck(before.slides[0]!, slide(['Sicher', 'für alle']), before.slides[2]!);
    const text = reply(after, 'bei der 1. slide einen anderen text wählen');
    expect(text).not.toMatch(/Erledigt/);
    expect(text).toMatch(/^Folie 1 hat sich nicht geändert\./);
    expect(text).toContain(
      'Geändert hat sich stattdessen Folie 2: Überschrift jetzt „Sicher für alle“.'
    );
    expect(text).toContain('im Editor');
  });

  it('reads „Slide 3“, „Folie 3“ and „dritte Folie“ alike', () => {
    for (const order of [
      'Slide 3 anderer Text',
      'Folie 3 bitte anders',
      'auf der dritten Folie was anderes',
    ]) {
      expect(reply(before, order)).toMatch(/^Folie 3 hat sich nicht geändert\./);
    }
  });

  it('takes „5 Slides“ for a count and „letzte Folie“ for the last slide', () => {
    const five = deck(...Array.from({ length: 5 }, () => slide(['Text']))).slides;
    expect(namedSharepicSlides('Karussell mit 5 Slides', five)).toEqual([]);
    expect(namedSharepicSlides('die letzte Folie kürzer', five)).toEqual([4]);
    expect(namedSharepicSlides('Slide 9 anders', five)).toEqual([]);
  });

  it('finds a slide by what it shows: „Folie mit dem Zitat“, „Zitat-Folie“, „beim Zitat“', () => {
    const slides = deck(slide(['Busse']), quoteSlide, slide(['Jetzt'])).slides;
    for (const order of [
      'Bei der Folie mit dem Zitat bitte einen anderen Zitattext nehmen',
      'die Zitat-Folie anders',
      'die Zitatfolie anders',
      'beim Zitat was anderes',
    ]) {
      expect(namedSharepicSlides(order, slides)).toEqual([1]);
    }
    // Nothing on the deck matches: no slide is named, the reply stays general.
    expect(namedSharepicSlides('beim Diagramm andere Farben', slides)).toEqual([]);
    // „Text“ and „Überschrift“ stand on nearly every slide: no content reference.
    expect(namedSharepicSlides('einen anderen Text bei der Überschrift', slides)).toEqual([]);
  });

  it('names every slide that matches a content reference', () => {
    const slides = deck(quoteSlide, slide(['Busse']), quoteSlide).slides;
    expect(namedSharepicSlides('Slide mit dem Zitat kürzer', slides)).toEqual([0, 2]);
  });

  it('gives the quote reason for a slide named by its quote (live round 2)', () => {
    const quotes = deck(slide(['Busse']), quoteSlide);
    const text = reply(
      quotes,
      'Bei der Folie mit dem Zitat bitte einen anderen Zitattext nehmen',
      quotes
    );
    expect(text).toMatch(/^Folie 2 hat sich nicht geändert\./);
    expect(text).toContain('Ein Zitat übernehme ich nur wörtlich');
  });

  it('calls a deck that differs only in key order unchanged', () => {
    const reordered = JSON.parse(
      JSON.stringify({
        slides: before.slides.map(({ logo, ...rest }) => ({ logo, ...rest })),
        locale: 'de-DE',
      })
    ) as SharepicSpec;
    const text = reply(reordered, 'Mach es schöner');
    expect(text).toMatch(/^Am Entwurf hat sich nichts geändert\./);
    expect(text).not.toMatch(/Erledigt/);
  });

  it('passes on the draft’s hinweis when nothing changed', () => {
    const text = reply(
      before,
      'Mach es schöner',
      before,
      'Sand gibt es nicht, Mint ist am nächsten.'
    );
    expect(text).toContain('Sand gibt es nicht, Mint ist am nächsten.');
  });

  it('says why a quote slide keeps its words', () => {
    const quotes = deck(slide(['Busse']), quoteSlide);
    const text = reply(quotes, 'bei der 2. slide einen anderen text', quotes);
    expect(text).toMatch(/^Folie 2 hat sich nicht geändert\./);
    expect(text).toContain('Ein Zitat übernehme ich nur wörtlich');
  });

  it('gives the request-bound reason for a bingo slide too', () => {
    const bingo: Slide = {
      ...slide([]),
      items: [{ type: 'bingo', felder: Array.from({ length: 9 }, (_, i) => `Feld ${i + 1}`) }],
    };
    const cards = deck(slide(['Busse']), bingo);
    const text = reply(cards, 'bei der 2. slide einen anderen text', cards);
    expect(text).toMatch(/^Folie 2 hat sich nicht geändert\./);
    expect(text).toContain('übernehme ich nur so, wie sie in deinem Auftrag stehen');
  });

  it('credits a new photo on another slide when the named slide stayed', () => {
    const photo = slide(['Sicherer', 'für alle'], {
      background: { kind: 'foto', filename: 'rad.jpg', textSeite: 'unten' },
    });
    const after = deck(before.slides[0]!, photo, before.slides[2]!);
    const text = reply(after, 'bei der 1. slide einen anderen text wählen', before, null, [
      null,
      credit('Ada Muster'),
      null,
    ]);
    expect(text).toMatch(/^Folie 1 hat sich nicht geändert\./);
    expect(text).toContain('Stockfoto von Ada Muster auf Unsplash');
  });

  it('names a new background colour and leaves the credits out when no picture changed', () => {
    const after = deck(
      slide(['5 Gründe für', 'mehr ==Radwege=='], { background: { kind: 'farbe', color: 'mint' } }),
      ...before.slides.slice(1)
    );
    const text = reply(after, 'Folie 1 in Mint');
    expect(text).toBe('Erledigt – Folie 1: Hintergrund jetzt Mint.');
  });

  it('adds the picture credits when a photo changed', () => {
    const photo = slide(['5 Gründe für', 'mehr ==Radwege=='], {
      background: { kind: 'foto', filename: 'rad.jpg', textSeite: 'unten' },
    });
    const after = deck(photo, ...before.slides.slice(1));
    const text = reply(after, 'Folie 1 mit Foto', before, null, [credit('Ada Muster'), null, null]);
    expect(text).toMatch(/^Erledigt – Folie 1: neues Foto\./);
    expect(text).toContain('Stockfoto von Ada Muster auf Unsplash');
  });

  it('leaves out the slide number on a single sharepic', () => {
    const one = deck(slide(['Mach mit']));
    const text = reply(deck(slide(['Mach mit'], { position: 'unten' })), 'Text nach unten', one);
    expect(text).toBe('Erledigt – Text jetzt unten.');
  });

  it('says when the deck gained a slide', () => {
    const after = deck(...before.slides, slide(['Jetzt handeln']));
    expect(reply(after, 'Noch eine Folie dazu')).toBe('Erledigt – jetzt 4 statt 3 Folien.');
  });
});
