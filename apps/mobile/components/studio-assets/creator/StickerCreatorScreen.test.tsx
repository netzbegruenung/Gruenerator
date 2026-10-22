/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type StudioAssetItem } from '@gruenerator/contracts';
import { profilbildAssetParams } from '@gruenerator/shared/stickers';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';

import { uploadStickerPng } from './uploadSticker';
import { renderBadge, writeStickerPng } from './stickerRender';

import { StickerCreatorScreen } from './StickerCreatorScreen';

const mockCreate = jest.fn<(body: unknown) => Promise<StudioAssetItem>>();
const mockTypeface = jest.fn<() => object | null>(() => null);
jest.mock('@gruenerator/shared/studio-assets', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/studio-assets'),
  useStudioAssetMutations: () => ({ create: { mutateAsync: mockCreate } }),
}));
// Skia needs the native module; the pixel work is covered by the model tests.
jest.mock('@shopify/react-native-skia', () => ({
  Canvas: () => null,
  Image: () => null,
  Rect: () => null,
  useTypeface: () => mockTypeface(),
}));
jest.mock('./stickerRender', () => ({
  StickerImageError: class extends Error {},
  decodeImage: jest.fn(async () => ({})),
  motifFromImage: () => ({ motif: { width: () => 400, height: () => 300 }, transparent: true }),
  renderImageSticker: () => ({ width: () => 512, height: () => 384 }),
  renderBadge: jest.fn(),
  measureBadgeLine: jest.fn(),
  writeStickerPng: jest.fn(async () => 'file:///cache/sticker.png'),
}));
jest.mock('./uploadSticker', () => ({ uploadStickerPng: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({
    canceled: false,
    assets: [{ uri: 'file:///picked/herz.png', mimeType: 'image/png', fileName: 'Herz.png' }],
  })),
  UIImagePickerPreferredAssetRepresentationMode: { Current: 'current' },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    delete() {}
  },
}));
jest.mock('../../../services/imageEditMobile', () => ({
  pickImageForEditor: jest.fn(),
  takePhotoForEditor: jest.fn(),
}));
jest.mock('../../../services/backgroundRemoval', () => ({
  CutoutError: class extends Error {},
  cutoutFromRef: jest.fn(),
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: ({ children }: { children: ReactNode }) => children,
}));

const mockUpload = uploadStickerPng as jest.MockedFunction<typeof uploadStickerPng>;
const mockWrite = writeStickerPng as jest.MockedFunction<typeof writeStickerPng>;
const mockRenderBadge = renderBadge as jest.MockedFunction<typeof renderBadge>;

const item: StudioAssetItem = {
  id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
  kind: 'sticker',
  title: 'Herz',
  tags: [],
  src: '/api/share/0123456789abcdef0123456789abcdef/download',
  thumbUrl: null,
  width: 512,
  height: 384,
  source: 'upload',
  visibility: 'private',
  audience: 'de-DE',
  moderation: 'ok',
  isOfficial: false,
  isOwn: true,
  authorName: null,
  likesCount: 0,
  liked: false,
  favorited: false,
  createdAt: '2026-10-14T00:00:00Z',
};

const button = (name: string) => screen.getByRole('button', { name });
const isDisabled = (name: string) =>
  expect(button(name).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: true })
  );
const isEnabled = (name: string) =>
  expect(button(name).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: false })
  );

/** Upload mode up to the save form, with the title the file name suggested. */
async function designUpload(returnTo: 'profilbild' | null = null) {
  render(<StickerCreatorScreen locale="de-DE" returnTo={returnTo} />);
  fireEvent.press(button('Bild hochladen'));
  fireEvent.press(button('Bild wählen'));
  await waitFor(() => isEnabled('Weiter'));
  fireEvent.press(button('Weiter'));
  expect(screen.getByDisplayValue('Herz')).toBeTruthy();
}

beforeEach(() => {
  mockUpload.mockResolvedValue('share-token');
  mockCreate.mockResolvedValue(item);
});

afterEach(() => {
  jest.clearAllMocks();
  mockTypeface.mockReturnValue(null);
  mockRenderBadge.mockReset();
});

describe('StickerCreatorScreen', () => {
  it('saves an uploaded sticker privately with its source', async () => {
    await designUpload();
    await act(async () => fireEvent.press(button('Sticker speichern')));

    expect(mockWrite).toHaveBeenCalledWith(expect.anything(), 'herz.png');
    expect(mockUpload).toHaveBeenCalledWith('file:///cache/sticker.png', 'herz.png');
    expect(mockCreate).toHaveBeenCalledWith({
      shareToken: 'share-token',
      kind: 'sticker',
      source: 'upload',
      title: 'Herz',
      tags: [],
      visibility: 'private',
      audience: 'de-DE',
      rightsConfirmed: false,
    });
    expect(await screen.findByText('Fertig!')).toBeTruthy();
    fireEvent.press(button('Im Profilbild verwenden'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(focused)/profilbild',
      params: profilbildAssetParams(item),
    });
  });

  it('hands the sticker straight back to the Profilbild', async () => {
    await designUpload('profilbild');
    await act(async () => fireEvent.press(button('Sticker speichern')));

    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/(focused)/profilbild',
      params: profilbildAssetParams(item),
    });
    expect(screen.queryByText('Fertig!')).toBeNull();
  });

  it('asks for the rights before a public save', async () => {
    await designUpload();
    expect(screen.queryByText('Dein Name wird dabei angezeigt.')).toBeNull();
    fireEvent(screen.getByLabelText('Unter „Entdecken“ öffentlich teilen'), 'valueChange', true);
    expect(screen.getByText('Dein Name wird dabei angezeigt.')).toBeTruthy();
    isDisabled('Sticker speichern');

    fireEvent(screen.getByRole('radio', { name: 'Alle' }), 'press');
    fireEvent(
      screen.getByLabelText(
        'Ich habe die Rechte an diesem Bild und es darf öffentlich geteilt werden.'
      ),
      'valueChange',
      true
    );
    await act(async () => fireEvent.press(button('Sticker speichern')));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public', audience: 'all', rightsConfirmed: true })
    );
  });

  it('keeps the form when the upload fails', async () => {
    mockUpload.mockRejectedValue(new Error('offline'));
    await designUpload();
    await act(async () => fireEvent.press(button('Sticker speichern')));

    expect(
      screen.getByText('Das Hochladen hat nicht geklappt. Bitte versuche es erneut.')
    ).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Herz')).toBeTruthy();
  });

  it('retries a failed save with the file it already uploaded', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Speichern fehlgeschlagen.'));
    await designUpload();
    await act(async () => fireEvent.press(button('Sticker speichern')));
    expect(screen.getByText('Speichern fehlgeschlagen.')).toBeTruthy();

    await act(async () => fireEvent.press(button('Sticker speichern')));
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ shareToken: 'share-token' })
    );
    expect(await screen.findByText('Fertig!')).toBeTruthy();
  });

  it('locks the sharing switches while saving', async () => {
    mockUpload.mockReturnValue(new Promise(() => {}));
    await designUpload();
    await act(async () => fireEvent.press(button('Sticker speichern')));
    expect(screen.getByLabelText('Unter „Entdecken“ öffentlich teilen').props.disabled).toBe(true);
  });

  it('asks for text instead of spinning on an empty badge', async () => {
    render(<StickerCreatorScreen locale="de-AT" returnTo={null} />);
    fireEvent.press(button('Text-Badge'));
    fireEvent.changeText(screen.getByLabelText('Text'), '  ');
    expect(screen.getByText('Schreib einen Text, dann erscheint hier dein Badge.')).toBeTruthy();
  });

  it('says so when the badge cannot be drawn', async () => {
    mockTypeface.mockReturnValue({});
    mockRenderBadge.mockImplementation(() => {
      throw new Error('no font');
    });
    render(<StickerCreatorScreen locale="de-DE" returnTo={null} />);
    fireEvent.press(button('Text-Badge'));
    expect(await screen.findByText('Der Badge konnte nicht erstellt werden.')).toBeTruthy();
    isDisabled('Weiter');
  });
});
