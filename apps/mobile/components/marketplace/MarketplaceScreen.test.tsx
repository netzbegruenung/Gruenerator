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

import {
  DEFAULT_MARKETPLACE_FILTERS,
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
  useMarketplaceLike: () => ({ mutate: jest.fn() }),
  useMarketplaceSave: () => ({ mutate: mockSave }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
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
  it('shows one aisle per kind under „Alle", and „Alle anzeigen" opens that kind', async () => {
    setup({
      sections: [
        { kind: 'agent', items: [agent], hasMore: false },
        { kind: 'template', items: [], hasMore: false },
        { kind: 'sticker', items: [sticker], hasMore: true },
      ],
    });
    await renderScreen();

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

  it('groups one kind into Offiziell and Öffentlich', async () => {
    setup({ items: [agent, publicAgent] });
    await renderScreen('agents');

    expect(screen.getByRole('header', { name: 'Offiziell' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Öffentlich' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kommunal-Helfer' })).toBeTruthy();
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

    fireEvent.press(screen.getByRole('button', { name: 'Zurück zum Marktplatz' }));
    expect(screen.getByRole('header', { name: 'Öffentlich' })).toBeTruthy();
  });
});

describe('MarketplaceSheet', () => {
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
