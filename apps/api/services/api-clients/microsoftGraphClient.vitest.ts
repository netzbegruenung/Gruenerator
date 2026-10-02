/**
 * Was hier leise falsch werden könnte: ein Ordner mit mehr als einer Seite zeigt
 * nur die erste, ein fremder `nextLink` bekommt den Bearer-Token, oder die
 * PDF-Umwandlung fragt Graph nicht mehr danach.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('axios', () => ({ default: { get } }));

const { downloadDriveItem, listDriveItems } = await import('./microsoftGraphClient.js');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const item = (id: string) => ({ id, name: `${id}.docx`, size: 1, lastModifiedDateTime: '' });

beforeEach(() => {
  get.mockReset();
});

describe('listDriveItems', () => {
  it('folgt nextLink über mehrere Seiten', async () => {
    get
      .mockResolvedValueOnce({
        data: {
          value: [item('a')],
          '@odata.nextLink': `${GRAPH}/me/drive/root/children?$skiptoken=x`,
        },
      })
      .mockResolvedValueOnce({ data: { value: [item('b')] } });

    const result = await listDriveItems('tok');

    expect(result.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.nextLink).toBeNull();
    expect(get).toHaveBeenNthCalledWith(2, `${GRAPH}/me/drive/root/children?$skiptoken=x`, {
      headers: { Authorization: 'Bearer tok' },
      params: undefined,
    });
  });

  it('schickt den Token nie an einen fremden nextLink', async () => {
    get.mockResolvedValueOnce({
      data: { value: [item('a')], '@odata.nextLink': 'https://evil.example/steal' },
    });

    await expect(listDriveItems('tok')).rejects.toThrow('nextLink');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('downloadDriveItem', () => {
  it('fragt mit asPdf nach format=pdf', async () => {
    get.mockResolvedValue({ data: new ArrayBuffer(3) });

    await downloadDriveItem('tok', 'item-1', { asPdf: true });
    await downloadDriveItem('tok', 'item-1');

    expect(get.mock.calls.map((c) => (c[1] as { params?: unknown }).params)).toEqual([
      { format: 'pdf' },
      undefined,
    ]);
  });
});
