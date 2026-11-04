/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories. */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import { useProfilbildShare, type ProfilbildSnapshot } from './useProfilbildShare';
import { CUSTOM_ID } from '../../components/profilbild/BackgroundPicker';

const mockCreateImageShare = jest.fn<(a: unknown) => Promise<{ shareToken: string }>>();
const mockUpdateImageShare = jest.fn<(a: unknown) => Promise<void>>();

jest.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({
    createImageShare: mockCreateImageShare,
    updateImageShare: mockUpdateImageShare,
  }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@shopify/react-native-skia', () => ({
  ImageFormat: { PNG: 'png' },
  Skia: {},
}));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
jest.mock('../../components/profilbild/BackgroundPicker', () => ({ CUSTOM_ID: 'eigenes-bild' }));
jest.mock('../../services/storage', () => ({ secureStorage: { getToken: jest.fn() } }));

const GALLERY = '/api/share/0123456789abcdef0123456789abcdef/download';
const OLD = '/api/share/fedcba9876543210fedcba9876543210/download';
const person = { encodeToBase64: () => 'x' } as never;

const snapshot = (custom: ProfilbildSnapshot['custom']): ProfilbildSnapshot => ({
  model: {
    background: { kind: 'color', color: '#005437' },
    person: { x: 0, y: 0, scale: 1 },
    stickers: [],
  },
  backgroundId: CUSTOM_ID,
  custom,
});

const savedBackground = (call: unknown) =>
  (call as { metadata: { profilbild: { background: unknown } } }).metadata.profilbild.background;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateImageShare.mockResolvedValue({ shareToken: 'share1' });
});

describe('useProfilbildShare custom backgrounds', () => {
  it('saves a gallery background by its src, again on re-save, and never uploads', async () => {
    const { result } = await renderHook(() => useProfilbildShare());
    await act(async () => result.current.begin(null));
    const custom = { uri: 'file:///pick.jpg', image: {} as never, galleryUrl: GALLERY };

    await act(async () => result.current.save('a', person, snapshot(custom)));
    await act(async () => result.current.save('b', person, snapshot(custom)));

    expect(mockCreateImageShare).toHaveBeenCalledTimes(1);
    expect(mockUpdateImageShare).toHaveBeenCalledTimes(1);
    expect(savedBackground(mockCreateImageShare.mock.calls[0][0])).toEqual({
      kind: 'custom',
      url: GALLERY,
    });
  });

  it('re-saves a reopened old profilbild-background row under its stored URL', async () => {
    const { result } = await renderHook(() => useProfilbildShare());
    const custom = { uri: 'file:///cache/dl.jpg', image: {} as never, galleryUrl: null };
    await act(async () =>
      result.current.begin({ shareToken: 'old1', custom, customUrl: OLD, unrestored: [] } as never)
    );

    await act(async () => result.current.save('a', person, snapshot(custom)));

    expect(mockCreateImageShare).not.toHaveBeenCalled();
    expect(savedBackground(mockUpdateImageShare.mock.calls[0][0])).toEqual({
      kind: 'custom',
      url: OLD,
    });
  });
});
