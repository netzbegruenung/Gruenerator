/**
 * Was hier leise falsch werden könnte: die oberste Ebene zeigt wieder jede
 * Datei des Kontos statt „Meine Ablage", oder ein Ordner mit mehr als einer
 * Seite zeigt nur die erste.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('axios', () => ({ default: { get } }));

const { listFiles } = await import('./googleDriveClient.js');

const file = (id: string) => ({
  id,
  name: `${id}.pdf`,
  mimeType: 'application/pdf',
  modifiedTime: '',
});

beforeEach(() => {
  get.mockReset();
});

describe('listFiles', () => {
  it('listet ohne Ordner nur die oberste Ebene', async () => {
    get.mockResolvedValueOnce({ data: { files: [file('a')] } });

    await listFiles('tok');

    expect(get.mock.calls[0]?.[1].params.q).toBe("'root' in parents and trashed = false");
  });

  it('folgt nextPageToken über mehrere Seiten', async () => {
    get
      .mockResolvedValueOnce({ data: { files: [file('a')], nextPageToken: 'p2' } })
      .mockResolvedValueOnce({ data: { files: [file('b')] } });

    const result = await listFiles('tok', 'folder1');

    expect(result.files.map((f) => f.id)).toEqual(['a', 'b']);
    expect(result.nextPageToken).toBeNull();
    expect(get.mock.calls[1]?.[1].params).toMatchObject({
      q: "'folder1' in parents and trashed = false",
      pageToken: 'p2',
    });
  });

  it('lehnt eine Ordner-Id ab, die die Abfrage verlassen könnte', async () => {
    await expect(listFiles('tok', "x' or '1'='1")).rejects.toThrow('Invalid folder ID format');
    expect(get).not.toHaveBeenCalled();
  });
});
