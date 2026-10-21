/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type MarketplaceItemOf, type SharepicVorlage } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { type EffectCallback, type ReactElement, type ReactNode, useEffect } from 'react';

import { useMarketplaceKind } from '@gruenerator/shared/marketplace';
import { useSharepicVorlagen } from '../../hooks/useSharepicVorlagen';
import { openUrl } from '../../services/share';
import { secureStorage } from '../../services/storage';
import * as vorlagen from '../../services/vorlagen';
import { usePreferencesStore } from '../../stores/preferencesStore';

import { type VorlagenHeaderActionsProps } from './VorlagenHeaderActions';
import { VorlagenScreen } from './VorlagenScreen';

// The preferences store only reads defaults from the chat package; loading it for
// real pulls in the ESM-only assistant-stream.
jest.mock('@gruenerator/chat', () => ({
  DEFAULT_NOTEBOOK_DEPTH: 'mittel',
  DEFAULT_NOTEBOOK_ANSWER_MODE: 'auto',
  NOTEBOOK_COMPOSER_MODES: [],
}));
jest.mock('../../hooks/useSharepicVorlagen', () => ({ useSharepicVorlagen: jest.fn() }));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
jest.mock('../../services/share', () => ({ openUrl: jest.fn() }));
jest.mock('@gruenerator/shared/marketplace', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/marketplace'),
  useMarketplaceKind: jest.fn(),
  useMarketplaceLike: () => ({ mutate: jest.fn() }),
  useMarketplaceSave: () => ({ mutate: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('../../services/vorlagen', () => ({
  ...jest.requireActual<Record<string, unknown>>('../../services/vorlagen'),
  fetchMyTemplates: jest.fn(),
  fetchTemplateInteractions: jest.fn(),
  setTemplateLike: jest.fn(),
  setTemplateBookmark: jest.fn(),
}));
// Reanimated has no native module under jest; the placeholder is not under test.
jest.mock('../common/Skeleton', () => ({ SkeletonTiles: () => null }));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockVorlagen = useSharepicVorlagen as unknown as jest.MockedFunction<
  () => { data: SharepicVorlage[] | undefined; isLoading: boolean; refetch: () => Promise<void> }
>;
const mockSaved = useMarketplaceKind as unknown as jest.MockedFunction<
  (params: { kind: string; scope: string; enabled: boolean }) => {
    items: unknown[];
    isLoading: boolean;
    refetch: () => Promise<void>;
  }
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;
const api = vorlagen as unknown as {
  [K in keyof typeof vorlagen]: jest.MockedFunction<(...args: never[]) => Promise<unknown>>;
};

// Only the fields the UI reads; the spec's element tree is irrelevant here.
const karussell = {
  id: 'klima-karussell',
  titel: 'Klimaschutz in drei Schritten',
  beschreibung: 'Ein Karussell, das erklärt, was vor Ort passiert.',
  form: 'karussell',
  herkunft: 'beispiel',
  locale: 'de-DE',
  chat: { prompts: ['Mach ein Karussell zu Radwegen in Köln'] },
  spec: { slides: [{}, {}, {}] },
  attributions: [
    {
      photographer: 'Anna Foto',
      profileUrl: 'https://unsplash.com/@anna',
      photoUrl: 'https://unsplash.com/photos/a',
    },
    null,
    null,
  ],
} as unknown as SharepicVorlage;

/** A bookmarked public Vorlage, as the Marktplatz's „Gemerkt" hands it over. */
const plakat = {
  key: 'template:g1',
  ref: 'g1',
  kind: 'template',
  origin: 'oeffentlich',
  title: 'Plakat Klima',
  description: null,
  thumbnailUrl: null,
  iconKey: null,
  authorName: 'Kim',
  audience: 'all',
  likesCount: 0,
  liked: false,
  saved: true,
  isOwn: false,
  reportKind: 'user_template',
  createdAt: null,
  template: {
    templateType: 'canva',
    thumbUrl: null,
    externalUrl: 'https://canva.com/g1',
    images: [],
    categories: [],
    tags: [],
    contentData: {},
    metadata: {},
  },
} satisfies MarketplaceItemOf<'template'>;

function setup({
  catalog = [karussell],
  saved = [plakat] as MarketplaceItemOf<'template'>[],
  bookmarked = [] as string[],
} = {}) {
  mockVorlagen.mockReturnValue({ data: catalog, isLoading: false, refetch: async () => {} });
  mockSaved.mockReturnValue({ items: saved, isLoading: false, refetch: async () => {} });
  api.fetchMyTemplates.mockResolvedValue([
    { id: 'mine-1', title: 'Mein Canva-Plakat', template_type: 'canva' },
  ] as never);
  api.fetchTemplateInteractions.mockResolvedValue({
    liked: new Set<string>(),
    bookmarked: new Set(bookmarked),
  } as never);
  api.setTemplateLike.mockResolvedValue(true as never);
  api.setTemplateBookmark.mockResolvedValue(true as never);
}

async function renderScreen() {
  const view = render(<VorlagenScreen />);
  await act(async () => {});
  return view;
}

/** The header lives in the native stack; its element comes from the screen options. */
function header(): VorlagenHeaderActionsProps {
  const node = screen.UNSAFE_getByType('Stack.Screen' as never);
  const options = node.props.options as {
    headerRight: () => ReactElement<VorlagenHeaderActionsProps>;
  };
  return options.headerRight().props;
}

/** A filter row; a card whose badge carries the same word also matches by text. */
function option(name: string) {
  const row = screen
    .getAllByRole('button', { name })
    .find((n) => n.props.accessibilityLabel === name);
  if (!row) throw new Error(`no filter row ${name}`);
  return row;
}

function imageUris() {
  return screen
    .UNSAFE_queryAllByType(Image)
    .map((node) => (node.props.source as { uri: string }).uri);
}

// The screen reads its likes and bookmarks on focus; mounted means focused here.
const mockFocusEffect = useFocusEffect as unknown as jest.MockedFunction<
  (effect: EffectCallback) => void
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusEffect.mockImplementation((effect) => useEffect(effect, [effect]));
  mockGetToken.mockResolvedValue('tok');
  usePreferencesStore.setState({ vorlagenGridSize: 'small' });
});

describe('VorlagenScreen', () => {
  it('lists the Grünerator-Vorlagen, without the public ones, and points to the Marktplatz', async () => {
    setup();
    await renderScreen();

    expect(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Plakat Klima' })).toBeNull();
    expect(screen.queryByText(/Noch keine/)).toBeNull();
    expect(imageUris()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/sharepic-vorlagen\/klima-karussell\/thumb$/),
      ])
    );
    // The saved public Vorlagen are only asked for under the bookmark filter.
    expect(mockSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'template', scope: 'saved', enabled: false })
    );

    fireEvent.press(screen.getByRole('button', { name: 'Öffentliche Vorlagen' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/marktplatz',
      params: { art: 'vorlagen' },
    });
  });

  it('has like and bookmark on every card, and no reactions', async () => {
    setup();
    await renderScreen();

    expect(screen.getAllByRole('button', { name: 'Gefällt mir' })).toHaveLength(1);
    expect(screen.queryByText(/Reaktion/)).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Merken' }));
    await act(async () => {});
    expect(api.setTemplateBookmark).toHaveBeenCalledWith('klima-karussell', true);
    expect(screen.getByRole('button', { name: 'Merken' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );

    fireEvent.press(screen.getByRole('button', { name: 'Gefällt mir' }));
    await act(async () => {});
    expect(api.setTemplateLike).toHaveBeenCalledWith('klima-karussell', true);
  });

  it('filters between all and the own Vorlagen only', async () => {
    setup();
    await renderScreen();
    expect(header().filterLabel).toBeNull();

    act(() => header().onOpenFilter());
    expect(option('Alle Vorlagen').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(option('Meine Vorlagen')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Canva' })).toBeNull();
  });

  it('shows the own Vorlagen under „Meine Vorlagen" without the list controls', async () => {
    setup();
    await renderScreen();

    act(() => header().onOpenFilter());
    fireEvent.press(option('Meine Vorlagen'));
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Mein Canva-Plakat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Klimaschutz/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Öffentliche Vorlagen' })).toBeNull();
    expect(header().showListControls).toBe(false);
    expect(header().filterLabel).toBe('Meine Vorlagen');
  });

  it('shows bookmarked Vorlagen, public ones from the Marktplatz included', async () => {
    setup({ bookmarked: ['g1'] });
    await renderScreen();

    act(() => header().onToggleBookmarked());
    await act(async () => {});
    expect(mockSaved).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'template', scope: 'saved', enabled: true })
    );
    expect(screen.queryByRole('button', { name: /Klimaschutz/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Plakat Klima' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Merken' }));
    await act(async () => {});
    expect(api.setTemplateBookmark).toHaveBeenCalledWith('g1', false);
    expect(screen.getByText('Noch keine gemerkten Vorlagen')).toBeTruthy();
  });

  it('shows a plain empty state without any filter', async () => {
    setup({ catalog: [] });
    await renderScreen();
    expect(screen.getByText('Noch keine Vorlagen')).toBeTruthy();
    expect(screen.queryByText(/Suchbegriff/)).toBeNull();
  });

  it('switches the card size and remembers it', async () => {
    setup();
    await renderScreen();
    expect(header().gridSize).toBe('small');

    await act(async () => header().onToggleGridSize());
    expect(usePreferencesStore.getState().vorlagenGridSize).toBe('large');
    expect(header().gridSize).toBe('large');
  });

  it('opens a catalogue Vorlage with every slide and hands its prompt to the creator', async () => {
    setup();
    await renderScreen();

    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );
    expect(screen.getByText(karussell.beschreibung)).toBeTruthy();
    expect(imageUris().filter((u) => u.endsWith('/thumb?seite=3'))).toHaveLength(1);
    expect(screen.getByText('So erstellst du das im Chat')).toBeTruthy();

    fireEvent.press(
      screen.getByRole('button', {
        name: 'Im Chat erstellen: Mach ein Karussell zu Radwegen in Köln',
      })
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/chat-conversation',
      params: {
        threadId: 'new',
        initialMessage:
          '@[Klimaschutz in drei Schritten](vorlage:klima-karussell) Mach ein Karussell zu Radwegen in Köln',
      },
    });
  });

  it('opens the copy in the web viewer and the photo credit', async () => {
    setup();
    await renderScreen();

    fireEvent.press(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    );
    fireEvent.press(screen.getByRole('link', { name: 'Foto von Anna Foto auf Unsplash öffnen' }));
    expect(openUrl).toHaveBeenCalledWith('https://unsplash.com/photos/a');

    fireEvent.press(screen.getByRole('button', { name: 'Kopie bearbeiten' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(fullscreen)/web-viewer',
      params: { path: '/studio/vorlage/klima-karussell', title: karussell.titel },
    });
  });
});
