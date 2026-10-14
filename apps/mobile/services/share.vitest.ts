import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { shareBase64Image, shareBytesAsFile, openUrl } from './share';

vi.mock('expo-clipboard', () => ({}));
const writeShareFile = vi.hoisted(() =>
  vi.fn((_bytes: Uint8Array, name: string) => ({ uri: `cache:/webview-share/1-1/${name}` }))
);
vi.mock('./shareCache', () => ({ writeShareFile }));
vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: vi.fn(async () => {}),
}));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: vi.fn(async () => ({ type: 'opened' })) }));
vi.mock('@gruenerator/shared', () => ({ getPlatformShareUrl: vi.fn() }));
vi.mock('@gruenerator/shared/utils', () => ({ stripDataUrlPrefix: (s: string) => s }));

const refused = new Error('Unable to open URL: https://gruenerator.eu/datenschutz');

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('openUrl', () => {
  it('öffnet über den Systembrowser', async () => {
    await expect(openUrl('https://gruenerator.eu/datenschutz')).resolves.toBe(true);
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('fällt bei verweigerter Übergabe auf den In-App-Browser zurück (GlitchTip #669)', async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(refused);
    await expect(openUrl('https://gruenerator.eu/datenschutz')).resolves.toBe(true);
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://gruenerator.eu/datenschutz');
  });

  it('gibt Nicht-Web-Schemata nicht an den In-App-Browser', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(Linking.openURL).mockRejectedValueOnce(refused);
    await expect(openUrl('mailto:info@gruenerator.eu')).resolves.toBe(false);
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalled();
  });

  it('meldet false, wenn auch der In-App-Browser scheitert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(Linking.openURL).mockRejectedValueOnce(refused);
    vi.mocked(WebBrowser.openBrowserAsync).mockRejectedValueOnce(new Error('no browser'));
    await expect(openUrl('https://gruenerator.eu/datenschutz')).resolves.toBe(false);
  });
});

describe('shareBytesAsFile', () => {
  it('shares through the kept share cache, not a file deleted on resolve (#4402)', async () => {
    await shareBytesAsFile(new Uint8Array([1]), 'grafik.zip', 'Datei speichern', 'application/zip');

    expect(writeShareFile).toHaveBeenCalledWith(new Uint8Array([1]), 'grafik.zip');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'cache:/webview-share/1-1/grafik.zip',
      expect.objectContaining({ mimeType: 'application/zip', dialogTitle: 'Datei speichern' })
    );
  });

  it('shares base64 images the same way', async () => {
    await shareBase64Image('aGVsbG8=');

    expect(writeShareFile.mock.calls[0][1]).toMatch(/^share_\d+\.png$/);
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      expect.stringMatching(/\.png$/),
      expect.objectContaining({ mimeType: 'image/png' })
    );
  });

  it.each([
    ['image/png', 'public.png'],
    ['application/pdf', 'com.adobe.pdf'],
    ['application/zip', 'public.zip-archive'],
    ['text/markdown', 'public.data'],
  ])('passes the UTI for %s on iOS so it is not shared as a movie', async (mime, uti) => {
    Platform.OS = 'ios';
    try {
      await shareBytesAsFile(new Uint8Array([1]), 'datei', 'Teilen', mime);
    } finally {
      Platform.OS = 'android';
    }
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mimeType: mime, UTI: uti })
    );
  });
});
