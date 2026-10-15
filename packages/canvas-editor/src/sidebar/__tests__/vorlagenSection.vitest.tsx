import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasVorlagenService } from '../../CanvasEditorProvider';
import { defaultCanvasEditorStore } from '../../stores/createCanvasEditorStore';
import { VorlagenSection } from '../sections/VorlagenSection';

import type { HeterogeneousPage } from '../../configs/types';
import type { SharepicFormat, SharepicVorlage } from '@gruenerator/contracts';

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
  }: { service?: Partial<CanvasVorlagenService>; formatId?: string } = {}
) {
  const vorlagen: CanvasVorlagenService = {
    list: vi.fn(async () => CATALOGUE),
    compose: vi.fn(async () => COMPOSED),
    openAsNew: vi.fn(),
    ...service,
  };
  const deck = { getPages: () => pages, replaceDeck: vi.fn(() => []) };
  render(
    <CanvasEditorProvider services={{ vorlagen }}>
      <VorlagenSection formatId={formatId} pages={pages} deck={deck} />
    </CanvasEditorProvider>
  );
  return { vorlagen, deck, user: userEvent.setup() };
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
    expect(screen.getByRole('button', { name: /Karussell/ })).toBeInTheDocument();
    expect(screen.getByText('4 Seiten')).toBeInTheDocument();
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
