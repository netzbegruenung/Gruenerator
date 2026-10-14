/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type StudioAssetItem } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';

import { useDiscoverStudioAssets } from '@gruenerator/shared/studio-assets';
import { secureStorage } from '../../services/storage';

import { StudioAssetsDiscoverScreen } from './StudioAssetsDiscoverScreen';

jest.mock('@gruenerator/shared/studio-assets', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/studio-assets'),
  useDiscoverStudioAssets: jest.fn(),
  useStudioAssetMutations: () => ({ update: { mutate: jest.fn() }, remove: { mutate: jest.fn() } }),
  useStudioAssetToggles: () => ({ toggleLike: jest.fn(), toggleFavorite: jest.fn() }),
}));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockDiscover = useDiscoverStudioAssets as unknown as jest.MockedFunction<
  (kind: string, q: string, sort: string) => Record<string, unknown>
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

const sticker = {
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
} satisfies StudioAssetItem;

const section = (items: StudioAssetItem[]) => ({
  data: {
    items,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    error: null,
    retry: jest.fn(),
  },
  error: null,
  settled: true,
});

beforeEach(() => {
  mockGetToken.mockResolvedValue('tok');
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('StudioAssetsDiscoverScreen', () => {
  it('lists what others share and switches to the popular order', async () => {
    mockDiscover.mockImplementation((kind) => section(kind === 'sticker' ? [sticker] : []));
    render(<StudioAssetsDiscoverScreen initialQuery="" />);
    await act(async () => {});
    expect(screen.getByRole('header', { name: 'Sticker' })).toBeTruthy();
    expect(screen.getByText('Kim')).toBeTruthy();
    expect(screen.queryByRole('header', { name: 'Hintergründe' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Sortierung: Neu' }));
    expect(mockDiscover).toHaveBeenLastCalledWith('background', '', 'popular');
  });

  it('starts from the search handed over by the overview', async () => {
    mockDiscover.mockReturnValue(section([]));
    render(<StudioAssetsDiscoverScreen initialQuery="herz" />);
    await act(async () => {});
    expect(mockDiscover).toHaveBeenCalledWith('sticker', 'herz', 'new');
    expect(screen.getByText('Nichts gefunden')).toBeTruthy();
  });
});
