import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  entries: new Map<string, 'dir' | 'file'>(),
  written: [] as string[],
  deleted: [] as string[],
}));

vi.mock('expo-file-system', () => {
  const remove = (uri: string) => {
    fs.deleted.push(uri);
    for (const key of [...fs.entries.keys()]) {
      if (key === uri || key.startsWith(`${uri}/`)) fs.entries.delete(key);
    }
  };
  class Entry {
    uri: string;
    constructor(parent: { uri: string } | string, name?: string) {
      this.uri = typeof parent === 'string' ? parent : `${parent.uri}/${name}`;
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return fs.entries.has(this.uri);
    }
    delete() {
      remove(this.uri);
    }
  }
  class Directory extends Entry {
    create() {
      for (let i = this.uri.indexOf('/'); i !== -1; i = this.uri.indexOf('/', i + 1)) {
        if (i > 'cache:'.length) fs.entries.set(this.uri.slice(0, i), 'dir');
      }
      fs.entries.set(this.uri, 'dir');
    }
    list() {
      return [...fs.entries]
        .filter(([uri]) => uri.slice(0, uri.lastIndexOf('/')) === this.uri)
        .map(([uri, kind]) => (kind === 'dir' ? new Directory(uri) : new File(uri)));
    }
  }
  class File extends Entry {
    write() {
      fs.entries.set(this.uri, 'file');
      fs.written.push(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'cache:' } } };
});

const shareFile = vi.hoisted(() => vi.fn(async (_uri: string, _options?: object) => {}));
vi.mock('../share', () => ({
  shareFile,
  base64ToBytes: (b64: string) => new TextEncoder().encode(b64),
}));

import { receiveShare } from './receiveShare';

const message = (filename: string, mime = 'image/png') => ({
  type: 'SHARE_FILE' as const,
  filename,
  mime,
  data: 'aGVsbG8=',
  title: 'Grünerator Share',
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000_000);
  fs.entries.clear();
  fs.written.length = 0;
  fs.deleted.length = 0;
  shareFile.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('receiveShare', () => {
  it('keeps the file after the sheet resolves (Android reads it later)', async () => {
    await receiveShare(message('gruenerator-seite-1.png'));

    const [uri, options] = shareFile.mock.calls[0];
    expect(uri).toMatch(/^cache:\/webview-share\/1000000000-\d+\/gruenerator-seite-1\.png$/);
    expect(options).toMatchObject({ mimeType: 'image/png', dialogTitle: 'Grünerator Share' });
    expect(fs.deleted).toEqual([]);
    expect(fs.entries.has(uri)).toBe(true);
  });

  it("keeps page 1's file while page 2 is shared", async () => {
    await receiveShare(message('gruenerator-seite-1.png'));
    vi.advanceTimersByTime(2_000);
    await receiveShare(message('gruenerator-seite-2.png'));

    const [page1, page2] = fs.written;
    expect(page1).not.toBe(page2);
    expect(fs.deleted).toEqual([]);
    expect(fs.entries.has(page1)).toBe(true);
    expect(fs.entries.has(page2)).toBe(true);
  });

  it('gives shares in the same millisecond separate directories', async () => {
    await receiveShare(message('gruenerator.png'));
    await receiveShare(message('gruenerator.png'));

    expect(new Set(fs.written).size).toBe(2);
  });

  it('prunes share directories older than ten minutes and legacy loose files', async () => {
    await receiveShare(message('alt.png'));
    const [old] = fs.written;
    fs.entries.set('cache:/webview-share/legacy.png', 'file');
    vi.advanceTimersByTime(5 * 60_000);
    await receiveShare(message('mittel.png'));
    const [, recent] = fs.written;
    vi.advanceTimersByTime(6 * 60_000);
    await receiveShare(message('neu.png'));

    expect(fs.entries.has(old)).toBe(false);
    expect(fs.entries.has('cache:/webview-share/legacy.png')).toBe(false);
    expect(fs.entries.has(recent)).toBe(true);
    expect(fs.entries.has(fs.written[2])).toBe(true);
  });

  it('keeps the write inside its directory', async () => {
    await receiveShare(message('../../evil.png'));
    expect(fs.written[0]).toMatch(/^cache:\/webview-share\/[^/]+\/evil\.png$/);
  });
});
