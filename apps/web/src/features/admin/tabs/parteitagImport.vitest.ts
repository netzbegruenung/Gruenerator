import { type ConventionManifest } from '@gruenerator/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/utils/apiClient', () => ({ default: { defaults: { baseURL: '/api' } } }));
vi.mock('@gruenerator/shared/api', () => ({ getContractsClient: vi.fn() }));
// The test manifest only carries file lists; schema validation is readManifest's own concern.
vi.mock('@gruenerator/contracts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gruenerator/contracts')>()),
  conventionManifestSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));

const { getContractsClient } = await import('@gruenerator/shared/api');
const { findManifest, planUploads, runParteitagImport } = await import('./parteitagImport');

const f = (name: string, sha256: string, sizeBytes: number) => ({ name, sha256, sizeBytes });

// Only the file lists matter to planning; the rest of the manifest is the server's concern.
const manifest = {
  report: f('report/bericht.pdf', 'r', 3),
  speeches: [
    { files: { reel: f('reels/a.mp4', 'a', 10), poster: f('posters/a.jpg', 'pa', 2) } },
    { files: { reel: f('reels/b.mp4', 'b', 20), poster: f('posters/b.jpg', 'pb', 2) } },
  ],
} as unknown as ConventionManifest;

const file = (size: number) => new File([new Uint8Array(size)], 'x');
// The picked paths are decomposed (NFD, as macOS may hand them over), the manifest path in
// the tests is composed (NFC): matching must not depend on the form.
const root = 'gr\u00fcnerator-export';
const pick = (path: string, size: number) => ({
  path: `${root.normalize('NFD')}/${path}`,
  file: file(size),
});

const all = [
  pick('manifest.json', 1),
  pick('reels/a.mp4', 10),
  pick('reels/b.mp4', 20),
  pick('posters/a.jpg', 2),
  pick('posters/b.jpg', 2),
  pick('report/bericht.pdf', 3),
];

describe('findManifest', () => {
  it('takes the shallowest manifest.json', () => {
    const nested = { path: `${root}/alt/manifest.json`, file: file(1) };
    expect(findManifest([nested, ...all])?.path).toBe(all[0]!.path);
  });

  it('returns null without one', () => {
    expect(findManifest(all.slice(1))).toBeNull();
  });
});

describe('planUploads', () => {
  it('skips files the server already has and pairs the rest with the picked files', () => {
    const plan = planUploads(manifest, `${root}/manifest.json`, all, { a: 'k/a', pa: 'k/pa' });
    expect(plan.todo.map((t) => t.entry.name)).toEqual([
      'reels/b.mp4',
      'posters/b.jpg',
      'report/bericht.pdf',
    ]);
    expect(plan.skipped).toBe(2);
  });

  it('names missing and wrongly sized files before anything is uploaded', () => {
    const broken = all
      .filter((s) => !s.path.endsWith('b.jpg'))
      .map((s) => (s.path.endsWith('a.mp4') ? pick('reels/a.mp4', 9) : s));
    expect(() => planUploads(manifest, `${root}/manifest.json`, broken, {})).toThrow(
      /reels\/a\.mp4 hat eine andere Größe, posters\/b\.jpg fehlt/
    );
  });

  it('does not ask for files the server has even when they are not picked', () => {
    const stored = { a: '', pa: '', b: '', pb: '', r: '' };
    const plan = planUploads(manifest, 'manifest.json', [all[0]!], stored);
    expect(plan.todo).toEqual([]);
  });
});

describe('runParteitagImport', () => {
  it('stops waiting for a hanging import as soon as the run is cancelled', async () => {
    const stored = { a: 'k/a', pa: 'k/pa', b: 'k/b', pb: 'k/pb', r: 'k/r' };
    vi.mocked(getContractsClient).mockReturnValue({
      parteitageAdmin: {
        fileHashes: () => Promise.resolve({ status: 200, body: stored }),
        import: () => new Promise(() => {}),
      },
    } as unknown as ReturnType<typeof getContractsClient>);
    const manifestFile = {
      path: `${root}/manifest.json`,
      file: new File([JSON.stringify({ ...manifest, key: 'k' })], 'manifest.json'),
    };
    const controller = new AbortController();
    const run = runParteitagImport({
      selected: [manifestFile, ...all.slice(1)],
      password: null,
      onProgress: (p) => {
        if (p.phase === 'importing') controller.abort();
      },
      signal: controller.signal,
    });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });
});
