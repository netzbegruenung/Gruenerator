/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type StudioAssetItem } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { useStudioAssets } from '@gruenerator/shared/studio-assets';
import { secureStorage } from '../../services/storage';

import { StudioAssetsScreen } from './StudioAssetsScreen';

const mockToggleLike = jest.fn();
jest.mock('@gruenerator/shared/studio-assets', () => ({
  STUDIO_ASSET_RIGHTS_LABEL: 'Rechte',
  STUDIO_ASSET_MODERATION_BADGE: {
    hidden: { label: 'Ausgeblendet', hint: 'h' },
    removed: { label: 'Entfernt', hint: 'r' },
  },
  useStudioAssets: jest.fn(),
  useStudioAssetMutations: () => ({ update: { mutate: jest.fn() }, remove: { mutate: jest.fn() } }),
  useStudioAssetToggles: () => ({ toggleLike: mockToggleLike, toggleFavorite: jest.fn() }),
}));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
jest.mock('../common/submitReport', () => ({ submitReport: jest.fn() }));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockAssets = useStudioAssets as unknown as jest.MockedFunction<
  (filter: unknown) => Record<string, unknown>
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

const asset = (over: Partial<StudioAssetItem>): StudioAssetItem => ({
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
  likesCount: 3,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

const theirs = asset({});
const mine = asset({
  id: '1c7f4d2f-9b5e-4a6f-8d3b-8e2f6c4b0a21',
  title: 'Mein Herz',
  isOwn: true,
  authorName: null,
  visibility: 'private',
  moderation: 'hidden',
});

async function renderScreen(items: StudioAssetItem[]) {
  mockAssets.mockReturnValue({
    items,
    isLoading: false,
    isError: false,
    isFetchNextPageError: false,
    isFetchingNextPage: false,
    isRefetching: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  });
  render(<StudioAssetsScreen />);
  await act(async () => {});
}

const openMenu = (title: string) =>
  fireEvent.press(screen.getByRole('button', { name: `Aktionen für „${title}“` }));

beforeEach(() => {
  jest.useFakeTimers();
  mockGetToken.mockResolvedValue('tok');
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('StudioAssetsScreen', () => {
  it('lists the items with like counts and the owner’s moderation badge', async () => {
    await renderScreen([theirs, mine]);
    expect(screen.getByText('Sonnenblume')).toBeTruthy();
    expect(screen.getByText('Kim')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Gefällt mir (3)' })).toHaveLength(2);
    expect(screen.getByText('Ausgeblendet')).toBeTruthy();
    expect(screen.getByText('Privat')).toBeTruthy();
  });

  it('reports someone else’s item through the report sheet', async () => {
    await renderScreen([theirs]);
    openMenu('Sonnenblume');
    expect(screen.queryByText('Löschen')).toBeNull();
    fireEvent.press(screen.getByText('Melden'));
    act(() => jest.runOnlyPendingTimers());
    expect(screen.getByText('Inhalt melden')).toBeTruthy();
  });

  it('offers no Melden on an own item', async () => {
    await renderScreen([mine]);
    openMenu('Mein Herz');
    expect(screen.queryByText('Melden')).toBeNull();
    expect(screen.getByText('Öffentlich machen')).toBeTruthy();
    expect(screen.getByText('Löschen')).toBeTruthy();
  });

  it('hands the item to the Profilbild as route params', async () => {
    await renderScreen([theirs]);
    openMenu('Sonnenblume');
    fireEvent.press(screen.getByText('Im Profilbild verwenden'));
    act(() => jest.runOnlyPendingTimers());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/profilbild',
      params: {
        asset: theirs.id,
        kind: 'sticker',
        src: theirs.src,
        w: '512',
        h: '480',
        title: 'Sonnenblume',
      },
    });
  });

  it('toggles a like from the menu without leaving the tile', async () => {
    await renderScreen([theirs]);
    openMenu('Sonnenblume');
    fireEvent.press(screen.getByText('Gefällt mir'));
    expect(mockToggleLike).toHaveBeenCalledWith(theirs);
  });
});
