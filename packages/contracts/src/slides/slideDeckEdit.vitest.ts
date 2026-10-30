import { describe, expect, it } from 'vitest';

import { deckStilBoxes, type DeckStilId } from './deckStile/index.js';
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

  it('fits added and edited slides with the measurer', () => {
    // Höhe wächst mit der Schrift: je größer, desto eher zu hoch.
    const measure = (_: string, font: { size: number }) => ({ height: font.size * 100 });
    const size = (pages: DeckPage[], at: number, id: string) =>
      (pages[at]!.state['additionalTexts'] as Array<{ id: string; fontSize: number }>).find(
        (t) => t.id === id
      )!.fontSize;
    const plain = applySlideDeckOperations(
      deck(),
      [
        {
          kind: 'add-slide',
          afterSlide: 1,
          slide: { typ: 'text', slots: { headline: 'A', text: 'B' } },
        },
      ],
      ctx()
    );
    const fitted = applySlideDeckOperations(
      deck(),
      [
        {
          kind: 'add-slide',
          afterSlide: 1,
          slide: { typ: 'text', slots: { headline: 'A', text: 'B' } },
        },
        {
          kind: 'edit-slide',
          slide: 2,
          operations: [{ kind: 'set-text', field: 'folie-headline', label: 'T', value: 'Neu' }],
        },
      ],
      { ...ctx(), measure }
    );
    expect(size(fitted.pages, 1, 'folie-headline')).toBeLessThan(
      size(plain.pages, 1, 'folie-headline')
    );
    expect(size(fitted.pages, 2, 'folie-headline')).toBeLessThan(
      size(plain.pages, 2, 'folie-headline')
    );
  });

  describe('fitting edited text', () => {
    // Langer Text passt nie, kurzer immer.
    const measure = (text: string, font: { size: number }) => ({
      height: text.length > 20 ? 1e6 : font.size,
    });
    const LONG = 'Ein sehr langer Satz, der in keine Box mehr passt.';
    const edit = (pages: DeckPage[], value: string) =>
      applySlideDeckOperations(
        pages,
        [
          {
            kind: 'edit-slide',
            slide: 2,
            operations: [{ kind: 'set-text', field: 'folie-headline', label: 'T', value }],
          },
        ],
        { ...ctx(), measure }
      );
    const size = (pages: DeckPage[]) =>
      (pages[1]!.state['additionalTexts'] as Array<{ id: string; fontSize: number }>).find(
        (t) => t.id === 'folie-headline'
      )!.fontSize;

    it('does not shrink cumulatively and grows back with a short text', () => {
      const start = deck();
      const base = size(start);
      const { minScale } = deckStilBoxes('cd', 'text')['folie-headline']!;
      const once = edit(start, LONG);
      const twice = edit(once.pages, LONG + ' Noch mehr.');
      expect(size(once.pages)).toBe(Math.round(base * minScale));
      expect(size(twice.pages)).toBeGreaterThanOrEqual(Math.round(base * minScale));
      expect(size(twice.pages)).toBe(size(once.pages));
      expect(size(edit(twice.pages, 'Kurz').pages)).toBe(base);
    });

    const sizes = (page: DeckPage) =>
      Object.fromEntries(
        (page.state['additionalTexts'] as Array<{ id: string; fontSize: number }>).map((t) => [
          t.id,
          t.fontSize,
        ])
      );
    const fits = (text: string, font: { size: number }) => ({ height: font.size });

    it('keeps the sizes of an old page without deckStil', () => {
      const old = deck();
      for (const page of old) delete page.state['deckStil'];
      const texts2 = old[1]!.state['additionalTexts'] as Array<{ id: string; fontSize: number }>;
      for (const t of texts2) {
        if (t.id === 'folie-headline') t.fontSize = 128;
        if (t.id === 'folie-spalte-1' || t.id === 'folie-spalte-2') t.fontSize = 36;
      }
      const before = sizes(old[1]!);
      const result = applySlideDeckOperations(
        old,
        [
          {
            kind: 'edit-slide',
            slide: 2,
            operations: [{ kind: 'set-text', field: 'folie-spalte-1', label: 'T', value: 'Kurz' }],
          },
        ],
        { ...ctx(), measure: fits }
      );
      const after = sizes(result.pages[1]!);
      expect(after['folie-headline']).toBe(128);
      expect(after['folie-spalte-1']).toBe(36);
      expect(after).toEqual(before);
    });

    it('fits an edited page with its own style, not the one of the first page', () => {
      const mixed = [...deck('de-DE', 'band').slice(0, 1), ...deck('de-DE', 'cd').slice(1)];
      const cdBase = sizes(deck('de-DE', 'cd')[1]!)['folie-headline'];
      const result = applySlideDeckOperations(
        mixed,
        [
          {
            kind: 'edit-slide',
            slide: 2,
            operations: [{ kind: 'set-text', field: 'folie-headline', label: 'T', value: 'Kurz' }],
          },
        ],
        { ...ctx(), measure: fits }
      );
      expect(sizes(result.pages[1]!)['folie-headline']).toBe(cdBase);
    });

    it('builds an added slide in the style of the page it follows', () => {
      const mixed = [...deck('de-DE', 'band').slice(0, 1), ...deck('de-DE', 'cd').slice(1)];
      const result = applySlideDeckOperations(
        mixed,
        [{ kind: 'add-slide', afterSlide: 2, slide: { typ: 'zitat', slots: { zitat: 'Jetzt.' } } }],
        ctx()
      );
      expect(result.pages[2]!.state['deckStil']).toBe('cd');
    });

    it('reports a text that still does not fit as a refusal', () => {
      const result = edit(deck(), LONG);
      expect(result.refused).toContain('Folie 2: Text passt nicht in folie-headline, bitte kürzen');
      expect(edit(deck(), 'Kurz').refused).toEqual([]);
    });
  });

  describe('removing a list item', () => {
    const listDeck = (stil: DeckStilId, n = 3): DeckPage[] =>
      composeSlideDeck(
        {
          title: 'Klimaplan',
          slides: [
            {
              typ: 'liste',
              slots: {
                headline: 'Forderungen',
                punkte: ['Eins', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs'].slice(0, n),
              },
            },
          ],
        },
        { locale: 'de-DE', date: DATE, stil }
      ).pages.map((p) => ({ ...p, state: p.state as unknown as Record<string, unknown> }));

    const item = (page: DeckPage, n: number) =>
      textOf(page, `folie-punkt-${n}`)?.replace(/^• /, '');

    const removeItem = (pages: DeckPage[], n: number) =>
      applySlideDeckOperations(
        pages,
        [
          {
            kind: 'edit-slide',
            slide: 1,
            operations: [{ kind: 'remove-element', elementId: `folie-punkt-${n}` }],
          },
        ],
        ctx()
      );

    const allIds = (page: DeckPage): string[] =>
      ['additionalTexts', 'shapeInstances', 'layerOrder'].flatMap((key) => {
        const v = page.state[key];
        return Array.isArray(v)
          ? (v as Array<{ id?: string } | string>).map((e) => (typeof e === 'string' ? e : e.id!))
          : [];
      });

    it.each(['ruhig', 'band', 'kacheln', 'aussage'] as const)(
      'drops the decorations of the item with it in style %s',
      (stil) => {
        const result = removeItem(listDeck(stil, 4), 2);
        expect(result.refused).toEqual([]);
        const page = result.pages[0]!;
        expect(allIds(page).filter((id) => /-4$/.test(id))).toEqual([]);
        expect(item(page, 1)).toBe('Eins');
        expect(item(page, 2)).toBe('Drei');
        expect(item(page, 3)).toBe('Vier');
        expect(item(page, 4)).toBeUndefined();
        expect(texts(page).filter((t) => t.id.startsWith('folie-punkt-'))).toHaveLength(3);
        expect(page.state['deckStil']).toBe(stil);
        if (stil === 'band') {
          expect(textOf(page, 'folie-nummer-1')).toBe('1');
          expect(textOf(page, 'folie-nummer-2')).toBe('2');
        }
        if (stil === 'kacheln') {
          expect(textOf(page, 'folie-kachelnr-1')).toBe('01');
          expect(textOf(page, 'folie-kachelnr-2')).toBe('02');
        }
      }
    );

    it('keeps the cd style working', () => {
      const result = removeItem(listDeck('cd', 4), 2);
      expect(result.refused).toEqual([]);
      const page = result.pages[0]!;
      expect(item(page, 2)).toBe('Drei');
      expect(item(page, 3)).toBe('Vier');
      expect(item(page, 4)).toBeUndefined();
    });

    it('keeps user elements, notes and the footer date when rebuilding', () => {
      const pages = listDeck('kacheln', 4);
      pages[0]!.state['notes'] = 'Merke';
      pages[0]!.state['additionalTexts'] = [
        ...(pages[0]!.state['additionalTexts'] as Text[]),
        { id: 'user-1', text: 'Mein Text' },
      ];
      const result = removeItem(pages, 1);
      const page = result.pages[0]!;
      expect(textOf(page, 'user-1')).toBe('Mein Text');
      expect(page.state['notes']).toBe('Merke');
      expect(page.id).toBe(pages[0]!.id);
    });

    it('refuses to go below the minimum of the list', () => {
      const result = removeItem(listDeck('kacheln', 3), 2);
      expect(result.refused).toEqual(['Folie 1: Eine Liste braucht mindestens 3 Punkte']);
      expect(result.applied).toEqual([]);
      expect(textOf(result.pages[0]!, 'folie-punkt-3')).toBe('Drei');
    });

    it('leaves pages without a style to the plain removal', () => {
      const pages = listDeck('kacheln', 4);
      delete pages[0]!.state['deckStil'];
      const result = removeItem(pages, 2);
      expect(result.refused).toEqual([]);
      expect(item(result.pages[0]!, 2)).toBeUndefined();
      expect(item(result.pages[0]!, 3)).toBe('Drei');
    });
  });
});
