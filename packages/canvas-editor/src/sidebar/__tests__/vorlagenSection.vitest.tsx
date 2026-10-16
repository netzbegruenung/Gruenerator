import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasVorlagenService } from '../../CanvasEditorProvider';
import { PRINT_VORLAGEN } from '../../composer/printVorlagen';
import { defaultCanvasEditorStore } from '../../stores/createCanvasEditorStore';
import { VorlagenSection } from '../sections/VorlagenSection';

import type { HeterogeneousPage } from '../../configs/types';
import type { SharepicFormat, SharepicSeite, SharepicVorlage } from '@gruenerator/contracts';

function vorlage(id: string, titel: string, format?: SharepicFormat, slides = 1): SharepicVorlage {
  return {
    id,
    titel,
    beschreibung: `${titel}, kurz beschrieben.`,
    form: 'einzelbild',
    herkunft: 'beispiel',
    chat: { prompts: ['Ein Sharepic bitte'] },
    locale: 'de-DE',
    attributions: [],
    thumbVersion: 'abc123',
    spec: {
      locale: 'de-DE',
      ...(format ? { format } : {}),
      slides: Array.from({ length: slides }, () => ({
        background: { kind: 'farbe', color: 'tanne' },
        items: [{ type: 'headline', text: 'Hallo' }],
      })),
    },
  } as unknown as SharepicVorlage;
}

const CATALOGUE = [
  vorlage('zitat', 'Zitat mit Foto'),
  vorlage('karussell', 'Karussell', undefined, 4),
  vorlage('hoch', 'Hochformat', 'post-portrait-tall'),
];

const EMPTY: HeterogeneousPage[] = [
  {
    id: 'p1',
    configId: 'freeform',
    state: { backgroundMode: 'color', backgroundColor: '#005538' },
  },
];
const WITH_TEXT: HeterogeneousPage[] = [
  {
    id: 'p1',
    configId: 'freeform',
    state: { backgroundColor: '#005538', additionalTexts: [{ id: 't1', text: 'Mein Text' }] },
  },
];
const COMPOSED = [{ configId: 'freeform', state: { title: 'Vorlage' } }];

function setup(
  pages: HeterogeneousPage[],
  {
    service = {},
    formatId = 'post-portrait',
    userLocale = 'de-DE',
  }: {
    service?: Partial<CanvasVorlagenService>;
    formatId?: string;
    userLocale?: 'de-DE' | 'de-AT';
  } = {}
) {
  const vorlagen: CanvasVorlagenService = {
    list: vi.fn(async () => CATALOGUE),
    compose: vi.fn(async () => COMPOSED),
    openAsNew: vi.fn(),
    openPrintAsNew: vi.fn(),
    ...service,
  };
  const deck = {
    getPages: () => pages,
    getActivePageId: () => pages[0]?.id ?? null,
    replaceDeck: vi.fn((): string[] => []),
  };
  const onShowPage = vi.fn();
  render(
    <CanvasEditorProvider services={{ vorlagen, userLocale }}>
      <VorlagenSection formatId={formatId} pages={pages} deck={deck} onShowPage={onShowPage} />
    </CanvasEditorProvider>
  );
  return { vorlagen, deck, onShowPage, user: userEvent.setup() };
}

const card = (titel: string) =>
  screen.findByRole('button', { name: `Vorlage „${titel}“ anwenden` });

beforeEach(() => {
  defaultCanvasEditorStore.getState().setPendingAiSuggestion(null);
});

describe('VorlagenSection', () => {
  it('shows only the Vorlagen of the design format', async () => {
    setup(EMPTY);
    await card('Zitat mit Foto');
    expect(
      screen.getByRole('button', { name: 'Vorlage „Karussell“ anwenden' })
    ).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hochformat/ })).toBeNull();
  });

  it('offers the 3:4 Vorlagen on a 3:4 design', async () => {
    setup(EMPTY, { formatId: 'post-portrait-tall' });
    await card('Hochformat');
    expect(screen.queryByRole('button', { name: /Zitat mit Foto/ })).toBeNull();
  });

  it('applies straight away on an empty design', async () => {
    const { vorlagen, deck, user } = setup(EMPTY);
    await user.click(await card('Zitat mit Foto'));
    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(vorlagen.compose).toHaveBeenCalledWith(CATALOGUE[0]);
    expect(deck.replaceDeck).toHaveBeenCalledWith({
      updates: [{ pageId: 'p1', state: { title: 'Vorlage' } }],
      inserts: [],
      removes: [],
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(defaultCanvasEditorStore.getState().pendingAiSuggestion).toBeNull();
  });

  it('asks first on a design with content, and replaces it on request', async () => {
    const { deck, vorlagen, user } = setup(WITH_TEXT);
    await user.click(await card('Zitat mit Foto'));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Vorlage „Zitat mit Foto“ verwenden?')).toBeInTheDocument();
    expect(deck.replaceDeck).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Aktuelles ersetzen' }));
    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(vorlagen.openAsNew).not.toHaveBeenCalled();
    expect(defaultCanvasEditorStore.getState().pendingAiSuggestion).toEqual({
      title: 'Zitat mit Foto',
      undo: 'pages',
      source: 'vorlage',
    });
  });

  it('opens the Vorlage as a new sharepic without touching the design', async () => {
    const { deck, vorlagen, user } = setup(WITH_TEXT);
    await user.click(await card('Karussell'));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Als neues Sharepic öffnen' }));

    expect(vorlagen.openAsNew).toHaveBeenCalledWith(CATALOGUE[1]);
    expect(vorlagen.compose).not.toHaveBeenCalled();
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('leaves the design alone on Abbrechen', async () => {
    const { deck, user } = setup(WITH_TEXT);
    await user.click(await card('Zitat mit Foto'));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Abbrechen' })
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('only offers to replace where the host cannot open a new design', async () => {
    const { user } = setup(WITH_TEXT, { service: { openAsNew: undefined } });
    await user.click(await card('Zitat mit Foto'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByRole('button', { name: /neues Sharepic/ })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Aktuelles ersetzen' })).toBeInTheDocument();
  });

  it('says so when the Vorlage cannot be composed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deck, user } = setup(EMPTY, {
      service: { compose: vi.fn(async () => Promise.reject(new Error('Schrift fehlt'))) },
    });
    await user.click(await card('Zitat mit Foto'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Vorlage ließ sich nicht anwenden.'
    );
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });

  it('can load the list again after a failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const list = vi
      .fn<CanvasVorlagenService['list']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(CATALOGUE);
    const { user } = setup(EMPTY, { service: { list } });
    await user.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));
    expect(await card('Zitat mit Foto')).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('says when a format has no Vorlagen yet', async () => {
    setup(EMPTY, { service: { list: vi.fn(async () => [CATALOGUE[2]!]) } });
    expect(
      await screen.findByText('Für dieses Format gibt es noch keine Vorlagen.')
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
    expect(vorlagen.list).not.toHaveBeenCalled();
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
    expect(vorlagen.compose).not.toHaveBeenCalled();
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
    expect(within(dialog).queryByRole('button', { name: /neues Sharepic/ })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Als neues Design öffnen' }));

    expect(vorlagen.openPrintAsNew).toHaveBeenCalledWith(vorlageById('de-plakat-typo-a3'));
    expect(vorlagen.openAsNew).not.toHaveBeenCalled();
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });
});

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

const SEITEN = [
  seite('schluss', 'Kernsatz', { rolle: 'schluss', typ: 'aufruf' }),
  seite('text', 'Zwei Absätze'),
  seite('liste', 'Forderungen', { typ: 'liste' }),
  seite('hoch', 'Nur 3:4', { formats: ['post-portrait-tall'] }),
];
const SEITE_PAGE = { configId: 'freeform', state: { title: 'Seite' } };

const seitenService = (): Partial<CanvasVorlagenService> => ({
  listSeiten: vi.fn(async () => SEITEN),
  composeSeite: vi.fn(async () => [SEITE_PAGE]),
});

const seitenTile = (titel: string) =>
  screen.findByRole('button', { name: `Seite „${titel}“ einfügen` });

describe('VorlagenSection Seiten', () => {
  it('leafs through a carousel before picking it', async () => {
    const { deck, user } = setup(WITH_TEXT);
    await card('Karussell');
    const previous = screen.getByRole('button', { name: 'Vorherige Seite von „Karussell“' });
    expect(previous).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Nächste Seite von „Karussell“' }));
    expect(screen.getByText('2/4')).toBeInTheDocument();
    const tile = (await card('Karussell')).closest('li')!;
    expect(tile.querySelector('img')?.getAttribute('src')).toContain('seite=2');
    expect(deck.replaceDeck).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('offers no Seiten without the host service or on a print format', async () => {
    setup(WITH_TEXT);
    await card('Zitat mit Foto');
    expect(screen.queryByRole('button', { name: 'Einzelne Seiten' })).toBeNull();
  });

  it('lists the Seiten of the format, closing slides last, filtered by kind', async () => {
    const { user } = setup(WITH_TEXT, { service: seitenService() });
    await user.click(await screen.findByRole('button', { name: 'Einzelne Seiten' }));
    await seitenTile('Zwei Absätze');
    const titles = screen
      .getAllByRole('button', { name: /^Seite „/ })
      .map((b) => b.getAttribute('aria-label'));
    expect(titles).toEqual([
      'Seite „Zwei Absätze“ einfügen',
      'Seite „Forderungen“ einfügen',
      'Seite „Kernsatz“ einfügen',
    ]);
    await user.click(screen.getByRole('button', { name: 'Liste' }));
    expect(screen.getAllByRole('button', { name: /^Seite „/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Seite „Forderungen“ einfügen' })).toBeTruthy();
  });

  it('adds a Seite after the open page without asking, and shows it', async () => {
    const service = seitenService();
    const { deck, onShowPage, user } = setup(WITH_TEXT, { service });
    deck.replaceDeck.mockReturnValue(['neu']);
    await user.click(await screen.findByRole('button', { name: 'Einzelne Seiten' }));
    await user.click(await seitenTile('Forderungen'));

    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(service.composeSeite).toHaveBeenCalledWith(SEITEN[2], 'post-portrait');
    const [ops] = deck.replaceDeck.mock.calls[0] as unknown as [
      { inserts: { afterPageId: string | null; state: unknown }[]; removes: string[] },
    ];
    expect(ops.inserts).toEqual([
      expect.objectContaining({ afterPageId: 'p1', state: SEITE_PAGE.state }),
    ]);
    expect(ops.removes).toEqual([]);
    expect(onShowPage).toHaveBeenCalledWith('neu');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('fills an empty design with the Seite', async () => {
    const { deck, onShowPage, user } = setup(EMPTY, { service: seitenService() });
    await user.click(await screen.findByRole('button', { name: 'Einzelne Seiten' }));
    await user.click(await seitenTile('Zwei Absätze'));
    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    expect(deck.replaceDeck).toHaveBeenCalledWith({
      updates: [{ pageId: 'p1', state: SEITE_PAGE.state }],
      inserts: [],
      removes: [],
    });
    expect(onShowPage).toHaveBeenCalledWith('p1');
  });

  it('says so when a Seite cannot be added', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { deck, user } = setup(WITH_TEXT, {
      service: {
        ...seitenService(),
        composeSeite: vi.fn(async () => Promise.reject(new Error('x'))),
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Einzelne Seiten' }));
    await user.click(await seitenTile('Zwei Absätze'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Seite ließ sich nicht einfügen.'
    );
    expect(deck.replaceDeck).not.toHaveBeenCalled();
  });
});
