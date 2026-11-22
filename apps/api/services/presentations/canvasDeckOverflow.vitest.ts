import {
  buildFolie,
  composeSlideDeck,
  DECK_STILE,
  deckStilBoxes,
  fitSlideTexts,
  type FolieSpec,
} from '@gruenerator/contracts/slides';
import { describe, expect, it } from 'vitest';

import { prepareOverflowMeasuring, serverMeasureText } from './canvasDeckOverflow.js';

describe('serverMeasureText', () => {
  it('measures a real headline with the registered brand font', async (t) => {
    if (!(await prepareOverflowMeasuring('de-DE'))) t.skip();
    const measure = serverMeasureText('de-DE');
    if (!measure) return t.skip();

    const head = { family: 'GrueneTypeNeue', size: 200, lineHeight: 1 };
    const text = 'Mehr Radwege für alle';

    expect(measure(text, head, 100000).height).toBe(200);
    const narrow = measure(text, head, 900).height;
    expect(narrow).toBeGreaterThanOrEqual(400);
    expect(narrow % 200).toBe(0);
    // Die Fließschrift ist schmaler als die Display-Schrift: gleicher Text, gleiche Breite, nie höher.
    const body = measure(text, { ...head, family: 'PT Sans' }, 900).height;
    expect(body).toBeLessThanOrEqual(narrow);
  });

  it('never lets a single word wider than the box count as fitting', async (t) => {
    if (!(await prepareOverflowMeasuring('de-DE'))) t.skip();
    const measure = serverMeasureText('de-DE');
    if (!measure) return t.skip();

    const font = { family: 'GrueneTypeNeue', size: 320, lineHeight: 1 };
    // Auf 1700 px ist das Wort bei 320 px zu breit: keine Höhe, die "passt".
    expect(measure('Klimaschutzsofortprogramm', font, 1700).height).toBe(Infinity);
    expect(measure('Klimaschutzsofortprogramm', { ...font, size: 40 }, 1700).height).toBe(40);
  });

  it('shrinks or reports a one-word title, never fits it wider than the box', async (t) => {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      if (!(await prepareOverflowMeasuring(locale))) t.skip();
      const measure = serverMeasureText(locale);
      if (!measure) return t.skip();
      for (const stil of DECK_STILE.map((s) => s.id)) {
        const folie: FolieSpec = { typ: 'titel', slots: { headline: 'Klimaschutzsofortprogramm' } };
        const state = buildFolie(stil, folie, {
          locale,
          date: new Date('2026-10-30T12:00:00Z'),
          pageNumber: 2,
          title: 'Deck',
          index: 1,
        });
        const out = fitSlideTexts(state, deckStilBoxes(stil, 'titel'), measure);
        const el = out.state.additionalTexts.find((e) => e.id === 'folie-headline')!;
        const h = measure(
          el.text,
          { family: el.fontFamily, size: el.fontSize, lineHeight: el.lineHeight ?? 1.2 },
          el.width
        ).height;
        const fits =
          Number.isFinite(h) && h <= deckStilBoxes(stil, 'titel')['folie-headline']!.maxHeight;
        expect(out.overflow.includes('folie-headline'), `${stil} ${locale}`).toBe(!fits);
      }
    }
  });
});

describe('symbole slide with real metrics', () => {
  const longest = (n: number): FolieSpec => ({
    typ: 'symbole',
    slots: {
      headline: 'Mobilität für alle: sicher, günstig und klimafreundlich',
      symbole: ['bahn', 'schule', 'haus', 'wald'].slice(0, n),
      // Die Budgets voll ausgeschöpft: Marke 20, Zeile 70 Zeichen.
      labels: [
        'Verkehrswendeplan',
        'Kitaplätze für alle',
        'Bezahlbar wohnen',
        'Klimaschutz vor Ort',
      ].slice(0, n),
      zeilen: [
        'Dichtere Takte auf Bus und Bahn, auch am Wochenende und nachts.',
        'Ein Platz für jedes Kind und längere Öffnungszeiten für Eltern.',
        'Neue Wohnungen für Familien, Studierende und Auszubildende bauen',
        'Solardächer auf allen öffentlichen Gebäuden der ganzen Stadt.',
      ].slice(0, n),
    },
  });

  for (const locale of ['de-DE', 'de-AT'] as const) {
    for (const stil of DECK_STILE.map((s) => s.id)) {
      for (const n of [3, 4]) {
        it(`fits the longest ${n} columns in ${stil} / ${locale} at projector size`, async (t) => {
          if (!(await prepareOverflowMeasuring(locale))) t.skip();
          const measure = serverMeasureText(locale);
          if (!measure) return t.skip();
          const deck = composeSlideDeck(
            { title: 'Deck', slides: [longest(n)] },
            { locale, date: new Date('2026-10-30T12:00:00Z'), stil, measure }
          );
          expect(deck.overflow).toEqual([]);
          const texts = deck.pages[0]!.state.additionalTexts;
          const sizes = (re: RegExp) => texts.filter((e) => re.test(e.id)).map((e) => e.fontSize);
          // Projektor: Marke ab 40, Zeile ab 40 px (Grundgrößen 44 und 40, 10 % Schrumpfen erlaubt).
          expect(Math.min(...sizes(/^folie-label-/))).toBeGreaterThanOrEqual(40);
          expect(Math.min(...sizes(/^folie-symboltext-/))).toBeGreaterThanOrEqual(40);
          // Die Überschrift endet vor dem obersten Kreis (Kachel: vor der Kachel).
          const head = texts.find((e) => e.id === 'folie-headline')!;
          const headH = measure(
            head.text,
            { family: head.fontFamily, size: head.fontSize, lineHeight: head.lineHeight ?? 1.2 },
            head.width
          ).height;
          expect(head.y + headH, 'headline clear of the circles').toBeLessThanOrEqual(
            stil === 'kacheln' ? 320 : 350
          );
          for (const e of texts.filter((x) => /^folie-(label|symboltext)-/.test(x.id))) {
            const h = measure(
              e.text,
              { family: e.fontFamily, size: e.fontSize, lineHeight: e.lineHeight ?? 1.2 },
              e.width
            ).height;
            expect(e.y + h, `${e.id} above the footer`).toBeLessThanOrEqual(1000);
          }
        });
      }
    }
  }
});
