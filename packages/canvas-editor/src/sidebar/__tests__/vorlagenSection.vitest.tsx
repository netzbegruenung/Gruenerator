import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasVorlagenService } from '../../CanvasEditorProvider';
import { defaultCanvasEditorStore } from '../../stores/createCanvasEditorStore';
import { axe } from '../../test-utils';
import { VORLAGE_DRAG_TYPE } from '../../utils/mediaDrop';
import { VorlagenSection, type VorlagenSectionHandle } from '../sections/VorlagenSection';

import type { HeterogeneousPage } from '../../configs/types';
import type { CanvasVorlage, PrintVorlage, SharepicSeite } from '@gruenerator/contracts';

// Kein Offscreen-Konva in jsdom: die Folienvorschauen bleiben beim Skeleton.
vi.mock('../../slides/renderSlideLayoutThumbnail', () => ({
  preloadSlideLayoutPhoto: () => Promise.resolve(),
  renderSlideLayoutThumbnail: () => new Promise(() => {}),
}));

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

const PLAKAT_SLOTS = {
  dachzeile: 'Einladung zum Gespräch:',
  headline: 'Hier steht deine Botschaft',
  akzent: 'Botschaft',
  subline: 'Datum, Uhrzeit und Ort',
};

const PRINT: PrintVorlage[] = [
  {
    id: 'de-visitenkarte-quer',
    titel: 'Visitenkarte quer',
    beschreibung: '',
    locale: 'de-DE',
    spec: {
      locale: 'de-DE',
      produkt: 'visitenkarte',
      variante: 'visitenkarte',
      format: 'print-visitenkarte-quer',
      impressum: null,
      slots: { name: 'Vorname Nachname', funktion: 'Funktion', organisation: 'Ortsverband' },
    },
  },
  {
    id: 'de-plakat-typo-a3',
    titel: 'Typo-Plakat A3',
    beschreibung: '',
    locale: 'de-DE',
    spec: {
      locale: 'de-DE',
      produkt: 'plakat',
      variante: 'typo',
      format: 'print-a3-hoch',
      impressum: { art: 'visdp', name: 'Vorname Nachname', anschrift: 'Straße Nr., PLZ Ort' },
      slots: PLAKAT_SLOTS,
    },
  },
  {
    id: 'at-plakat-typo-a3',
    titel: 'Typo-Plakat A3',
    beschreibung: '',
    locale: 'de-AT',
    thumbVersion: 'v1',
    spec: {
      locale: 'de-AT',
      produkt: 'plakat',
      variante: 'typo',
      format: 'print-a3-hoch',
      impressum: {
        art: 'impressum',
        medieninhaber: 'Name/Organisation',
        anschrift: 'Straße Nr., PLZ Ort',
      },
      slots: PLAKAT_SLOTS,
    },
  },
] as PrintVorlage[];

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
    // Like the host: the viewer's country only.
    listPrint: vi.fn(async () => PRINT.filter((v) => v.locale === userLocale)),
    ...service,
  };
  const deck = {
    getPages: () => pages,
    getActivePageId: () => pages[0]?.id ?? null,
    replaceDeck: vi.fn((): string[] => []),
  };
  const onShowPage = vi.fn();
  const handle = createRef<VorlagenSectionHandle>();
  const { container } = render(
    <CanvasEditorProvider services={{ vorlagen, userLocale }}>
      <VorlagenSection
        ref={handle}
        formatId={formatId}
        pages={pages}
        deck={deck}
        onShowPage={onShowPage}
        canAddPage={canAddPage}
        layoutLocale={userLocale}
      />
    </CanvasEditorProvider>
  );
  return { vorlagen, deck, onShowPage, handle, container, user: userEvent.setup() };
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

const canvasVorlage = (
  id: string,
  titel: string,
  format: CanvasVorlage['format']
): CanvasVorlage => ({
  id,
  titel,
  beschreibung: '',
  format,
  locale: 'de-DE',
  thumbVersion: 'v1',
  pages: [{ configId: 'sticker', state: { additionalTexts: [{ id: 't1', text: titel }] } }],
});

const CANVAS_CATALOGUE = [
  canvasVorlage('sticker-danke', 'Danke-Sticker', 'profile-square'),
  canvasVorlage('quer-plakat', 'Plakat-Entwurf', 'print-a3-hoch'),
  canvasVorlage('sharepic-seite', 'Fertige Seite', 'post-portrait'),
];

describe('VorlagenSection canvas Vorlagen', () => {
  const listCanvas = () => vi.fn(async () => CANVAS_CATALOGUE);

  it('shows the canvas Vorlagen of exactly the format, and no Seiten', async () => {
    const { vorlagen } = setup(EMPTY, {
      formatId: 'profile-square',
      service: { listCanvas: listCanvas() },
    });
    await card('Danke-Sticker');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(vorlagen.listSeiten).not.toHaveBeenCalled();
  });

  it('leaves a sharepic format to its Seiten', async () => {
    const service = { listCanvas: listCanvas() };
    setup(EMPTY, { service });
    await seitenTile('Zwei Absätze');
    expect(service.listCanvas).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Vorlage / })).toBeNull();
  });

  it('puts them behind the print Vorlage of the format', async () => {
    setup(EMPTY, { formatId: 'print-a3-hoch', service: { listCanvas: listCanvas() } });
    await card('Plakat-Entwurf');
    const titles = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(titles).toEqual(['Typo-Plakat A3', 'Plakat-Entwurf']);
  });

  it('applies a copy of the stored pages', async () => {
    const { deck, user } = setup(EMPTY, {
      formatId: 'profile-square',
      service: { listCanvas: listCanvas() },
    });
    await user.click(await card('Danke-Sticker'));
    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    const [ops] = deck.replaceDeck.mock.calls[0] as unknown as [
      { inserts: { configId: string; state: unknown }[]; removes: string[] },
    ];
    const stored = CANVAS_CATALOGUE[0]!.pages[0]!;
    expect(ops.removes).toEqual(['p1']);
    expect(ops.inserts[0]).toMatchObject({ configId: 'sticker', state: stored.state });
    expect(ops.inserts[0]?.state).not.toBe(stored.state);
  });

  it('says when the canvas Vorlagen fail to load and loads them again', async () => {
    const failing = vi
      .fn<() => Promise<CanvasVorlage[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(CANVAS_CATALOGUE);
    const { user } = setup(EMPTY, { formatId: 'profile-square', service: { listCanvas: failing } });
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Erneut versuchen' }));
    await card('Danke-Sticker');
  });

  it('leaves a tile plain when its preview does not load', async () => {
    setup(EMPTY, { formatId: 'profile-square', service: { listCanvas: listCanvas() } });
    const button = await card('Danke-Sticker');
    const img = button.closest('li')!.querySelector('img')!;
    fireEvent.error(img);
    expect(button.closest('li')!.querySelector('img')).toBeNull();
    expect(screen.getByText('Danke-Sticker')).toBeInTheDocument();
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
  const vorlageById = (id: string) => PRINT.find((v) => v.id === id)!;

  it('shows the print Vorlage of the format and the country, not the sharepic catalogue', async () => {
    const { vorlagen } = setup(EMPTY, { formatId: 'print-a3-hoch', userLocale: 'de-AT' });
    const button = await card('Typo-Plakat A3');
    expect(button.closest('li')?.querySelector('img')?.getAttribute('src')).toBe(
      '/api/sharepic-vorlagen/print/at-plakat-typo-a3/thumb?v=v1'
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(vorlagen.listSeiten).not.toHaveBeenCalled();
  });

  describe('a Vorlage of several pages', () => {
    const KARTE: HeterogeneousPage[] = [textPage('p1'), textPage('p2')];
    const side = (n: number) =>
      screen.findByRole('button', { name: `Seite ${n} von 2 aus „Visitenkarte quer“ übernehmen` });
    type Ops = {
      updates: { pageId: string; state: { additionalTexts: { text: string }[] } }[];
      inserts: unknown[];
      removes: string[];
    };
    const opsOf = (deck: ReturnType<typeof setup>['deck']) =>
      (deck.replaceDeck.mock.calls[0] as unknown as [Ops])[0];

    it('offers each side of a business card as its own tile', async () => {
      setup(EMPTY, { formatId: 'print-visitenkarte-quer' });
      await side(1);
      const back = await side(2);
      expect(back.closest('li')?.querySelector('img')?.getAttribute('src')).toBe(
        '/api/sharepic-vorlagen/print/de-visitenkarte-quer/thumb?seite=2'
      );
      expect(screen.getByText('2/2')).toBeInTheDocument();
    });

    it('brings the whole Vorlage to an empty design and shows the picked side', async () => {
      const { deck, onShowPage, user } = setup(EMPTY, { formatId: 'print-visitenkarte-quer' });
      await user.click(await side(2));
      await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
      const ops = opsOf(deck);
      expect(ops.updates).toHaveLength(1);
      expect(ops.inserts).toHaveLength(1);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(onShowPage).not.toHaveBeenCalledWith('p1');
    });

    it('asks, then puts the side in place of the open page only', async () => {
      const { deck, onShowPage, user } = setup(KARTE, { formatId: 'print-visitenkarte-quer' });
      await user.click(await side(2));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Seite ersetzen' }));
      await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
      const ops = opsOf(deck);
      expect(ops.updates.map((u) => u.pageId)).toEqual(['p1']);
      expect(ops.inserts).toEqual([]);
      expect(ops.removes).toEqual([]);
      expect(ops.updates[0]!.state.additionalTexts.some((t) => t.text === 'Mein Text')).toBe(false);
      expect(onShowPage).toHaveBeenCalledWith('p1');
      expect(defaultCanvasEditorStore.getState().pendingAiSuggestion?.undo).toBe('pages');
    });

    it('puts a dropped side in place of the page it was dropped on', async () => {
      const { deck, handle, user } = setup(KARTE, { formatId: 'print-visitenkarte-quer' });
      await side(1);
      act(() => handle.current?.drop('de-visitenkarte-quer#1', 'p2'));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Seite ersetzen' }));
      await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
      expect(opsOf(deck).updates.map((u) => u.pageId)).toEqual(['p2']);
    });

    it('fills a blank page without asking', async () => {
      const { deck, user } = setup([textPage('p1'), { ...EMPTY[0]!, id: 'p2' }], {
        formatId: 'print-visitenkarte-quer',
      });
      deck.getActivePageId = () => 'p2';
      await user.click(await side(2));
      await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(opsOf(deck).updates.map((u) => u.pageId)).toEqual(['p2']);
      expect(defaultCanvasEditorStore.getState().pendingAiSuggestion).toBeNull();
    });

    it('still opens the whole Vorlage as a new design', async () => {
      const { deck, vorlagen, user } = setup(KARTE, { formatId: 'print-visitenkarte-quer' });
      await user.click(await side(1));
      const dialog = await screen.findByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Als neues Design öffnen' }));
      expect(vorlagen.openPrintAsNew).toHaveBeenCalledWith(vorlageById('de-visitenkarte-quer'));
      expect(deck.replaceDeck).not.toHaveBeenCalled();
    });
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

describe('VorlagenSection on a slide deck', () => {
  const slidePage = (id: string, notes = ''): HeterogeneousPage => ({
    id,
    configId: 'freeform',
    state: { notes, additionalTexts: [{ id: 'folie-titel', text: 'Titelfolie' }] },
  });
  const DECK = [slidePage('s1'), slidePage('s2')];
  const DECK_CANVAS = canvasVorlage('deck-agenda', 'Agenda-Folie', 'slide-16-9');

  type Ops = {
    updates: { pageId: string; state: Record<string, unknown> }[];
    inserts: { afterPageId: string | null; configId: string; state: Record<string, unknown> }[];
    removes: string[];
  };
  const opsOf = (deck: ReturnType<typeof setup>['deck']) =>
    (deck.replaceDeck.mock.calls[0] as unknown as [Ops])[0];

  it('shows the slide layouts, dark and light, then the canvas Vorlagen of the format', async () => {
    const { vorlagen, container } = setup(DECK, {
      formatId: 'slide-16-9',
      service: { listCanvas: vi.fn(async () => [...CANVAS_CATALOGUE, DECK_CANVAS]) },
    });
    const dark = screen.getByRole('region', { name: 'Folienlayouts Dunkel' });
    const light = screen.getByRole('region', { name: 'Folienlayouts Hell' });
    expect(within(dark).getAllByRole('button')).toHaveLength(10);
    expect(within(light).getAllByRole('button')).toHaveLength(6);
    const more = await screen.findByRole('region', { name: 'Weitere Vorlagen' });
    expect(
      within(more)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Agenda-Folie']);
    expect(screen.queryByText(/noch keine Vorlagen/)).toBeNull();
    expect(vorlagen.listSeiten).not.toHaveBeenCalled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows only the layouts when the host has no Vorlage of the format', async () => {
    const listCanvas = vi.fn(async () => CANVAS_CATALOGUE);
    setup(DECK, { formatId: 'slide-16-9', service: { listCanvas } });
    await waitFor(() => expect(listCanvas).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Titelfolie, dunkel' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Weitere Vorlagen' })).toBeNull();
    expect(screen.queryByText(/noch keine Vorlagen/)).toBeNull();
  });

  it('adds a layout after the open page, numbered for its place', async () => {
    const { deck, onShowPage, user } = setup(DECK, { formatId: 'slide-16-9' });
    deck.replaceDeck.mockReturnValue(['neu']);
    await user.click(screen.getByRole('button', { name: 'Zitat, hell' }));
    const ops = opsOf(deck);
    expect(ops.removes).toEqual([]);
    expect(ops.inserts).toHaveLength(1);
    expect(ops.inserts[0]).toMatchObject({ afterPageId: 's1', configId: 'freeform' });
    const texts = ops.inserts[0]!.state.additionalTexts as { id: string; text: string }[];
    expect(texts.find((t) => t.id === 'folie-seitenzahl')?.text).toBe('2');
    expect(onShowPage).toHaveBeenCalledWith('neu');
  });

  it('fills an empty deck instead, keeping the notes written there', async () => {
    const blank: HeterogeneousPage[] = [
      { id: 'p1', configId: 'freeform', state: { backgroundColor: '#005538', notes: 'Begrüßung' } },
    ];
    const { deck, user } = setup(blank, { formatId: 'slide-16-9' });
    await user.click(screen.getByRole('button', { name: 'Titelfolie, dunkel' }));
    const ops = opsOf(deck);
    expect(ops.inserts).toEqual([]);
    expect(ops.updates[0]).toMatchObject({ pageId: 'p1', state: { notes: 'Begrüßung' } });
  });

  it('builds the Austrian layouts for an AT deck', async () => {
    const at = DECK.map((p) => ({ ...p, configId: 'freeform-at' as const }));
    const { deck, user } = setup(at, { formatId: 'slide-16-9', userLocale: 'de-AT' });
    await user.click(screen.getByRole('button', { name: 'Textfolie, dunkel' }));
    expect(opsOf(deck).inserts[0]).toMatchObject({ afterPageId: 's1', configId: 'freeform-at' });
  });

  it('adds a layout dragged onto a page after that page', () => {
    const { deck, handle } = setup(DECK, { formatId: 'slide-16-9' });
    const data = dragStart(screen.getByRole('button', { name: 'Diagramm, dunkel' }));
    act(() => handle.current!.drop(data[VORLAGE_DRAG_TYPE]!, 's2'));
    expect(opsOf(deck).inserts[0]).toMatchObject({ afterPageId: 's2' });
  });

  it('does not drag on touch layouts', () => {
    setViewport(true);
    setup(DECK, { formatId: 'slide-16-9' });
    expect(screen.getByRole('button', { name: 'Diagramm, dunkel' })).toHaveAttribute(
      'draggable',
      'false'
    );
  });

  it('adds nothing once the deck is full', async () => {
    const { deck, user } = setup(DECK, { formatId: 'slide-16-9', canAddPage: false });
    expect(screen.getByText(/Mehr Folien passen nicht/)).toBeInTheDocument();
    const tile = screen.getByRole('button', { name: 'Titelfolie, dunkel' });
    expect(tile).toBeDisabled();
    await user.click(tile);
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });
});
