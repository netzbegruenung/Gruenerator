import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openUrl } from './share';

vi.mock('expo-clipboard', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {}, Paths: {} }));
vi.mock('expo-sharing', () => ({}));
vi.mock('expo-web-browser', () => ({ openBrowserAsync: vi.fn(async () => ({ type: 'opened' })) }));
vi.mock('@gruenerator/shared', () => ({ getPlatformShareUrl: vi.fn() }));
vi.mock('@gruenerator/shared/utils', () => ({ stripDataUrlPrefix: vi.fn() }));

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
