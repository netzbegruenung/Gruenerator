import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasVorlagenService } from '../../CanvasEditorProvider';
import { PRINT_VORLAGEN } from '../../composer/printVorlagen';
import { defaultCanvasEditorStore } from '../../stores/createCanvasEditorStore';
import { VORLAGE_DRAG_TYPE } from '../../utils/mediaDrop';
import { VorlagenSection, type VorlagenSectionHandle } from '../sections/VorlagenSection';

import type { HeterogeneousPage } from '../../configs/types';
import type { SharepicSeite } from '@gruenerator/contracts';

function seite(id: string, titel: string, over: Partial<SharepicSeite> = {}): SharepicSeite {
  return {
    id,
    titel,
    rolle: 'inhalt',
    typ: 'text',
    formats: ['post-portrait'],
    locale: 'de-DE',
    attribution: null,
    thumbVersion: 'v1',
    slide: {
      background: { kind: 'farbe', color: 'tanne' },
      items: [{ type: 'absatz', text: 'Text' }],
    },
    ...over,
  } as unknown as SharepicSeite;
}

const fromKarussell = (seite: number) => ({ vorlage: 'karussell', seite });

// Out of order on purpose: the grid puts a Vorlage's slides back in sequence.
const SEITEN = [
  seite('karussell-s2', 'Karussell', { quelle: fromKarussell(2), typ: 'liste' }),
  seite('schluss', 'Kernsatz', { rolle: 'schluss', typ: 'aufruf' }),
  seite('karussell-s1', 'Karussell', { quelle: fromKarussell(1), rolle: 'titel' }),
  seite('text', 'Zwei Absätze'),
  seite('gruende', 'Gründe', { quelle: fromKarussell(3), rolle: 'schluss' }),
  seite('liste', 'Forderungen', { typ: 'liste' }),
  seite('hoch', 'Nur 3:4', { formats: ['post-portrait-tall'] }),
];
const SEITE_PAGE = { configId: 'freeform', state: { title: 'Seite' } };

const EMPTY: HeterogeneousPage[] = [
  {
    id: 'p1',
    configId: 'freeform',
    state: { backgroundMode: 'color', backgroundColor: '#005538' },
  },
];
const textPage = (id: string): HeterogeneousPage => ({
  id,
  configId: 'freeform',
  state: { backgroundColor: '#005538', additionalTexts: [{ id: 't1', text: 'Mein Text' }] },
});
const WITH_TEXT = [textPage('p1')];
const TWO_PAGES = [textPage('p1'), textPage('p2')];

function setup(
  pages: HeterogeneousPage[],
  {
    service = {},
    formatId = 'post-portrait',
    userLocale = 'de-DE',
    canAddPage = true,
  }: {
    service?: Partial<CanvasVorlagenService>;
    formatId?: string;
    userLocale?: 'de-DE' | 'de-AT';
    canAddPage?: boolean;
  } = {}
) {
  const vorlagen: CanvasVorlagenService = {
    listSeiten: vi.fn(async () => SEITEN),
    composeSeite: vi.fn(async () => [SEITE_PAGE]),
    openPrintAsNew: vi.fn(),
    ...service,
  };
  const deck = {
    getPages: () => pages,
    getActivePageId: () => pages[0]?.id ?? null,
    replaceDeck: vi.fn((): string[] => []),
  };
  const onShowPage = vi.fn();
  const handle = createRef<VorlagenSectionHandle>();
  render(
    <CanvasEditorProvider services={{ vorlagen, userLocale }}>
      <VorlagenSection
        ref={handle}
        formatId={formatId}
        pages={pages}
        deck={deck}
        onShowPage={onShowPage}
        canAddPage={canAddPage}
      />
    </CanvasEditorProvider>
  );
  return { vorlagen, deck, onShowPage, handle, user: userEvent.setup() };
}

const card = (titel: string) =>
  screen.findByRole('button', { name: `Vorlage „${titel}“ anwenden` });

const seitenTile = (titel: string) =>
  screen.findByRole('button', { name: `Seite „${titel}“ einfügen` });

const seitenLabels = () =>
  screen.getAllByRole('button', { name: /^Seite / }).map((b) => b.getAttribute('aria-label'));

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width: 899px'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function dragStart(tile: HTMLElement) {
  const data: Record<string, string> = {};
  fireEvent.dragStart(tile, {
    dataTransfer: {
      setData: (type: string, value: string) => (data[type] = value),
      setDragImage: () => {},
      effectAllowed: '',
    },
  });
  return data;
}

const insertedAfter = (deck: ReturnType<typeof setup>['deck']) => {
  const [ops] = deck.replaceDeck.mock.calls[0] as unknown as [
    { inserts: { afterPageId: string | null; state: unknown }[]; removes: string[] },
  ];
  return ops;
};

beforeEach(() => {
  setViewport(false);
  defaultCanvasEditorStore.getState().setPendingAiSuggestion(null);
});

describe('VorlagenSection on a sharepic', () => {
  it('shows only Seiten, a Vorlage’s slides together in order, closing slides last', async () => {
    setup(EMPTY);
    await seitenTile('Zwei Absätze');
    expect(screen.queryByRole('button', { name: /Ganze Vorlagen/ })).toBeNull();
    expect(seitenLabels()).toEqual([
      'Seite 1 von 3 aus „Karussell“ einfügen',
      'Seite 2 von 3 aus „Karussell“ einfügen',
      'Seite 3 von 3 aus „Gründe“ einfügen',
      'Seite „Zwei Absätze“ einfügen',
      'Seite „Forderungen“ einfügen',
      'Seite „Kernsatz“ einfügen',
    ]);
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nur 3:4/ })).toBeNull();
  });

  it('offers the 3:4 Seiten on a 3:4 design', async () => {
    setup(EMPTY, { formatId: 'post-portrait-tall' });
    await seitenTile('Nur 3:4');
    expect(seitenLabels()).toHaveLength(1);
  });

  it('filters by kind', async () => {
    const { user } = setup(EMPTY);
    await seitenTile('Zwei Absätze');
    await user.click(screen.getByRole('button', { name: 'Liste' }));
    expect(seitenLabels()).toEqual([
      'Seite 2 von 3 aus „Karussell“ einfügen',
      'Seite „Forderungen“ einfügen',
    ]);
  });

  it('adds a Seite after the open page without asking, and shows it', async () => {
    const { deck, vorlagen, onShowPage, user } = setup(WITH_TEXT);
    deck.replaceDeck.mockReturnValue(['neu']);
    await user.click(await seitenTile('Forderungen'));

    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(vorlagen.composeSeite).toHaveBeenCalledWith(SEITEN[5], 'post-portrait');
    const ops = insertedAfter(deck);
    expect(ops.inserts).toEqual([
      expect.objectContaining({ afterPageId: 'p1', state: SEITE_PAGE.state }),
    ]);
    expect(ops.removes).toEqual([]);
    expect(onShowPage).toHaveBeenCalledWith('neu');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(defaultCanvasEditorStore.getState().pendingAiSuggestion).toBeNull();
  });

  it('fills an empty design with the Seite', async () => {
    const { deck, onShowPage, user } = setup(EMPTY);
    await user.click(await seitenTile('Zwei Absätze'));
    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(deck.replaceDeck).toHaveBeenCalledWith({
      updates: [{ pageId: 'p1', state: SEITE_PAGE.state }],
      inserts: [],
      removes: [],
    });
    expect(onShowPage).toHaveBeenCalledWith('p1');
  });

  describe('drag onto a page', () => {
    it('drags the Seite id', async () => {
      setup(WITH_TEXT);
      const tile = await seitenTile('Forderungen');
      expect(tile).toHaveAttribute('draggable', 'true');
      expect(dragStart(tile)[VORLAGE_DRAG_TYPE]).toBe('liste');
    });

    it('adds a dropped Seite after the page it was dropped on', async () => {
      const { deck, handle } = setup(TWO_PAGES);
      await seitenTile('Forderungen');
      act(() => handle.current?.drop('liste', 'p2'));
      await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
      expect(insertedAfter(deck).inserts).toEqual([expect.objectContaining({ afterPageId: 'p2' })]);
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('ignores an id that is not in the grid', async () => {
      const { deck, vorlagen, handle } = setup(WITH_TEXT);
      await seitenTile('Forderungen');
      act(() => handle.current?.drop('hoch', 'p1'));
      expect(vorlagen.composeSeite).not.toHaveBeenCalled();
      expect(deck.replaceDeck).not.toHaveBeenCalled();
    });

    it('offers no drag on the mobile sheet', async () => {
      setViewport(true);
      setup(EMPTY);
      expect(await seitenTile('Forderungen')).toHaveAttribute('draggable', 'false');
    });
  });

  it('adds nothing once the design holds as many pages as it may', async () => {
    const { deck, handle } = setup(WITH_TEXT, { canAddPage: false });
    expect(await seitenTile('Forderungen')).toBeDisabled();
    expect(screen.getByText(/Mehr Seiten passen nicht/)).toBeInTheDocument();
    act(() => handle.current?.drop('liste', 'p1'));
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('still fills an empty design at the page limit', async () => {
    setup(EMPTY, { canAddPage: false });
    expect(await seitenTile('Forderungen')).toBeEnabled();
  });

  it('says so when a Seite cannot be added', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deck, user } = setup(WITH_TEXT, {
      service: { composeSeite: vi.fn(async () => Promise.reject(new Error('x'))) },
    });
    await user.click(await seitenTile('Zwei Absätze'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Seite ließ sich nicht einfügen.'
    );
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('can load the Seiten again after a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listSeiten = vi
      .fn<CanvasVorlagenService['listSeiten']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SEITEN);
    const { user } = setup(EMPTY, { service: { listSeiten } });
    await user.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));
    expect(await seitenTile('Zwei Absätze')).toBeInTheDocument();
    expect(listSeiten).toHaveBeenCalledTimes(2);
  });

  it('says when a format has no Seiten yet', async () => {
    setup(EMPTY, { service: { listSeiten: vi.fn(async () => [SEITEN[6]!]) } });
    expect(
      await screen.findByText('Für dieses Format gibt es noch keine Seiten.')
    ).toBeInTheDocument();
  });
});

describe('VorlagenSection on a print design', () => {
  const FILLED = 'V.i.S.d.P.: Anna Muster, Hauptstr. 1, 12345 Stadt';
  const POSTER: HeterogeneousPage[] = [
    {
      id: 'p1',
      configId: 'freeform',
      state: { additionalTexts: [{ id: 'impressum', text: FILLED }] },
    },
  ];
  const vorlageById = (id: string) => PRINT_VORLAGEN.find((v) => v.id === id)!;

  it('shows the print Vorlage of the format and the country, not the sharepic catalogue', async () => {
    const { vorlagen } = setup(EMPTY, { formatId: 'print-a3-hoch', userLocale: 'de-AT' });
    const button = await card('Typo-Plakat A3');
    expect(button.closest('li')?.querySelector('img')?.getAttribute('src')).toBe(
      '/vorlagen/print/at-plakat-typo-a3.webp'
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(vorlagen.listSeiten).not.toHaveBeenCalled();
  });

  it('counts the two sides of a business card', async () => {
    setup(EMPTY, { formatId: 'print-visitenkarte-quer' });
    await card('Visitenkarte quer');
    expect(screen.getByText('2 Seiten')).toBeInTheDocument();
  });

  it('says when a print format has no Vorlage yet', async () => {
    setup(EMPTY, { formatId: 'print-a4-hoch' });
    expect(
      await screen.findByText('Für dieses Format gibt es noch keine Vorlagen.')
    ).toBeInTheDocument();
  });

  it('replaces the poster through the print composer and keeps its filled-in impressum', async () => {
    const { deck, vorlagen, user } = setup(POSTER, { formatId: 'print-a3-hoch' });
    await user.click(await card('Typo-Plakat A3'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aktuelles ersetzen' }));

    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(vorlagen.composeSeite).not.toHaveBeenCalled();
    const [ops] = deck.replaceDeck.mock.calls[0] as unknown as [
      { updates: { pageId: string; state: { additionalTexts: { id: string; text: string }[] } }[] },
    ];
    expect(ops.updates).toHaveLength(1);
    const texts = ops.updates[0]!.state.additionalTexts;
    expect(texts.find((t) => t.id === 'impressum')?.text).toBe(FILLED);
    expect(texts.some((t) => t.text.includes('Hier steht deine'))).toBe(true);
    expect(defaultCanvasEditorStore.getState().pendingAiSuggestion).toEqual({
      title: 'Typo-Plakat A3',
      undo: 'pages',
      source: 'vorlage',
    });
  });

  it('opens the print Vorlage as a new design', async () => {
    const { deck, vorlagen, user } = setup(POSTER, { formatId: 'print-a3-hoch' });
    await user.click(await card('Typo-Plakat A3'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Als neues Design öffnen' }));

    expect(vorlagen.openPrintAsNew).toHaveBeenCalledWith(vorlageById('de-plakat-typo-a3'));
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });
  it('asks first when a print Vorlage is dropped on a design with content', async () => {
    const { deck, handle } = setup(POSTER, { formatId: 'print-a3-hoch' });
    await card('Typo-Plakat A3');
    act(() => handle.current?.drop('de-plakat-typo-a3', 'p1'));
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('leaves the design alone on Abbrechen', async () => {
    const { deck, user } = setup(POSTER, { formatId: 'print-a3-hoch' });
    await user.click(await card('Typo-Plakat A3'));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Abbrechen' })
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('only offers to replace where the host cannot open a new design', async () => {
    const { user } = setup(POSTER, {
      formatId: 'print-a3-hoch',
      service: { openPrintAsNew: undefined },
    });
    await user.click(await card('Typo-Plakat A3'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByRole('button', { name: /neues Design/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Aktuelles ersetzen' })).toBeInTheDocument();
  });
});
