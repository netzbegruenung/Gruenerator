import { Alert, Linking, Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { alertSavedToGallery, galleryTargetUrl, openGallery } from './gallery';

/**
 * `react-native` ist hier der Stub aus `test/stubs/` — Platform.OS ist
 * schreibbar, Alert und Linking sind `vi.fn()`. Geprüft wird die Entscheidung
 * (was lässt sich öffnen, welche Knöpfe erscheinen), nicht das Öffnen selbst.
 */
const ANDROID_ASSET = 'content://media/external/images/media/1000083628';

beforeEach(() => {
  Platform.OS = 'android';
});

afterEach(() => {
  vi.clearAllMocks();
  Platform.OS = 'android';
});

describe('galleryTargetUrl', () => {
  it('öffnet auf Android die content-URI des Assets', () => {
    expect(galleryTargetUrl(ANDROID_ASSET)).toBe(ANDROID_ASSET);
  });

  it.each([[null], [''], ['file:///storage/emulated/0/DCIM/bild.png'], ['ph://ABC-123']])(
    'hat auf Android für %j kein Ziel',
    (assetId) => {
      // `getUri()` liefert einen file://-Pfad; ein ACTION_VIEW darauf wirft seit
      // Android 7 FileUriExposedException. Nur die content-URI ist brauchbar.
      expect(galleryTargetUrl(assetId)).toBeNull();
    }
  );

  it('öffnet auf iOS die Fotos-App, auch ohne Asset', () => {
    Platform.OS = 'ios';
    expect(galleryTargetUrl('ph://ABC-123')).toBe('photos-redirect://');
    expect(galleryTargetUrl(null)).toBe('photos-redirect://');
  });
});

describe('openGallery', () => {
  it('öffnet das Ziel', async () => {
    await expect(openGallery(ANDROID_ASSET)).resolves.toBe(true);
    expect(Linking.openURL).toHaveBeenCalledWith(ANDROID_ASSET);
  });

  it('ruft ohne Ziel gar nicht erst', async () => {
    await expect(openGallery(null)).resolves.toBe(false);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('meldet, wenn kein Betrachter antwortet', async () => {
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error('No Activity found'));
    await expect(openGallery(ANDROID_ASSET)).resolves.toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('Fehler', expect.stringContaining('Galerie'));
  });
});

describe('alertSavedToGallery', () => {
  it('bietet den Weg in die Galerie an', () => {
    alertSavedToGallery(ANDROID_ASSET, 'Das Bild wurde in der Galerie gespeichert.');

    const [title, message, buttons] = vi.mocked(Alert.alert).mock.calls[0] as [
      string,
      string,
      { text: string; onPress?: () => void }[],
    ];
    expect(title).toBe('Gespeichert');
    expect(message).toBe('Das Bild wurde in der Galerie gespeichert.');
    expect(buttons.map((b) => b.text)).toEqual(['OK', 'In Galerie anzeigen']);

    buttons[1]?.onPress?.();
    expect(Linking.openURL).toHaveBeenCalledWith(ANDROID_ASSET);
  });

  it('bleibt beim blanken Hinweis, wenn es nichts zu öffnen gibt', () => {
    alertSavedToGallery(null, 'Das Bild wurde in der Galerie gespeichert.');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Gespeichert',
      'Das Bild wurde in der Galerie gespeichert.'
    );
  });
});
