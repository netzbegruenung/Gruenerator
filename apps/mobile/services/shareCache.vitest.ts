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

import { writeShareFile } from './shareCache';

const share = (name: string) => writeShareFile(new Uint8Array([1]), name).uri;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000_000);
  fs.entries.clear();
  fs.written.length = 0;
  fs.deleted.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('writeShareFile', () => {
  it('keeps the file after it is handed to the sheet (Android reads it later)', () => {
    const uri = share('gruenerator-seite-1.png');

    expect(uri).toMatch(/^cache:\/webview-share\/1000000000-\d+\/gruenerator-seite-1\.png$/);
    expect(fs.deleted).toEqual([]);
    expect(fs.entries.has(uri)).toBe(true);
  });

  it("keeps page 1's file while page 2 is shared", () => {
    const page1 = share('gruenerator-seite-1.png');
    vi.advanceTimersByTime(2_000);
    const page2 = share('gruenerator-seite-2.png');

    expect(page1).not.toBe(page2);
    expect(fs.deleted).toEqual([]);
    expect(fs.entries.has(page1)).toBe(true);
    expect(fs.entries.has(page2)).toBe(true);
  });

  it('gives shares in the same millisecond separate directories', () => {
    expect(share('gruenerator.png')).not.toBe(share('gruenerator.png'));
  });

  it('prunes share directories older than ten minutes and legacy loose files', () => {
    const old = share('alt.png');
    fs.entries.set('cache:/webview-share/legacy.png', 'file');
    vi.advanceTimersByTime(5 * 60_000);
    const recent = share('mittel.png');
    vi.advanceTimersByTime(6 * 60_000);
    const latest = share('neu.png');

    expect(fs.entries.has(old)).toBe(false);
    expect(fs.entries.has('cache:/webview-share/legacy.png')).toBe(false);
    expect(fs.entries.has(recent)).toBe(true);
    expect(fs.entries.has(latest)).toBe(true);
  });

  it('keeps the write inside its directory', () => {
    expect(share('../../evil.png')).toMatch(/^cache:\/webview-share\/[^/]+\/evil\.png$/);
  });
});
