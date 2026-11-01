import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';

import { useProfilbildCutout } from '../../hooks/profilbild/useProfilbildCutout';
import {
  loadProfilbildReopen,
  useProfilbildShare,
} from '../../hooks/profilbild/useProfilbildShare';
import { pickImageForEditor } from '../../services/imageEditMobile';

import { ProfilbildScreen } from './ProfilbildScreen';

jest.mock('@gruenerator/shared/studio-assets', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/studio-assets'),
  useOwnStudioAssets: jest.fn(),
}));
// Skia needs the native module; the stage drawing is covered by the scene tests.
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {},
  Canvas: () => null,
  Group: () => null,
  Image: () => null,
  Rect: () => null,
  Line: () => null,
  LinearGradient: () => null,
  DashPathEffect: () => null,
  rect: () => ({}),
  rrect: () => ({}),
  vec: () => ({}),
  drawAsImage: jest.fn(),
  ImageFormat: { PNG: 'png' },
}));
// The editor draws gestures from shared values; the worklets runtime does not
// load under jest.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));
jest.mock('../../hooks/profilbild/useProfilbildCutout', () => ({ useProfilbildCutout: jest.fn() }));
jest.mock('../../hooks/profilbild/useProfilbildImages', () => ({
  useProfilbildImages: () => ({ status: 'loading', reload: jest.fn() }),
}));
jest.mock('../../hooks/profilbild/useProfilbildAutosave', () => ({
  useProfilbildAutosave: () => ({ state: 'idle', noteSaved: jest.fn() }),
}));
jest.mock('../../hooks/profilbild/useProfilbildShare', () => ({
  useProfilbildShare: jest.fn(),
  clearShareImages: jest.fn(),
  loadProfilbildReopen: jest.fn(),
  loadShareImage: jest.fn(),
}));
jest.mock('../../services/imageEditMobile', () => ({
  pickImageForEditor: jest.fn(),
  takePhotoForEditor: jest.fn(),
}));
jest.mock('../../hooks/useStudioMedia', () => ({
  useRecentProfilbilder: () => ({ items: [], isPending: false }),
}));
jest.mock('expo-media-library', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(),
  presentPermissionsPicker: jest.fn(),
  Query: jest.fn(),
  AssetField: { MEDIA_TYPE: 'mediaType', CREATION_TIME: 'creationTime' },
  MediaType: { IMAGE: 'image' },
}));
jest.mock('../../services/imageStudio', () => ({ saveImageToGallery: jest.fn() }));
jest.mock('../../services/share', () => ({ shareBase64Image: jest.fn() }));
jest.mock('../../services/storage', () => ({
  secureStorage: { getToken: jest.fn(async () => 'tok') },
}));
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockCutout = useProfilbildCutout as jest.MockedFunction<typeof useProfilbildCutout>;
const mockShare = useProfilbildShare as unknown as jest.MockedFunction<
  () => Record<string, unknown>
>;
const mockReopen = loadProfilbildReopen as jest.MockedFunction<typeof loadProfilbildReopen>;
const mockPick = pickImageForEditor as jest.MockedFunction<typeof pickImageForEditor>;
const mockStart = jest.fn();
const mockBegin = jest.fn();

beforeEach(() => {
  mockCutout.mockReturnValue({
    state: { status: 'idle' },
    start: mockStart,
    retry: jest.fn(),
    reset: jest.fn(),
    adopt: jest.fn(),
  } as unknown as ReturnType<typeof useProfilbildCutout>);
  mockShare.mockReturnValue({ save: jest.fn(), begin: mockBegin });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ProfilbildScreen before a photo', () => {
  it('opens the editor straight away with the upload zone and the toolbar', async () => {
    await render(<ProfilbildScreen isAustria={false} shareToken={null} galleryAsset={null} />);
    await act(async () => {});
    expect(screen.getByText('Kein Foto ausgewählt')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Foto aufnehmen' })).toBeTruthy();
    // The background is the one tool that works before the photo.
    expect(screen.getByRole('button', { name: 'Hintergrund' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sticker' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Foto' })).toBeDisabled();
    // Format waits for the photo, and the pickers wait for their sheet.
    expect(screen.queryByRole('radiogroup', { name: 'Vorschau' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Farben' })).toBeNull();
  });

  it('opens the background picker in its sheet and closes it again', async () => {
    await render(<ProfilbildScreen isAustria={false} shareToken={null} galleryAsset={null} />);
    await act(async () => {});
    await fireEvent.press(screen.getByRole('button', { name: 'Hintergrund' }));
    expect(screen.getByRole('radio', { name: 'Farben' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Fertig' }));
    expect(screen.queryByRole('radio', { name: 'Farben' })).toBeNull();
  });

  it('shows the editor skeleton while a saved Profilbild loads', async () => {
    mockReopen.mockReturnValue(new Promise(() => {}));
    await render(<ProfilbildScreen isAustria={false} shareToken="abc" galleryAsset={null} />);
    await act(async () => {});
    expect(screen.getByLabelText('Profilbild wird geladen')).toBeTruthy();
    expect(screen.queryByText('Kein Foto ausgewählt')).toBeNull();
  });

  it('starts a fresh save session for a picked photo', async () => {
    const ref = { uri: 'file:///portrait.jpg', width: 800, height: 1000 };
    mockPick.mockResolvedValue(ref as never);
    await render(<ProfilbildScreen isAustria={false} shareToken={null} galleryAsset={null} />);
    await act(async () => {});
    await act(async () => await fireEvent.press(screen.getByText('Alle Fotos ›')));
    expect(mockBegin).toHaveBeenCalledWith(null);
    expect(mockStart).toHaveBeenCalledWith(ref);
  });
});
