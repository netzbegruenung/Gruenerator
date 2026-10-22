/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  type MarketplaceItem,
  type MarketplaceItemOf,
  type MarketplaceSection,
} from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Share } from 'react-native';

import {
  DEFAULT_MARKETPLACE_FILTERS,
  useMarketplaceItem,
  useMarketplaceKind,
  useMarketplaceSections,
} from '@gruenerator/shared/marketplace';
import { secureStorage } from '../../services/storage';

import { MarketplaceScreen } from './MarketplaceScreen';
import { MarketplaceSheet } from './MarketplaceSheet';

const mockSave = jest.fn();
jest.mock('@gruenerator/shared/marketplace', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/marketplace'),
  useMarketplaceSections: jest.fn(),
  useMarketplaceKind: jest.fn(),
  useMarketplaceItem: jest.fn(),
  // „Passt dazu" under a detail reads the collections; none here.
  useMarketplaceFrontpage: () => ({ data: undefined, isPending: false, isError: false }),
  useMarketplaceLike: () => ({ mutate: jest.fn() }),
  useMarketplaceSave: () => ({ mutate: mockSave }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@gruenerator/shared/comments', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/comments'),
  useEntityComments: () => ({
    isPending: false,
    isError: false,
    data: { reactions: [], comments: [] },
  }),
  useAddEntityComment: () => ({ mutateAsync: jest.fn() }),
  useDeleteEntityComment: () => ({ mutate: jest.fn() }),
  useToggleItemReaction: () => ({ toggle: jest.fn() }),
  useToggleCommentReaction: () => ({ toggle: jest.fn() }),
}));
jest.mock('../../hooks/useHiddenMembers', () => ({ useHiddenMemberIds: () => new Set() }));
jest.mock('../common/confirmHidePerson', () => ({ confirmHidePerson: jest.fn() }));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
// Reanimated has no native module under jest; the placeholder is not under test.
jest.mock('../common/Skeleton', () => ({ SkeletonRows: () => null }));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockSections = useMarketplaceSections as unknown as jest.MockedFunction<
  (params: { kinds: readonly string[]; enabled: boolean }) => Record<string, unknown>
>;
const mockKind = useMarketplaceKind as unknown as jest.MockedFunction<
  (params: { kind: string; enabled: boolean }) => Record<string, unknown>
>;
const mockItem = useMarketplaceItem as unknown as jest.MockedFunction<
  (target: unknown, options: { platform?: string; enabled?: boolean }) => Record<string, unknown>
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

const base = {
  description: 'Schreibt Pressemitteilungen.',
  thumbnailUrl: null,
  iconKey: null,
  authorName: null,
  audience: 'all',
  likesCount: 0,
  liked: false,
  saved: false,
  isOwn: false,
  reportKind: null,
  createdAt: null,
} as const;

const agent = {
  ...base,
  key: 'agent:presse',
  ref: 'presse',
  kind: 'agent',
  origin: 'offiziell',
  title: 'Pressestelle',
  agent: { identifier: 'presse', slug: 'presse', isUserAgent: false },
} satisfies MarketplaceItemOf<'agent'>;

const publicAgent = {
  ...base,
  key: 'agent:u1',
  ref: 'u1',
  kind: 'agent',
  origin: 'oeffentlich',
  title: 'Kommunal-Helfer',
  authorName: 'Kim',
  reportKind: 'user_agent',
  agent: { identifier: 'kommunal', slug: 'u1', isUserAgent: true },
} satisfies MarketplaceItemOf<'agent'>;

const sticker = {
  ...base,
  key: 'sticker:s1',
  ref: 's1',
  kind: 'sticker',
  origin: 'oeffentlich',
  title: 'Sonnenblume',
  authorName: 'Kim',
  reportKind: 'studio_asset',
  asset: {
    id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
    kind: 'sticker',
    title: 'Sonnenblume',
    tags: [],
    src: '/api/share/0123456789abcdef0123456789abcdef/download',
    thumbUrl: null,
    width: 512,
    height: 480,
    source: 'cutout',
    visibility: 'public',
    audience: 'all',
    moderation: 'ok',
    isOwn: false,
    authorName: 'Kim',
    likesCount: 0,
    liked: false,
    favorited: false,
    createdAt: '2026-10-01T00:00:00Z',
  },
} satisfies MarketplaceItemOf<'sticker'>;

function setup({ sections = [] as MarketplaceSection[], items = [] as MarketplaceItem[] } = {}) {
  mockSections.mockReturnValue({ sections, isLoading: false, isError: false });
  mockKind.mockReturnValue({
    items,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  mockItem.mockReturnValue({ data: undefined, isError: false });
}

async function renderScreen(tab: 'alle' | 'agents' | 'sticker' = 'alle') {
  render(<MarketplaceScreen initialFilters={{ ...DEFAULT_MARKETPLACE_FILTERS, tab }} />);
  await act(async () => {});
}

beforeEach(() => {
  mockGetToken.mockResolvedValue('tok');
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('MarketplaceScreen', () => {
  it('shows one aisle per kind under „Alle" in the sheet, and „Alle anzeigen" opens that kind', async () => {
    setup({
      sections: [
        { kind: 'agent', items: [agent], hasMore: false },
        { kind: 'template', items: [], hasMore: false },
        { kind: 'sticker', items: [sticker], hasMore: true },
      ],
    });
    // The screen opens on the front page (MarketplaceFrontpage.test.tsx); the sheet keeps the aisles.
    render(<MarketplaceSheet visible onClose={jest.fn()} />);
    await act(async () => {});

    expect(mockSections).toHaveBeenLastCalledWith(
      expect.objectContaining({ platform: 'mobile', scope: 'shop', enabled: true })
    );
    expect(screen.getByRole('header', { name: 'Agents' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Sticker' })).toBeTruthy();
    // An empty kind leaves no empty aisle.
    expect(screen.queryByRole('header', { name: 'Vorlagen' })).toBeNull();
    // Every kind is the same card; a sticker is remembered, not added.
    expect(screen.getByLabelText('Sonnenblume merken')).toBeTruthy();
    expect(screen.getByLabelText('Pressestelle zu meinen Grüneratoren')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Alle Sticker anzeigen' }));
    expect(mockKind).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'sticker', enabled: true })
    );
  });

  it('shows one kind as one aisle, as on the web', async () => {
    setup({ items: [agent, publicAgent] });
    await renderScreen('agents');

    expect(screen.getByRole('header', { name: 'Agents' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Öffentlich' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pressestelle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kommunal-Helfer' })).toBeTruthy();
  });

  it('offers the Landesverband origin only to people with one, and origins only for Agents and Rezepte', async () => {
    setup({ items: [sticker] });
    render(<MarketplaceSheet visible onClose={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: 'Offiziell' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Landesverband/ })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Sticker' }));
    expect(screen.queryByRole('button', { name: 'Offiziell' })).toBeNull();
  });

  it('says so when a kind is empty', async () => {
    setup();
    await renderScreen('sticker');
    expect(screen.getByText('Hier gibt es noch keine Sticker.')).toBeTruthy();
  });

  it('opens a short view that adds to the Grüneratoren and leads to the detail page', async () => {
    setup({ items: [publicAgent] });
    await renderScreen('agents');

    fireEvent.press(screen.getByRole('button', { name: 'Kommunal-Helfer' }));
    expect(screen.getByRole('header', { name: 'Kommunal-Helfer' })).toBeTruthy();

    fireEvent.press(screen.getByText('Zu meinen Grüneratoren'));
    expect(mockSave).toHaveBeenCalledWith(publicAgent, expect.anything());
    // Someone else's public agent can be reported.
    expect(screen.getByText('Melden')).toBeTruthy();

    fireEvent.press(screen.getByText('Alle Details'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/grueneratoren/agent/[slug]',
      params: { slug: 'u1' },
    });

    fireEvent.press(screen.getByRole('button', { name: 'Zurück: Marktplatz' }));
    expect(screen.getByRole('header', { name: 'Agents' })).toBeTruthy();
  });
});

describe('MarketplaceScreen detail', () => {
  it('opens the item of a shared link, loading it when no list holds it', async () => {
    setup();
    mockItem.mockReturnValue({ data: publicAgent, isError: false });
    render(
      <MarketplaceScreen
        initialFilters={{
          ...DEFAULT_MARKETPLACE_FILTERS,
          tab: 'agents',
          item: { kind: 'agent', ref: 'u1' },
        }}
      />
    );
    await act(async () => {});

    expect(mockItem).toHaveBeenLastCalledWith(
      { kind: 'agent', ref: 'u1' },
      { platform: 'mobile', enabled: true }
    );
    expect(screen.getByRole('header', { name: 'Kommunal-Helfer' })).toBeTruthy();
  });

  it('says so when the shared item is gone', async () => {
    setup();
    mockItem.mockReturnValue({ data: undefined, isError: true });
    render(
      <MarketplaceScreen
        initialFilters={{ ...DEFAULT_MARKETPLACE_FILTERS, item: { kind: 'agent', ref: 'weg' } }}
      />
    );
    await act(async () => {});
    expect(screen.getByText(/Dieser Eintrag ist nicht verfügbar/)).toBeTruthy();
  });

  it('shares the web Marktplatz with the item open', async () => {
    setup({ items: [publicAgent] });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await renderScreen('agents');

    fireEvent.press(screen.getByRole('button', { name: 'Kommunal-Helfer' }));
    // A listed item needs no request of its own.
    expect(mockItem).toHaveBeenLastCalledWith(
      { kind: 'agent', ref: 'u1' },
      { platform: 'mobile', enabled: false }
    );
    fireEvent.press(screen.getByText('Teilen'));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://gruenerator.eu/marktplatz?art=agents&item=agent%3Au1',
      })
    );
  });

  it('shows every page of a Vorlage', async () => {
    const vorlage = {
      ...base,
      key: 'template:v1',
      ref: 'v1',
      kind: 'template',
      origin: 'oeffentlich',
      title: 'Plakat',
      template: {
        templateType: 'canva',
        externalUrl: 'https://canva.com/x',
        images: [
          { url: 'https://example.org/1.png', title: null },
          { url: 'https://example.org/2.png', title: null },
        ],
        categories: [],
        tags: [],
        contentData: {},
        metadata: {},
      },
    } as unknown as MarketplaceItemOf<'template'>;
    setup({ items: [vorlage] });
    render(
      <MarketplaceScreen initialFilters={{ ...DEFAULT_MARKETPLACE_FILTERS, tab: 'vorlagen' }} />
    );
    await act(async () => {});

    fireEvent.press(screen.getByRole('button', { name: 'Plakat' }));
    expect(screen.getByText('Seite 1 von 2')).toBeTruthy();
  });
});

describe('MarketplaceSheet', () => {
  it('opens a detail without a report form', async () => {
    setup({ items: [publicAgent] });
    render(<MarketplaceSheet visible onClose={jest.fn()} kinds={['agent']} initialTab="agents" />);
    await act(async () => {});

    fireEvent.press(screen.getByRole('button', { name: 'Kommunal-Helfer' }));
    expect(screen.getByRole('header', { name: 'Kommunal-Helfer' })).toBeTruthy();
    expect(screen.getByText('Teilen')).toBeTruthy();
    expect(screen.queryByText('Melden')).toBeNull();
  });

  it('as a picker hands the tapped item back and closes', async () => {
    setup({ items: [sticker] });
    const onPick = jest.fn();
    const onClose = jest.fn();
    render(
      <MarketplaceSheet
        visible
        onClose={onClose}
        kinds={['sticker']}
        initialTab="sticker"
        onPick={onPick}
      />
    );
    await act(async () => {});

    // One kind: no tabs to choose from.
    expect(screen.queryByRole('button', { name: 'Agents' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Sonnenblume' }));
    expect(onPick).toHaveBeenCalledWith(sticker);
    expect(onClose).toHaveBeenCalled();
  });
});
