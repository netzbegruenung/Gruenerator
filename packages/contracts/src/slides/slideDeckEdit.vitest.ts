import { describe, expect, it } from 'vitest';

import { type DeckStilId } from './deckStile/index.js';
import { composeSlideDeck } from './slideDeck.js';
import {
  applySlideDeckOperations,
  type DeckPage,
  type SlideDeckOperation,
  slideDeckOperationsSchema,
} from './slideDeckEdit.js';

const DATE = new Date('2026-10-29T12:00:00Z');

function deck(locale: 'de-DE' | 'de-AT' = 'de-DE', stil: DeckStilId = 'cd'): DeckPage[] {
  const composed = composeSlideDeck(
    {
      title: 'Klimaplan',
      slides: [
        { typ: 'titel', slots: { headline: 'Klima' } },
        { typ: 'text', slots: { headline: 'Warum', text: 'Weil es eilt.' } },
        { typ: 'danke', slots: {} },
      ],
    },
    { locale, date: DATE, stil }
  );
  return composed.pages.map((p) => ({
    ...p,
    state: p.state as unknown as Record<string, unknown>,
  }));
}

let counter = 0;
const ctx = (locale: 'de-DE' | 'de-AT' = 'de-DE') => ({
  locale,
  date: DATE,
  title: 'Klimaplan',
  newPageId: () => `new-${++counter}`,
});

type Text = { id: string; text: string };
const texts = (page: DeckPage) => page.state['additionalTexts'] as Text[];
const textOf = (page: DeckPage, id: string) => texts(page).find((t) => t.id === id)?.text;

describe('applySlideDeckOperations', () => {
  it('sets a text by element id and patches only that page', () => {
    const pages = deck();
    const result = applySlideDeckOperations(
      pages,
      [
        {
          kind: 'edit-slide',
          slide: 2,
          operations: [
            { kind: 'set-text', field: 'folie-spalte-1', label: 'Text', value: 'Kürzer.' },
          ],
        },
      ],
      ctx()
    );
    expect(result.refused).toEqual([]);
    expect(result.structural).toBe(false);
    expect(textOf(result.pages[1]!, 'folie-spalte-1')).toBe('Kürzer.');
    expect(result.pagePatches).toEqual([
      { pageId: pages[1]!.id, patch: { additionalTexts: texts(result.pages[1]!) } },
    ]);
    // the input stays untouched
    expect(textOf(pages[1]!, 'folie-spalte-1')).toBe('Weil es eilt.');
  });

  it('writes a double-escaped \\n as a real line break', () => {
    const result = applySlideDeckOperations(
      deck(),
      [
        {
          kind: 'edit-slide',
          slide: 2,
          operations: [
            { kind: 'set-text', field: 'folie-spalte-1', label: 'Text', value: '• A\\n• B' },
          ],
        },
      ],
      ctx()
    );
    expect(textOf(result.pages[1]!, 'folie-spalte-1')).toBe('• A\n• B');
  });

  it('refuses footer, unknown and empty texts but applies the rest', () => {
    const result = applySlideDeckOperations(
      deck(),
      [
        {
          kind: 'edit-slide',
          slide: 2,
          operations: [
            { kind: 'set-text', field: 'folie-seitenzahl', label: 'Text', value: '9' },
            { kind: 'set-text', field: 'gibt-es-nicht', label: 'Text', value: 'x' },
            { kind: 'set-text', field: 'folie-headline', label: 'Text', value: '  ' },
            { kind: 'set-text', field: 'folie-headline', label: 'Text', value: 'Darum' },
          ],
          notes: 'Langsam sprechen',
        },
      ],
      ctx()
    );
    expect(result.refused).toHaveLength(3);
    expect(textOf(result.pages[1]!, 'folie-headline')).toBe('Darum');
    expect(result.pages[1]!.state['notes']).toBe('Langsam sprechen');
  });

  it('removes an element with its layer entry, but not the footer', () => {
    const result = applySlideDeckOperations(
      deck(),
      [
        {
          kind: 'edit-slide',
          slide: 2,
          operations: [
            { kind: 'remove-element', elementId: 'folie-spalte-1' },
            { kind: 'remove-element', elementId: 'folie-datum' },
          ],
        },
      ],
      ctx()
    );
    const page = result.pages[1]!;
    expect(textOf(page, 'folie-spalte-1')).toBeUndefined();
    expect(page.state['layerOrder']).not.toContain('folie-spalte-1');
    expect(textOf(page, 'folie-datum')).toBeDefined();
    expect(result.refused).toHaveLength(1);
  });

  it('resolves slide numbers against the deck the model saw', () => {
    const pages = deck();
    const ops: SlideDeckOperation[] = [
      { kind: 'remove-slide', slide: 1 },
      // still means the original slide 2, now at position 1
      {
        kind: 'edit-slide',
        slide: 2,
        operations: [{ kind: 'set-text', field: 'folie-headline', label: 'Text', value: 'Neu' }],
      },
    ];
    const result = applySlideDeckOperations(pages, ops, ctx());
    expect(result.pages.map((p) => p.id)).toEqual([pages[1]!.id, pages[2]!.id]);
    expect(textOf(result.pages[0]!, 'folie-headline')).toBe('Neu');
  });

  it('adds a composed slide in the brand of the locale and renumbers the footer', () => {
    const result = applySlideDeckOperations(
      deck('de-AT'),
      [
        {
          kind: 'add-slide',
          afterSlide: 1,
          slide: { typ: 'zitat', slots: { zitat: 'Jetzt handeln.' } },
        },
      ],
      ctx('de-AT')
    );
    expect(result.structural).toBe(true);
    expect(result.pagePatches).toEqual([]);
    expect(result.pages).toHaveLength(4);
    const added = result.pages[1]!;
    expect(added.id).toMatch(/^new-/);
    expect(added.configId).toBe('freeform-at');
    expect(textOf(added, 'folie-zitat')).toBe('Jetzt handeln.');
    expect(textOf(added, 'folie-titel')).toBe('Klimaplan');
    expect(result.pages.map((p) => textOf(p, 'folie-seitenzahl'))).toEqual(['1', '2', '3', '4']);
  });

  it('puts a slide added after an already removed slide where that slide was', () => {
    const pages = deck();
    const replaced = applySlideDeckOperations(
      pages,
      [
        { kind: 'remove-slide', slide: 2 },
        { kind: 'add-slide', afterSlide: 2, slide: { typ: 'zitat', slots: { zitat: 'Neu.' } } },
      ],
      ctx()
    );
    expect(replaced.refused).toEqual([]);
    expect(replaced.pages.map((p) => p.id)).toEqual([
      pages[0]!.id,
      replaced.pages[1]!.id,
      pages[2]!.id,
    ]);
    expect(textOf(replaced.pages[1]!, 'folie-zitat')).toBe('Neu.');

    const front = applySlideDeckOperations(
      pages,
      [
        { kind: 'remove-slide', slide: 1 },
        { kind: 'add-slide', afterSlide: 1, slide: { typ: 'zitat', slots: { zitat: 'Neu.' } } },
      ],
      ctx()
    );
    expect(front.pages[0]!.id).toMatch(/^new-/);
    expect(front.pages).toHaveLength(3);
  });

  it('builds an added slide in the style of the deck', () => {
    const result = applySlideDeckOperations(
      deck('de-DE', 'band'),
      [{ kind: 'add-slide', afterSlide: 1, slide: { typ: 'zitat', slots: { zitat: 'Jetzt.' } } }],
      ctx()
    );
    expect(result.pages[1]!.state['deckStil']).toBe('band');
    expect(result.pages[0]!.state['deckStil']).toBe('band');
  });

  it('moves a slide and keeps the last slide from being removed', () => {
    const pages = deck();
    const moved = applySlideDeckOperations(
      pages,
      [{ kind: 'move-slide', slide: 3, toPosition: 1 }],
      ctx()
    );
    expect(moved.pages.map((p) => p.id)).toEqual([pages[2]!.id, pages[0]!.id, pages[1]!.id]);
    expect(textOf(moved.pages[0]!, 'folie-seitenzahl')).toBe('1');

    const single = [pages[0]!];
    const kept = applySlideDeckOperations(single, [{ kind: 'remove-slide', slide: 1 }], ctx());
    expect(kept.pages).toHaveLength(1);
    expect(kept.refused).toHaveLength(1);
  });

  it('reports a slide number that does not exist', () => {
    const result = applySlideDeckOperations(deck(), [{ kind: 'remove-slide', slide: 7 }], ctx());
    expect(result.refused).toEqual(['remove-slide: Folie 7 gibt es nicht (mehr)']);
  });

  it('validates the wire shape with the core operation vocabulary', () => {
    expect(
      slideDeckOperationsSchema.safeParse([
        { kind: 'edit-slide', slide: 1, operations: [{ kind: 'set-color-mode', mode: 'dark' }] },
      ]).success
    ).toBe(false);
    expect(
      slideDeckOperationsSchema.safeParse([
        { kind: 'add-slide', afterSlide: 0, slide: { layout: 'bildfolie', slots: {} } },
      ]).success
    ).toBe(false);
    expect(
      slideDeckOperationsSchema.safeParse([
        {
          kind: 'edit-slide',
          slide: 1,
          operations: [{ kind: 'set-text', field: 'folie-headline', label: 'Text', value: 'A' }],
        },
      ]).success
    ).toBe(true);
  });
});
