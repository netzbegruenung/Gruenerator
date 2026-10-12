import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const written: { path: string; content: string }[] = [];
const shareAsync = vi.fn();

vi.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    write(content: string) {
      written.push({ path: this.uri, content });
    }
  },
}));
vi.mock('expo-sharing', () => ({ shareAsync: (...args: unknown[]) => shareAsync(...args) }));

import { exportDocumentText } from './exportDocumentText';

describe('exportDocumentText', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    written.length = 0;
    shareAsync.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: async () => '# Hallo' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes markdown as .md and shares it as text/plain', async () => {
    await exportDocumentText('doc-1', 'Mein Text', 'markdown', 'tok');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/docs\/doc-1\/export\/markdown$/),
      {
        headers: { Authorization: 'Bearer tok' },
      }
    );
    expect(written).toEqual([{ path: 'cache/Mein Text.md', content: '# Hallo' }]);
    expect(shareAsync).toHaveBeenCalledWith('cache/Mein Text.md', { mimeType: 'text/plain' });
  });

  it('writes plain text as .txt', async () => {
    await exportDocumentText('doc-1', 'Mein Text', 'text', 'tok');
    expect(written[0].path).toBe('cache/Mein Text.txt');
  });

  it('replaces unsafe filename characters with underscores', async () => {
    await exportDocumentText('doc-1', 'a/b?c', 'text', 'tok');
    expect(written[0].path).toBe('cache/a_b_c.txt');
  });

  it('falls back to "Dokument" for an empty title', async () => {
    await exportDocumentText('doc-1', '', 'text', 'tok');
    await exportDocumentText('doc-1', null, 'text', 'tok');
    expect(written.map((w) => w.path)).toEqual(['cache/Dokument.txt', 'cache/Dokument.txt']);
  });

  it('rejects when the server refuses the export', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(exportDocumentText('doc-1', 'T', 'text', 'tok')).rejects.toThrow(
      'Export fehlgeschlagen'
    );
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
