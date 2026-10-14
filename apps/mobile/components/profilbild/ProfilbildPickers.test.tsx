/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type StudioAssetItem } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { COLOR_SWATCHES_DE, FREE_BACKGROUND_ID } from '@gruenerator/shared/profilbild';
import { useDiscoverStudioAssets, useOwnStudioAssets } from '@gruenerator/shared/studio-assets';
import { secureStorage } from '../../services/storage';

import { BackgroundPicker } from './BackgroundPicker';
import { StickerPicker } from './StickerPicker';

jest.mock('@gruenerator/shared/studio-assets', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/studio-assets'),
  useOwnStudioAssets: jest.fn(),
  useDiscoverStudioAssets: jest.fn(),
}));
// Skia needs the native module; the pickers only use it to decode an upload.
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {},
  Canvas: () => null,
  Group: () => null,
  Image: () => null,
  Rect: () => null,
  LinearGradient: () => null,
}));
jest.mock('../../services/imageEditMobile', () => ({ pickImageForEditor: jest.fn() }));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockOwn = useOwnStudioAssets as unknown as jest.MockedFunction<
  (kind: string, q: string) => Record<string, unknown>
>;
const mockDiscover = useDiscoverStudioAssets as unknown as jest.MockedFunction<
  (kind: string, q: string, sort: string) => Record<string, unknown>
>;
const mockGetToken = secureStorage.getToken as jest.MockedFunction<typeof secureStorage.getToken>;

const asset = (over: Partial<StudioAssetItem>): StudioAssetItem => ({
  id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
  kind: 'background',
  title: 'Wiese',
  tags: [],
  src: '/api/share/0123456789abcdef0123456789abcdef/download',
  thumbUrl: null,
  width: 1024,
  height: 1024,
  source: 'upload',
  visibility: 'private',
  audience: 'all',
  moderation: 'ok',
  isOwn: true,
  authorName: null,
  likesCount: 0,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

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

const own = asset({});
const shared = asset({
  id: '1c7f4d2f-9b5e-4a6f-8d3b-8e2f6c4b0a21',
  title: 'Berge',
  src: '/api/share/fedcba9876543210fedcba9876543210/download',
  isOwn: false,
});

beforeEach(() => {
  mockGetToken.mockResolvedValue('tok');
  mockOwn.mockReturnValue(section([own]));
  mockDiscover.mockReturnValue(section([shared]));
});

afterEach(() => {
  jest.clearAllMocks();
});

async function renderBackgrounds(selected = 'tanne') {
  const onSelect = jest.fn();
  const onPickGallery = jest.fn();
  render(
    <BackgroundPicker
      isAustria={false}
      images={{}}
      selected={selected}
      custom={null}
      freeBackground={null}
      onSelect={onSelect}
      onCustom={jest.fn()}
      onPickGallery={onPickGallery}
    />
  );
  await act(async () => {});
  return { onSelect, onPickGallery };
}

describe('BackgroundPicker', () => {
  it('has the tabs Farben, Vorlagen and Deine, with solids and gradients together', async () => {
    await renderBackgrounds();
    for (const tab of ['Farben', 'Vorlagen', 'Deine'])
      expect(screen.getByRole('radio', { name: tab })).toBeTruthy();
    expect(screen.getByLabelText('Vollfarben')).toBeTruthy();
    expect(screen.getByLabelText('Verläufe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eigene Farbe' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eigener Verlauf' })).toBeTruthy();
  });

  it('offers the CD colours first and picks a free colour', async () => {
    const { onSelect } = await renderBackgrounds();
    const swatches = screen.getAllByRole('button', { name: COLOR_SWATCHES_DE[0].label }).length;
    fireEvent.press(screen.getByRole('button', { name: 'Eigene Farbe' }));
    expect(onSelect).not.toHaveBeenCalled();
    // The CD colour stands once more as a quick pick in the sheet.
    expect(screen.getAllByRole('button', { name: COLOR_SWATCHES_DE[0].label })).toHaveLength(
      swatches + 1
    );
    fireEvent.press(screen.getByRole('button', { name: 'Farbe #ffffff' }));
    expect(onSelect).toHaveBeenLastCalledWith(FREE_BACKGROUND_ID, {
      kind: 'color',
      color: '#ffffff',
    });
  });

  it('sets a free gradient’s direction', async () => {
    const { onSelect } = await renderBackgrounds();
    fireEvent.press(screen.getByRole('button', { name: 'Eigener Verlauf' }));
    fireEvent.press(screen.getByRole('button', { name: 'Diagonal' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      FREE_BACKGROUND_ID,
      expect.objectContaining({ kind: 'gradient', angle: 135 })
    );
  });

  it('shows own and saved backgrounds under Deine, then upload and Entdecken', async () => {
    const { onPickGallery } = await renderBackgrounds();
    fireEvent.press(screen.getByRole('radio', { name: 'Deine' }));
    expect(mockOwn).toHaveBeenCalledWith('background', '');
    expect(screen.getByRole('button', { name: 'Hintergrund „Wiese“' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bild hochladen' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Hintergründe entdecken' }));
    expect(screen.getByRole('header', { name: 'Hintergründe entdecken' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Hintergrund „Berge“' }));
    expect(onPickGallery).toHaveBeenCalledWith(shared);
    expect(screen.queryByRole('header', { name: 'Hintergründe entdecken' })).toBeNull();
  });

  it('opens on Deine when the own photo is in use', async () => {
    await renderBackgrounds('eigenes-bild');
    expect(screen.getByRole('button', { name: 'Bild hochladen' })).toBeTruthy();
  });
});

describe('StickerPicker', () => {
  it('lists the Grüne stickers, then own and saved, then Erstellen and Entdecken — no tabs', async () => {
    mockOwn.mockReturnValue(section([asset({ kind: 'sticker', title: 'Herz' })]));
    render(<StickerPicker isAustria={false} onAdd={jest.fn()} onAddGallery={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByLabelText('Grüne Sticker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sticker „Herz“ hinzufügen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gemerkt' })).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Sticker erstellen' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/sticker-neu',
      params: { return: 'profilbild' },
    });
    expect(screen.getByRole('button', { name: 'Sticker entdecken' })).toBeTruthy();
  });
});
