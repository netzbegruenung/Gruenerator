import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({
  dirs: new Map<string, { exists: boolean }>(),
  written: [] as string[],
  deleted: [] as string[],
  dirOps: [] as string[],
}));

vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    get exists() {
      return fs.dirs.get(this.uri)?.exists ?? false;
    }
    delete() {
      fs.dirOps.push(`delete ${this.uri}`);
      fs.dirs.set(this.uri, { exists: false });
    }
    create() {
      fs.dirOps.push(`create ${this.uri}`);
      fs.dirs.set(this.uri, { exists: true });
    }
  }
  class File {
    uri: string;
    constructor(parent: { uri: string }, name: string) {
      this.uri = `${parent.uri}/${name}`;
    }
    write() {
      fs.written.push(this.uri);
    }
    delete() {
      fs.deleted.push(this.uri);
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'cache:' } } };
});

const shareFile = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../share', () => ({
  shareFile,
  base64ToBytes: (b64: string) => new TextEncoder().encode(b64),
}));

import { receiveShare } from './receiveShare';

const message = (filename: string) => ({
  type: 'SHARE_FILE' as const,
  filename,
  mime: 'image/png',
  data: 'aGVsbG8=',
  title: 'Grünerator Share',
});

beforeEach(() => {
  fs.dirs.clear();
  fs.written.length = 0;
  fs.deleted.length = 0;
  fs.dirOps.length = 0;
  shareFile.mockClear();
});

describe('receiveShare', () => {
  it('keeps the file after the sheet resolves (Android reads it later)', async () => {
    await receiveShare(message('gruenerator-seite-1.png'));

    expect(shareFile).toHaveBeenCalledWith('cache:/webview-share/gruenerator-seite-1.png', {
      mimeType: 'image/png',
      dialogTitle: 'Grünerator Share',
    });
    expect(fs.deleted).toEqual([]);
    expect(fs.dirOps).toEqual(['create cache:/webview-share']);
  });

  it('clears the previous share before writing the next, so files do not pile up', async () => {
    await receiveShare(message('gruenerator-seite-1.png'));
    await receiveShare(message('gruenerator-seite-2.png'));

    expect(fs.dirOps).toEqual([
      'create cache:/webview-share',
      'delete cache:/webview-share',
      'create cache:/webview-share',
    ]);
    expect(fs.written).toEqual([
      'cache:/webview-share/gruenerator-seite-1.png',
      'cache:/webview-share/gruenerator-seite-2.png',
    ]);
  });

  it('keeps the write inside its directory', async () => {
    await receiveShare(message('../../evil.png'));
    expect(fs.written).toEqual(['cache:/webview-share/evil.png']);
  });
});
