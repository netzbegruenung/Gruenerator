/**
 * Was hier leise falsch werden könnte: der Browser bietet eine Datei an, die der
 * Chat-Abruf gar nicht lesen kann (oder graut eine lesbare aus), oder ein
 * abgeschnittener Ordner sieht vollständig aus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listFiles = vi.fn();
const listDriveItems = vi.fn();
vi.mock('../api-clients/googleDriveClient.js', () => ({ listFiles }));
vi.mock('../api-clients/microsoftGraphClient.js', () => ({ listDriveItems }));

const { browseDrive } = await import('./driveBrowse.js');

beforeEach(() => {
  listFiles.mockReset();
  listDriveItems.mockReset();
});

describe('browseDrive', () => {
  it('Google: Ordner, exportierbare Google-Formate und Größe', async () => {
    listFiles.mockResolvedValue({
      nextPageToken: 'more',
      files: [
        { id: 'f', name: 'Ordner', mimeType: 'application/vnd.google-apps.folder' },
        { id: 'd', name: 'Antrag', mimeType: 'application/vnd.google-apps.document' },
        { id: 'p', name: 'a.pdf', mimeType: 'application/pdf', size: '2048' },
        { id: 'z', name: 'a.zip', mimeType: 'application/zip', size: '10' },
      ],
    });

    const result = await browseDrive('google', 'tok', 'folder1');

    expect(listFiles).toHaveBeenCalledWith('tok', 'folder1');
    expect(result.truncated).toBe(true);
    expect(result.entries.map((e) => [e.id, e.isFolder, e.isSupported, e.size])).toEqual([
      ['f', true, false, null],
      ['d', false, true, null],
      ['p', false, true, 2048],
      ['z', false, false, 10],
    ]);
  });

  it('Microsoft: Office-Formate, die Graph nach PDF umwandelt, sind lesbar', async () => {
    listDriveItems.mockResolvedValue({
      nextLink: null,
      items: [
        { id: 'f', name: 'Ordner', size: 99, folder: { childCount: 1 } },
        { id: 'x', name: 'Haushalt.xlsx', size: 5, file: { mimeType: 'application/x' } },
        { id: 'e', name: 'setup.exe', size: 5, file: { mimeType: 'application/y' } },
      ],
    });

    const result = await browseDrive('microsoft', 'tok');

    expect(result.truncated).toBe(false);
    expect(result.entries.map((e) => [e.id, e.isFolder, e.isSupported, e.size])).toEqual([
      ['f', true, false, null],
      ['x', false, true, 5],
      ['e', false, false, 5],
    ]);
  });
});
