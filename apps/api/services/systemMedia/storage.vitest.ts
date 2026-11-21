import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalSystemMediaStorage } from './storage.js';

let dir: string;
let storage: LocalSystemMediaStorage;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sysmedia-'));
  storage = new LocalSystemMediaStorage(path.join(dir, 'root'));
});
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

async function source(name: string): Promise<string> {
  const p = path.join(dir, name);
  await fs.writeFile(p, Buffer.from(Array.from({ length: 100 }, (_, i) => i)));
  return p;
}

describe('LocalSystemMediaStorage', () => {
  it('put then stat returns size', async () => {
    await storage.putFromFile('a/b/video.mp4', await source('s1'));
    expect(await storage.stat('a/b/video.mp4')).toEqual({ size: 100 });
    expect(storage.resolveLocalPath('a/b/video.mp4')).toBe(path.join(dir, 'root/a/b/video.mp4'));
  });
  it('openRead with range returns exact bytes', async () => {
    await storage.putFromFile('r.bin', await source('s2'));
    const chunks: Buffer[] = [];
    for await (const c of storage.openRead('r.bin', { start: 10, end: 19 }))
      chunks.push(c as Buffer);
    expect([...Buffer.concat(chunks)]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });
  it('rejects key with ..', async () => {
    expect(() => storage.resolveLocalPath('a/../b')).toThrow();
    expect(() => storage.resolveLocalPath('/abs')).toThrow();
    expect(() => storage.resolveLocalPath('a//b')).toThrow();
    expect(() => storage.resolveLocalPath('A')).toThrow();
    await expect(storage.stat('../x')).rejects.toThrow();
  });
  it('remove makes stat return null', async () => {
    await storage.putFromFile('gone.bin', await source('s3'));
    await storage.remove('gone.bin');
    expect(await storage.stat('gone.bin')).toBeNull();
  });
});
