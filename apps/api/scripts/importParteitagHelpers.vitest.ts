import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  isStillRunning,
  loadUploadMap,
  reusableEntry,
  saveUploadMap,
  waitForHashes,
} from './importParteitagHelpers.js';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const entry = { sha256: 'a'.repeat(64), size: 10, uploadId: 'u1', uploadUrl: 'https://x/u1' };

describe('upload map', () => {
  it('round-trips through a file and tolerates a missing or broken one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ptmap-'));
    dirs.push(dir);
    const path = join(dir, 'uploads.json');
    expect(loadUploadMap(path)).toEqual({});
    saveUploadMap(path, { 'a.mp4': entry });
    expect(loadUploadMap(path)).toEqual({ 'a.mp4': entry });
  });

  it('reuses an entry only for the same content', () => {
    const map = { 'a.mp4': entry };
    expect(reusableEntry(map, 'a.mp4', { sha256: entry.sha256, size: 10 })).toEqual(entry);
    expect(reusableEntry(map, 'a.mp4', { sha256: 'b'.repeat(64), size: 10 })).toBeNull();
    expect(reusableEntry(map, 'a.mp4', { sha256: entry.sha256, size: 11 })).toBeNull();
    expect(reusableEntry(map, 'other.mp4', { sha256: entry.sha256, size: 10 })).toBeNull();
  });
});

describe('isStillRunning', () => {
  it.each([0, 502, 503, 504])('%s is transient', (s) => expect(isStillRunning(s)).toBe(true));
  it.each([200, 400, 403, 500])('%s is not', (s) => expect(isStillRunning(s)).toBe(false));
});

describe('waitForHashes', () => {
  it('polls until all hashes are stored', async () => {
    const fetchHashes = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce({ a: 'k/a' })
      .mockResolvedValueOnce({ a: 'k/a', b: 'k/b' });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const ok = await waitForHashes({
      wanted: ['a', 'b'],
      fetchHashes,
      sleep,
      intervalMs: 5,
      maxAttempts: 10,
    });
    expect(ok).toBe(true);
    expect(fetchHashes).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts', async () => {
    const ok = await waitForHashes({
      wanted: ['a'],
      fetchHashes: async () => ({}),
      sleep: async () => undefined,
      intervalMs: 1,
      maxAttempts: 3,
    });
    expect(ok).toBe(false);
  });
});
