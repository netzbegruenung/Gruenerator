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

import { buildFolie, DECK_STILE, deckStilBoxes, type DeckStilId } from './index.js';

const DATE = new Date('2026-10-30T12:00:00Z');
const LOCALES: BrandLocale[] = ['de-DE', 'de-AT'];
/** Die Stile, die gebaut sind; 3b hängt ruhig, band, kacheln und aussage an. */
const BUILT_STILE: DeckStilId[] = ['cd'];
const STILE = DECK_STILE.map((s) => s.id).filter((id) => BUILT_STILE.includes(id));

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
      it(`marks **words** with the accent fill (${stil} / ${locale})`, () => {
        const state = buildFolie(
          stil,
          { typ: 'text', slots: { headline: 'H', text: 'Das ist **wichtig** hier' } },
          ctx(locale)
        );
        const el = state.additionalTexts.find((t) => t.id === 'folie-spalte-1')!;
        expect(el.text).toBe('Das ist ==wichtig== hier');
        expect(el.accent?.fill).toBeTruthy();
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
          if (t.id === 'folie-headline') expect(box!.minScale).toBe(0.6);
        }
        for (const box of Object.values(boxes)) expect(box.minScale).toBeLessThanOrEqual(1);
      }
    });
  }

  it.skipIf(!BUILT_STILE.includes('aussage'))('alternates ground by index in aussage', () => {
    const grounds = [0, 1, 2, 3].map(
      (index) => buildFolie('aussage', fullFolie('kernsatz'), ctx('de-DE', index)).backgroundColor
    );
    expect(grounds[0]).toBe(grounds[2]);
    expect(grounds[1]).toBe(grounds[3]);
    expect(grounds[0]).not.toBe(grounds[1]);
  });
});
