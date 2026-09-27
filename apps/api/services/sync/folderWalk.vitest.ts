import { describe, expect, it, vi } from 'vitest';

import { folderPathFromHref, walkWolkeFolder } from './folderWalk.js';

import type { NextcloudFile } from '../api-clients/nextcloudApiClient.js';

const PREFIX = '/public.php/webdav';

function dir(path: string): NextcloudFile {
  const name = path.split('/').filter(Boolean).pop() ?? '';
  return {
    href: `${PREFIX}/${path.split('/').map(encodeURIComponent).join('/')}/`,
    name,
    size: 0,
    lastModified: null,
    etag: null,
    isDirectory: true,
  };
}

function doc(path: string): NextcloudFile {
  const name = path.split('/').filter(Boolean).pop() ?? '';
  return {
    href: `${PREFIX}/${path.split('/').map(encodeURIComponent).join('/')}`,
    name,
    size: 1024,
    lastModified: null,
    etag: `etag-${path}`,
    isDirectory: false,
  };
}

/**
 * Fake share. Every listing echoes the folder itself back as its first entry,
 * exactly like a real PROPFIND does — that self-entry is what made a naive
 * walk loop forever.
 */
function fakeShare(tree: Record<string, NextcloudFile[]>) {
  return vi.fn(async (folderPath: string) => {
    const selfEntry = folderPath ? [dir(folderPath)] : [];
    return [...selfEntry, ...(tree[folderPath] ?? [])];
  });
}

describe('folderPathFromHref', () => {
  it('strips the webdav prefix and the trailing slash', () => {
    expect(folderPathFromHref(`${PREFIX}/Stadtrat/`)).toBe('Stadtrat');
  });

  it('decodes percent escapes so the path can be re-encoded for the next request', () => {
    expect(folderPathFromHref(`${PREFIX}/W%C3%A4rmeplanung%202026/`)).toBe('Wärmeplanung 2026');
  });

  it('maps the share root to an empty path', () => {
    expect(folderPathFromHref(`${PREFIX}/`)).toBe('');
  });

  it('survives a malformed escape instead of throwing mid-walk', () => {
    expect(folderPathFromHref(`${PREFIX}/100%/`)).toBe('100%');
  });
});

describe('walkWolkeFolder', () => {
  it('returns files from the root and every subfolder', async () => {
    const listFolder = fakeShare({
      '': [doc('a.pdf'), dir('Stadtrat')],
      Stadtrat: [doc('Stadtrat/protokoll.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, '');

    expect(result.files.map((f) => f.name)).toEqual(['a.pdf', 'protokoll.pdf']);
    expect(result.folderCount).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.depthLimited).toBe(false);
  });

  it('never recurses into the self-entry a PROPFIND echoes back', async () => {
    const listFolder = fakeShare({
      '': [dir('Stadtrat')],
      Stadtrat: [doc('Stadtrat/protokoll.pdf')],
    });

    await walkWolkeFolder(listFolder, '');

    // Once for the root, once for Stadtrat — not once more for Stadtrat's echo.
    expect(listFolder).toHaveBeenCalledTimes(2);
  });

  it('stops at maxDepth and says so', async () => {
    const listFolder = fakeShare({
      '': [dir('a')],
      a: [dir('a/b')],
      'a/b': [dir('a/b/c')],
      'a/b/c': [doc('a/b/c/deep.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, '', { maxDepth: 2 });

    expect(result.files).toHaveLength(0);
    expect(result.depthLimited).toBe(true);
    // The folder at the cut-off is counted but not opened.
    expect(result.folderCount).toBe(3);
  });

  it('descends exactly maxDepth levels below the root', async () => {
    const listFolder = fakeShare({
      '': [dir('a')],
      a: [dir('a/b')],
      'a/b': [dir('a/b/c')],
      'a/b/c': [doc('a/b/c/deep.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, '', { maxDepth: 3 });

    expect(result.files.map((f) => f.name)).toEqual(['deep.pdf']);
    expect(result.depthLimited).toBe(false);
  });

  it('caps the file count and reports the truncation', async () => {
    const listFolder = fakeShare({
      '': [doc('1.pdf'), doc('2.pdf'), doc('3.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, '', { maxFiles: 2 });

    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('stops opening folders once the file cap is reached', async () => {
    const listFolder = fakeShare({
      '': [dir('a'), dir('b'), dir('c'), doc('1.pdf'), doc('2.pdf'), doc('3.pdf')],
      a: [doc('a/x.pdf')],
      b: [doc('b/x.pdf')],
      c: [doc('c/x.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, '', { maxFiles: 2 });

    expect(result.truncated).toBe(true);
    // Only the root listing — the cap bounds requests, not just results.
    expect(listFolder).toHaveBeenCalledTimes(1);
  });

  it('walks a subfolder as its root without leaking the parent', async () => {
    const listFolder = fakeShare({
      '': [doc('root.pdf'), dir('Stadtrat')],
      Stadtrat: [doc('Stadtrat/protokoll.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, 'Stadtrat');

    expect(result.files.map((f) => f.name)).toEqual(['protokoll.pdf']);
    expect(result.folderCount).toBe(0);
  });

  it('does not list the same file twice when two folders share an href', async () => {
    const listFolder = fakeShare({
      '': [doc('same.pdf'), dir('x')],
      x: [doc('same.pdf')],
    });

    const result = await walkWolkeFolder(listFolder, '');

    expect(result.files).toHaveLength(1);
  });
});
