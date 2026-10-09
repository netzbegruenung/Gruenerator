/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type SharepicVorlage } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { type ReactElement, type ReactNode } from 'react';

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
jest.mock('../../services/vorlagen', () => ({
  fetchVorlagen: jest.fn(),
  fetchVorlagenCategories: jest.fn(),
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

const plakat = {
  id: 'g1',
  title: 'Plakat Klima',
  template_type: 'canva',
  external_url: 'https://canva.com/g1',
};

function setup({
  catalog = [karussell],
  gallery = [plakat] as vorlagen.Template[],
  bookmarked = [] as string[],
} = {}) {
  mockVorlagen.mockReturnValue({ data: catalog, isLoading: false, refetch: async () => {} });
  api.fetchVorlagen.mockResolvedValue(gallery as never);
  api.fetchVorlagenCategories.mockResolvedValue([{ id: 'canva', label: 'Canva' }] as never);
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue('tok');
  usePreferencesStore.setState({ vorlagenGridSize: 'small' });
});

describe('VorlagenScreen', () => {
  it('lists catalogue and gallery Vorlagen in one grid, without an empty state', async () => {
    setup();
    await renderScreen();

    expect(
      screen.getByRole('button', { name: 'Klimaschutz in drei Schritten, 3 Seiten' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Plakat Klima' })).toBeTruthy();
    expect(screen.queryByText(/Noch keine/)).toBeNull();
    expect(screen.queryByText(/Neue Vorlage/)).toBeNull();
    expect(imageUris()).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\/sharepic-vorlagen\/klima-karussell\/thumb$/),
      ])
    );
    expect(api.fetchVorlagen).toHaveBeenCalledWith({});
  });

  it('has like and bookmark on every card, and no reactions', async () => {
    setup();
    await renderScreen();

    expect(screen.getAllByRole('button', { name: 'Gefällt mir' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Merken' })).toHaveLength(2);
    expect(screen.queryByText(/Reaktion/)).toBeNull();

    fireEvent.press(screen.getAllByRole('button', { name: 'Merken' })[0]!);
    await act(async () => {});
    expect(api.setTemplateBookmark).toHaveBeenCalledWith('klima-karussell', true);
    expect(screen.getAllByRole('button', { name: 'Merken' })[0]!.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );

    fireEvent.press(screen.getAllByRole('button', { name: 'Gefällt mir' })[1]!);
    await act(async () => {});
    expect(api.setTemplateLike).toHaveBeenCalledWith('g1', true);
  });

  it('keeps the filter plain at „Alle" and marks another choice', async () => {
    setup();
    await renderScreen();
    expect(header().filterLabel).toBeNull();

    act(() => header().onOpenFilter());
    expect(option('Alle Vorlagen').props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
    expect(option('Grünerator')).toBeTruthy();
    expect(option('Meine Vorlagen')).toBeTruthy();

    fireEvent.press(option('Canva'));
    await act(async () => {});
    expect(header().filterLabel).toBe('Canva');
    expect(api.fetchVorlagen).toHaveBeenLastCalledWith({ templateType: 'canva' });
    expect(screen.queryByRole('button', { name: /Klimaschutz/ })).toBeNull();
  });

  it('shows the own Vorlagen under „Meine Vorlagen" without the list controls', async () => {
    setup();
    await renderScreen();

    act(() => header().onOpenFilter());
    fireEvent.press(option('Meine Vorlagen'));
    await act(async () => {});

    expect(screen.getByRole('button', { name: 'Mein Canva-Plakat' })).toBeTruthy();
    expect(header().showListControls).toBe(false);
    expect(header().filterLabel).toBe('Meine Vorlagen');
  });

  it('filters to bookmarked Vorlagen and explains an empty bookmark list', async () => {
    setup({ bookmarked: ['g1'] });
    await renderScreen();

    act(() => header().onToggleBookmarked());
    await act(async () => {});
    expect(api.fetchVorlagen).toHaveBeenLastCalledWith({ favorites: true });
    expect(screen.queryByRole('button', { name: /Klimaschutz/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Plakat Klima' })).toBeTruthy();

    fireEvent.press(screen.getAllByRole('button', { name: 'Merken' })[0]!);
    await act(async () => {});
    expect(screen.getByText('Noch keine gemerkten Vorlagen')).toBeTruthy();
  });

  it('says a category is empty and points back to all Vorlagen', async () => {
    setup({ gallery: [] });
    await renderScreen();

    act(() => header().onOpenFilter());
    fireEvent.press(option('Canva'));
    await act(async () => {});

    expect(screen.getByText('In dieser Kategorie gibt es noch keine Vorlagen')).toBeTruthy();
    expect(screen.getByText(/Alle Vorlagen/)).toBeTruthy();
  });

  it('shows a plain empty state without any filter', async () => {
    setup({ catalog: [], gallery: [] });
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
        name: 'Im Sharepic-Creator: Mach ein Karussell zu Radwegen in Köln',
      })
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/sharepic',
      params: { initialMessage: 'Mach ein Karussell zu Radwegen in Köln' },
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
