import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadUploadMap, reusableEntry, saveUploadMap } from './importParteitagHelpers.js';

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
