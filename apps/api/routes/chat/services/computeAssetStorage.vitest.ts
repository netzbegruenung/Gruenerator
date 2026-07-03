import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  computeAssetUrl,
  persistComputeAssets,
  resolveComputeAssetPath,
} from './computeAssetStorage.js';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'compute-assets-'));
  process.env.COMPUTE_ASSETS_BASE_DIR = tmpDir;
});

afterAll(() => {
  delete process.env.COMPUTE_ASSETS_BASE_DIR;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('persistComputeAssets', () => {
  it('moves base64 figures/files to disk and returns a slim URL payload', async () => {
    const png = Buffer.from('fake-png').toString('base64');
    const csv = Buffer.from('a,b\n1,2\n').toString('base64');
    const slim = await persistComputeAssets('user-1', {
      operation: 'Tabellen-Berechnung',
      entries: [{ label: 'Summe', value: '3' }],
      summary: 'Summe: 3',
      figures: [png],
      files: [{ name: 'export.csv', b64: csv }],
    });

    expect(slim.figures).toBeUndefined();
    expect(slim.files).toBeUndefined();
    expect(slim.figureUrls).toHaveLength(1);
    expect(slim.figureUrls![0]).toMatch(
      /^\/api\/chat-service\/compute-assets\/[0-9a-f-]{36}\.png$/
    );
    expect(slim.fileAssets).toEqual([
      { name: 'export.csv', url: expect.stringMatching(/\.csv$/) as string },
    ]);

    // Bytes round-trip through the userId-scoped path resolver.
    const figureFile = slim.figureUrls![0].split('/').pop()!;
    const figurePath = resolveComputeAssetPath('user-1', figureFile);
    expect(figurePath).not.toBeNull();
    expect(readFileSync(figurePath!).toString()).toBe('fake-png');
  });

  it('passes payloads without assets through untouched', async () => {
    const payload = { operation: 'x', entries: [{ label: 'a', value: '1' }], summary: 'a: 1' };
    expect(await persistComputeAssets('user-1', payload)).toBe(payload);
  });

  it('sanitizes hostile export file extensions', async () => {
    const slim = await persistComputeAssets('user-1', {
      operation: 'x',
      entries: [],
      summary: '',
      files: [{ name: '../../etc/passwd', b64: Buffer.from('x').toString('base64') }],
    });
    // Name is display-only; the stored file gets a uuid + safe extension.
    expect(slim.fileAssets![0].url).toMatch(/\/[0-9a-f-]{36}\.(bin|passwd)$/);
  });
});

describe('resolveComputeAssetPath', () => {
  it('rejects traversal and non-uuid file names', () => {
    expect(resolveComputeAssetPath('user-1', '../secret.png')).toBeNull();
    expect(resolveComputeAssetPath('user-1', 'foo.png')).toBeNull();
    expect(
      resolveComputeAssetPath('../user-2', '00000000-0000-0000-0000-000000000000.png')
    ).toBeNull();
    expect(resolveComputeAssetPath('user-1', '00000000-0000-0000-0000-000000000000.png')).toContain(
      path.join('user-1', '00000000-0000-0000-0000-000000000000.png')
    );
  });
});

describe('computeAssetUrl', () => {
  it('builds the authenticated route URL', () => {
    expect(computeAssetUrl('abc.png')).toBe('/api/chat-service/compute-assets/abc.png');
  });
});
