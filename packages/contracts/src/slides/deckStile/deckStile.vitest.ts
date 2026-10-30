import { describe, expect, it } from 'vitest';

import { getBrandPack, type BrandLocale } from '../../brand/grueneBrand.js';
import {
  FOLIEN_TYPEN,
  FOLIEN_TYP_IDS,
  folienSlotsOf,
  slotElementIds,
  type FolieSpec,
  type FolienTypId,
} from '../folienTypen.js';
import { buildSlideLayout } from '../slideLayouts.js';

import { buildFolie, DECK_STILE, deckStilBoxes, type DeckStilId } from './index.js';

const DATE = new Date('2026-10-30T12:00:00Z');
const LOCALES: BrandLocale[] = ['de-DE', 'de-AT'];
const STILE: DeckStilId[] = DECK_STILE.map((s) => s.id);

/** Die einzigen Überschriften-Boxen, die nicht 0,6 tragen (Messung mit Markenschrift, Aufgabe 4). */
const HEADLINE_SCALE: Partial<Record<DeckStilId, Partial<Record<FolienTypId, number>>>> = {
  cd: { titel: 0.5, danke: 0.5 },
};

/** Alle Slots eines Typs mit erkennbaren Texten füllen. */
function fullFolie(typ: FolienTypId): FolieSpec {
  const slots: Record<string, string | string[]> = {};
  for (const [name, slot] of Object.entries(folienSlotsOf(typ))) {
    slots[name] =
      slot.kind === 'text'
        ? `T-${name}`
        : Array.from({ length: slot.maxItems }, (_, i) => `P-${name}-${i + 1}`);
  }
  return { typ, slots } as FolieSpec;
}

/** WCAG-Kontrast zweier `#rrggbb`-Farben. */
function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, bl] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const ctx = (locale: BrandLocale, index = 0) => ({
  locale,
  date: DATE,
  pageNumber: index + 1,
  title: 'Verkehrswende',
  index,
});

describe('deck stile', () => {
  it('registers every stil with a label', () => {
    expect(DECK_STILE.map((s) => s.id)).toEqual(['cd', 'ruhig', 'band', 'kacheln', 'aussage']);
  });

  for (const stil of STILE) {
    for (const typ of FOLIEN_TYP_IDS) {
      for (const locale of LOCALES) {
        const name = `${stil} / ${typ} / ${locale}`;

        it(`builds every stil × typ × locale with footer ids and all filled slot ids (${name})`, () => {
          const folie = fullFolie(typ);
          const state = buildFolie(stil, folie, ctx(locale, 2));
          const texts = new Map(state.additionalTexts.map((t) => [t.id, t]));
          expect(texts.get('folie-datum')?.text).toContain('2026');
          expect(texts.get('folie-titel')?.text).toBe('Verkehrswende');
          expect(texts.get('folie-seitenzahl')?.text).toBe('3');
          for (const [slotName, slot] of Object.entries(folienSlotsOf(typ))) {
            const given = (folie.slots as Record<string, string | string[]>)[slotName];
            if (slot.kind === 'text') {
              expect(texts.get(slot.elementId)?.text, slotName).toBe(given);
            } else {
              slotElementIds(slot).forEach((id, i) => {
                expect(texts.get(id)?.text, id).toContain((given as string[])[i]);
              });
            }
          }
          const known = new Set([
            ...texts.keys(),
            ...state.shapeInstances.map((s) => s.id),
            ...state.assetInstances.map((a) => a.id),
          ]);
          for (const id of state.layerOrder) expect(known.has(id), id).toBe(true);
          expect(new Set(state.layerOrder).size).toBe(state.layerOrder.length);
        });

        it(`keeps every element inside 1920×1080 (${name})`, () => {
          const state = buildFolie(stil, fullFolie(typ), ctx(locale));
          for (const t of state.additionalTexts) {
            // Die Anführung ragt als Zierde über den Rand.
            if (t.id === 'folie-anfuehrung') continue;
            expect(t.x, t.id).toBeGreaterThanOrEqual(0);
            expect(t.x + (t.width ?? 0), t.id).toBeLessThanOrEqual(1920);
            expect(t.y + t.fontSize, t.id).toBeLessThanOrEqual(1080);
          }
          for (const s of state.shapeInstances) {
            expect(s.x - s.width / 2, s.id).toBeGreaterThanOrEqual(0);
            expect(s.x + s.width / 2, s.id).toBeLessThanOrEqual(1920);
            expect(s.y - s.height / 2, s.id).toBeGreaterThanOrEqual(0);
            expect(s.y + s.height / 2, s.id).toBeLessThanOrEqual(1080);
          }
        });

        it(`writes deckStil into every built state (${name})`, () => {
          expect(buildFolie(stil, fullFolie(typ), ctx(locale)).deckStil).toBe(stil);
        });
      }
    }

    it(`uses no DE hex and no sunflower asset in de-AT (${stil})`, () => {
      const at = new Set(getBrandPack('de-AT').palette.map((c) => c.color.toLowerCase()));
      const deOnly = getBrandPack('de-DE')
        .palette.map((c) => c.color.toLowerCase())
        .filter((c) => !at.has(c));
      expect(deOnly.length).toBeGreaterThan(0);
      for (const typ of FOLIEN_TYP_IDS) {
        const state = buildFolie(stil, fullFolie(typ), ctx('de-AT'));
        const json = JSON.stringify(state).toLowerCase();
        for (const hex of deOnly) expect(json, `${typ} ${hex}`).not.toContain(hex);
        for (const a of state.assetInstances) expect(a.assetId, typ).not.toMatch(/sunflower/);
      }
    });

    for (const locale of LOCALES) {
      it(`marks ==words== with the accent fill and leaves **bold** alone (${stil} / ${locale})`, () => {
        const state = buildFolie(
          stil,
          { typ: 'text', slots: { headline: 'H', text: 'Das ist ==wichtig== und **fett** hier' } },
          ctx(locale)
        );
        const el = state.additionalTexts.find((t) => t.id === 'folie-spalte-1')!;
        expect(el.text).toBe('Das ist ==wichtig== und **fett** hier');
        expect(el.accent?.fill).toBeTruthy();
      });

      it(`builds the Störer as circle folie-stoerer plus text folie-stoerer-text (${stil} / ${locale})`, () => {
        const ref = buildSlideLayout('textfolie', { locale, pageNumber: 1, date: DATE });
        expect(ref.shapeInstances.find((s) => s.id === 'folie-stoerer')?.type).toBe('circle');
        expect(ref.additionalTexts.some((t) => t.id === 'folie-stoerer-text')).toBe(true);
        for (const typ of ['titel', 'liste'] as const) {
          const withIt = buildFolie(stil, fullFolie(typ), ctx(locale));
          expect(withIt.shapeInstances.find((s) => s.id === 'folie-stoerer')?.type).toBe('circle');
          expect(withIt.additionalTexts.find((t) => t.id === 'folie-stoerer-text')?.text).toBe(
            'T-stoerer'
          );
          const slots = { ...fullFolie(typ).slots } as Record<string, unknown>;
          delete slots['stoerer'];
          const without = buildFolie(stil, { typ, slots } as FolieSpec, ctx(locale));
          for (const id of ['folie-stoerer', 'folie-stoerer-text']) {
            expect(without.layerOrder).not.toContain(id);
            expect(JSON.stringify(without)).not.toContain(`"${id}"`);
          }
        }
      });

      it(`keeps "Vielen Dank" in folie-headline when danke has no headline (${stil} / ${locale})`, () => {
        const state = buildFolie(stil, { typ: 'danke', slots: {} }, ctx(locale));
        const byId = new Map(state.additionalTexts.map((t) => [t.id, t.text]));
        expect(byId.get('folie-headline')).toBe('Vielen Dank');
        expect(byId.get('folie-text')).toBe('für eure Aufmerksamkeit!');
      });

      it(`drops the default subline when danke has its own headline (${stil} / ${locale})`, () => {
        const state = buildFolie(
          stil,
          { typ: 'danke', slots: { headline: 'Gemeinsam voran!' } },
          ctx(locale)
        );
        const byId = new Map(state.additionalTexts.map((t) => [t.id, t.text]));
        expect(byId.get('folie-headline')).toBe('Gemeinsam voran!');
        expect(byId.has('folie-text')).toBe(false);
        expect(state.layerOrder).not.toContain('folie-text');
      });
    }

    it(`deckStilBoxes returns a box for every headline element of ${stil}`, () => {
      for (const typ of FOLIEN_TYP_IDS) {
        const boxes = deckStilBoxes(stil, typ);
        const state = buildFolie(stil, fullFolie(typ), ctx('de-DE'));
        const slotIds = new Set(
          Object.values(FOLIEN_TYPEN[typ].slots).flatMap((s) => slotElementIds(s))
        );
        for (const t of state.additionalTexts) {
          if (t.type !== 'header' || !slotIds.has(t.id)) continue;
          const box = boxes[t.id];
          expect(box, `${typ} ${t.id}`).toBeDefined();
          expect(box!.maxHeight).toBeGreaterThan(0);
          if (t.id === 'folie-headline')
            expect(box!.minScale, `${stil} ${typ} ${t.id}`).toBe(
              HEADLINE_SCALE[stil]?.[typ] ?? 0.6
            );
        }
        for (const box of Object.values(boxes)) expect(box.minScale).toBeLessThanOrEqual(1);
      }
    });
  }

  it('every stil lays out a liste with 6 punkte inside the page and above the footer', () => {
    for (const stil of STILE) {
      for (const locale of LOCALES) {
        const state = buildFolie(stil, fullFolie('liste'), ctx(locale));
        for (let i = 1; i <= 6; i++) {
          const el = state.additionalTexts.find((t) => t.id === `folie-punkt-${i}`)!;
          const name = `${stil} ${locale} punkt ${i}`;
          expect(el, name).toBeDefined();
          expect(el.x, name).toBeGreaterThanOrEqual(0);
          expect(el.x + (el.width ?? 0), name).toBeLessThanOrEqual(1920);
          // Eine Zeile samt Zeilenabstand muss über der Fußzeile (y 1028) enden.
          expect(el.y + el.fontSize * 1.25, name).toBeLessThan(1028);
        }
      }
    }
  });

  it('sets every band highlight readable on the ground it sits on', () => {
    for (const locale of LOCALES) {
      const pack = getBrandPack(locale);
      for (const typ of FOLIEN_TYP_IDS) {
        const state = buildFolie('band', fullFolie(typ), ctx(locale));
        for (const el of state.additionalTexts) {
          // Der Störer-Text liegt auf seinem Kreis, nicht auf Band oder Sand (eigener Test).
          if (!el.accent?.fill || el.id === 'folie-stoerer-text') continue;
          // Das Band ist 640 breit; was links davon beginnt, steht auf Tanne, der Rest auf Sand.
          const ground = el.x < 640 ? pack.colors.primary : pack.colors.surface;
          expect(
            contrastRatio(el.accent.fill, ground),
            `${locale} ${typ} ${el.id}`
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('keeps the Störer text readable on its fill in every stil', () => {
    for (const stil of STILE) {
      for (const locale of LOCALES) {
        for (const index of [0, 1]) {
          const state = buildFolie(stil, fullFolie('titel'), ctx(locale, index));
          const fill = state.shapeInstances.find((s) => s.id === 'folie-stoerer')!.fill;
          const text = state.additionalTexts.find((t) => t.id === 'folie-stoerer-text')!.fill;
          expect(contrastRatio(fill, text), `${stil} ${locale} ${index}`).toBeGreaterThanOrEqual(
            4.5
          );
        }
      }
    }
  });

  it('alternates ground by index in aussage', () => {
    const grounds = [0, 1, 2, 3].map(
      (index) => buildFolie('aussage', fullFolie('kernsatz'), ctx('de-DE', index)).backgroundColor
    );
    expect(grounds[0]).toBe(grounds[2]);
    expect(grounds[1]).toBe(grounds[3]);
    expect(grounds[0]).not.toBe(grounds[1]);
  });
});

describe('deck stile box limits', () => {
  it('pins every minScale below 0.6 to the known exceptions', () => {
    const allowed: Record<string, number> = {
      'cd titel folie-headline': 0.5,
      'cd danke folie-headline': 0.5,
      'ruhig zitat folie-zitat': 0.5,
    };
    for (const stil of STILE) {
      for (const typ of FOLIEN_TYP_IDS) {
        for (const [id, box] of Object.entries(deckStilBoxes(stil, typ))) {
          const key = `${stil} ${typ} ${id}`;
          if (id === 'folie-zahl') expect(box.minScale, key).toBe(0.5);
          else if (id === 'folie-punkt-*') expect(box.minScale, key).toBeGreaterThanOrEqual(0.65);
          else if (key in allowed) expect(box.minScale, key).toBe(allowed[key]);
          else if (id === 'folie-headline' || id === 'folie-kernsatz' || id === 'folie-zitat')
            expect(box.minScale, key).toBe(0.6);
        }
      }
    }
  });

  it('keeps every list cell within the item pitch of its style', () => {
    for (const stil of STILE) {
      for (const typ of ['liste', 'kernsatz'] as const) {
        const cell = deckStilBoxes(stil, typ)['folie-punkt-*']?.maxHeight;
        expect(cell, `${stil} ${typ}`).toBeGreaterThan(0);
        const state = buildFolie(stil, fullFolie(typ), ctx('de-DE'));
        const items = state.additionalTexts.filter((t) => /^folie-punkt-\d+$/.test(t.id));
        for (const it of items) {
          const oneLine = it.fontSize * (it.lineHeight ?? 1.2);
          // Nächster Punkt darunter in derselben Spalte: die Zelle darf ihn nicht erreichen,
          // außer eine einzelne Zeile ist selbst schon höher als der Abstand (Kernsatz-Stichpunkte).
          const below = items.filter((o) => o.x === it.x && o.y > it.y).map((o) => o.y - it.y);
          const pitch = below.length ? Math.min(...below) : Infinity;
          expect(cell!, `${stil} ${typ} ${it.id}`).toBeLessThanOrEqual(Math.max(pitch, oneLine));
          expect(it.y + cell!, `${stil} ${typ} ${it.id} above footer`).toBeLessThanOrEqual(1028);
        }
      }
    }
  });
});

/** Box eines Textelements: Breite × Zeilenhöhe (eine Zeile, `lineHeight` sonst 1,2). */
const lineBox = (t: {
  x: number;
  y: number;
  width?: number;
  fontSize: number;
  lineHeight?: number;
}) => ({
  x0: t.x,
  x1: t.x + (t.width ?? 0),
  y0: t.y,
  y1: t.y + t.fontSize * (t.lineHeight ?? 1.2),
});

/**
 * Wo die Tinte der Anführung liegt, großzügig: Die Lage des Glyphen hängt an
 * den vertikalen Metriken der ausgelieferten Schrift (OTF und Web-Schrift
 * verschieben die Grundlinie um rund 0,15 em). Gemessen an GrueneTypeNeue
 * („”“ 1000 px: Tinte 0,05–0,47 em breit, je nach Datei −0,03 bis 0,41 em hoch).
 */
const quoteInk = (t: { x: number; y: number; fontSize: number }) => ({
  x0: t.x,
  x1: t.x + t.fontSize * 0.55,
  y0: t.y - t.fontSize * 0.05,
  y1: t.y + t.fontSize * 0.45,
});

const overlaps = (
  a: { x0: number; x1: number; y0: number; y1: number },
  b: { x0: number; x1: number; y0: number; y1: number }
) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

describe('cd kernsatz', () => {
  for (const locale of LOCALES) {
    it(`keeps the headline and the Kernsatz clear of the quote ornament (${locale})`, () => {
      const state = buildFolie('cd', fullFolie('kernsatz'), ctx(locale));
      const byId = new Map(state.additionalTexts.map((t) => [t.id, t]));
      const ink = quoteInk(byId.get('folie-anfuehrung')!);
      expect(overlaps(lineBox(byId.get('folie-headline')!), ink), 'headline').toBe(false);
      expect(overlaps(lineBox(byId.get('folie-kernsatz')!), ink), 'kernsatz').toBe(false);
    });

    it(`sets the Stichpunkte at projector size with room above the footer (${locale})`, () => {
      const state = buildFolie('cd', fullFolie('kernsatz'), ctx(locale));
      const cell = deckStilBoxes('cd', 'kernsatz')['folie-punkt-*']!.maxHeight;
      const kernsatz = state.additionalTexts.find((t) => t.id === 'folie-kernsatz')!;
      const kernsatzBox = deckStilBoxes('cd', 'kernsatz')['folie-kernsatz']!.maxHeight;
      const items = state.additionalTexts.filter((t) => /^folie-punkt-\d+$/.test(t.id));
      expect(items).toHaveLength(3);
      for (const it of items) {
        expect(it.fontSize, it.id).toBeGreaterThanOrEqual(48);
        expect(it.y + cell, it.id).toBeLessThanOrEqual(1028 - 40);
        expect(it.y, it.id).toBeGreaterThanOrEqual(kernsatz.y + kernsatzBox);
      }
    });
  }
});

describe('projector sizes', () => {
  const punkte = (state: ReturnType<typeof buildFolie>) =>
    state.additionalTexts.filter((t) => /^folie-punkt-\d+$/.test(t.id));

  for (const locale of LOCALES) {
    it(`sets cd list items near the draft (58 px) and spreads a short list (${locale})`, () => {
      const four: FolieSpec = {
        typ: 'liste',
        slots: { headline: 'H', punkte: ['Eins', 'Zwei', 'Drei', 'Vier'] },
      };
      const short = punkte(buildFolie('cd', four, ctx(locale)));
      for (const it of short) expect(it.fontSize, it.id).toBeGreaterThanOrEqual(58);
      expect(short[1]!.y - short[0]!.y).toBeGreaterThanOrEqual(140);
      const full = punkte(buildFolie('cd', fullFolie('liste'), ctx(locale)));
      expect(full[1]!.y - full[0]!.y).toBeGreaterThanOrEqual(120);
    });
  }

  it('sets the text slide body at 48 px or more, its box above the footer', () => {
    for (const stil of STILE) {
      for (const locale of LOCALES) {
        const state = buildFolie(stil, fullFolie('text'), ctx(locale));
        const body = state.additionalTexts.find((t) => t.id === 'folie-spalte-1')!;
        const box = deckStilBoxes(stil, 'text')['folie-spalte-1']!;
        expect(body.fontSize, `${stil} ${locale}`).toBeGreaterThanOrEqual(48);
        expect(body.y + box.maxHeight, `${stil} ${locale}`).toBeLessThanOrEqual(1028);
      }
    }
  });

  it('sets kernsatz Stichpunkte at 44 px or more in every stil', () => {
    for (const stil of STILE) {
      for (const it of punkte(buildFolie(stil, fullFolie('kernsatz'), ctx('de-DE')))) {
        expect(it.fontSize, `${stil} ${it.id}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  it('keeps a kacheln kernsatz tile text inside its tile', () => {
    const state = buildFolie('kacheln', fullFolie('kernsatz'), ctx('de-DE'));
    const cell = deckStilBoxes('kacheln', 'kernsatz')['folie-punkt-*']!.maxHeight;
    for (const it of punkte(state)) {
      const n = it.id.split('-').pop();
      const tile = state.shapeInstances.find((s) => s.id === `folie-kachel-${n}`)!;
      expect(it.y, it.id).toBeGreaterThanOrEqual(tile.y - tile.height / 2);
      expect(it.y + cell, it.id).toBeLessThanOrEqual(tile.y + tile.height / 2);
    }
  });
});
