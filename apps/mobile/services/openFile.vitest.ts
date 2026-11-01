import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFile } from './openFile';
import { shareFile } from './share';

/**
 * `react-native` ist hier der Stub aus `test/stubs/` — `Platform.OS` ist
 * schreibbar. Geprüft wird die Entscheidung: Auf Android muss ein PDF als
 * ACTION_VIEW bei einem Betrachter landen, nicht im Teilen-Blatt (ACTION_SEND),
 * das gar keine Betrachter listet.
 */

const startActivityAsync = vi.hoisted(() => vi.fn(async () => ({ resultCode: -1 })));
const getContentUriAsync = vi.hoisted(() =>
  vi.fn(async (uri: string) => uri.replace('file:///cache/', 'content://de.gruenerator.provider/'))
);

vi.mock('expo-intent-launcher', () => ({ startActivityAsync }));
vi.mock('expo-file-system/legacy', () => ({ getContentUriAsync }));
const canPreview = vi.hoisted(() => vi.fn(async () => true));
const preview = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('expo-file-system', () => ({
  File: Object.assign(
    vi.fn(function (this: { uri: string }, uri: string) {
      this.uri = uri;
    }),
    { canPreview, preview }
  ),
}));
vi.mock('./share', () => ({ shareFile: vi.fn(async () => undefined) }));

const PDF_URI = 'file:///cache/abc.pdf';
const PDF = { mimeType: 'application/pdf', dialogTitle: 'Antrag' };

beforeEach(() => {
  Platform.OS = 'android';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('openFile auf Android', () => {
  it('startet ACTION_VIEW auf der content-URI, mit Lesefreigabe', async () => {
    await openFile(PDF_URI, PDF);

    expect(getContentUriAsync).toHaveBeenCalledWith(PDF_URI);
    expect(startActivityAsync).toHaveBeenCalledWith('android.intent.action.VIEW', {
      data: 'content://de.gruenerator.provider/abc.pdf',
      type: 'application/pdf',
      // Ohne FLAG_GRANT_READ_URI_PERMISSION (1) löst der Betrachter die URI auf
      // und wird vom FileProvider abgewiesen.
      flags: 1,
    });
    expect(shareFile).not.toHaveBeenCalled();
  });

  it('fällt aufs Teilen-Blatt zurück, wenn kein Betrachter installiert ist', async () => {
    startActivityAsync.mockRejectedValueOnce(new Error('ActivityNotFoundException'));

    await openFile(PDF_URI, PDF);

    expect(shareFile).toHaveBeenCalledWith(PDF_URI, {
      mimeType: 'application/pdf',
      dialogTitle: 'Antrag',
      uti: 'com.adobe.pdf',
    });
  });
});

describe('openFile auf iOS', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  it('zeigt die Datei in Quick Look, nicht im Teilen-Blatt', async () => {
    await openFile(PDF_URI, PDF);

    expect(preview).toHaveBeenCalledWith({ uri: PDF_URI }, { title: 'Antrag' });
    expect(startActivityAsync).not.toHaveBeenCalled();
    expect(shareFile).not.toHaveBeenCalled();
  });

  it('teilt mit UTI, wenn Quick Look den Typ nicht zeigen kann', async () => {
    canPreview.mockResolvedValueOnce(false);

    await openFile(PDF_URI, PDF);

    expect(preview).not.toHaveBeenCalled();
    expect(shareFile).toHaveBeenCalledWith(PDF_URI, {
      mimeType: 'application/pdf',
      dialogTitle: 'Antrag',
      // Ohne UTI routet iOS das Dokument in keine App, die es anzeigen kann.
      uti: 'com.adobe.pdf',
    });
  });
});
