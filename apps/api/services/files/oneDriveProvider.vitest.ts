import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { CloudPathError } from '../../utils/validation/cloudPaths.js';

import { CloudAccessError } from './driveErrors.js';
import { OneDriveProvider, type OneDriveDeps } from './oneDriveProvider.js';

import type { MicrosoftDriveItem } from '../api-clients/microsoftGraphClient.js';
import type { CloudRoot } from './types.js';

/** Ein axios-Fehler mit Status (und optionalem Google-`reason`). */
function axiosError(status: number, reason?: string): AxiosError {
  const err = new AxiosError('boom');
  err.response = {
    status,
    statusText: '',
    headers: {},
    config: {} as never,
    data: reason ? { error: { errors: [{ reason }] } } : {},
  };
  return err;
}

const ROOT: CloudRoot = {
  connectionId: 'nango-1',
  providerId: 'onedrive',
  label: 'OneDrive',
  host: 'onedrive.live.com',
  origin: 'own',
  isActive: true,
  secret: 'user-1',
};

function file(name: string, over: Partial<MicrosoftDriveItem> = {}): MicrosoftDriveItem {
  return {
    id: `id-${name}`,
    name,
    size: 1000,
    lastModifiedDateTime: '2026-01-02T03:04:05Z',
    file: { mimeType: 'application/pdf' },
    ...over,
  };
}
const folder = (name: string): MicrosoftDriveItem => ({
  id: `id-${name}`,
  name,
  size: 0,
  lastModifiedDateTime: '2026-01-02T03:04:05Z',
  folder: { childCount: 1 },
});

function make(over: Partial<OneDriveDeps> = {}) {
  const deps: OneDriveDeps = {
    connectionIdOf: async () => 'nango-1',
    token: async () => 'tok',
    listAtPath: vi.fn(async () => ({ items: [], nextLink: null })),
    getByPath: vi.fn(async () => file('a.pdf')),
    search: vi.fn(async () => ({ items: [], nextLink: null })),
    download: vi.fn(async () => Buffer.from('pdf')),
    ...over,
  };
  return { provider: new OneDriveProvider(deps), deps };
}

describe('OneDriveProvider.listRoots', () => {
  it('returns one own root per connected account, carrying only the user id as secret', async () => {
    const { provider } = make();
    const roots = await provider.listRoots('user-1');
    expect(roots).toEqual([ROOT]);
  });

  it('returns nothing when no Microsoft account is connected', async () => {
    const { provider } = make({ connectionIdOf: async () => null });
    expect(await provider.listRoots('user-1')).toEqual([]);
  });
});

describe('OneDriveProvider.list', () => {
  it('lists a folder with joined paths, folders first', async () => {
    const listAtPath = vi.fn(async () => ({
      items: [file('b.pdf'), folder('Zeta'), file('a.docx', { file: { mimeType: 'x' } })],
      nextLink: null,
    }));
    const { provider } = make({ listAtPath });
    const listing = await provider.list(ROOT, 'Berichte/2026');
    expect(listAtPath).toHaveBeenCalledWith('tok', 'Berichte/2026');
    expect(listing.entries.map((e) => e.path)).toEqual([
      'Berichte/2026/Zeta',
      'Berichte/2026/a.docx',
      'Berichte/2026/b.pdf',
    ]);
    expect(listing.folderCount).toBe(1);
    expect(listing.entries[0].isDirectory).toBe(true);
  });

  it('marks a list the page cap cut short as truncated', async () => {
    const { provider } = make({
      listAtPath: async () => ({ items: [file('a.pdf')], nextLink: 'https://next' }),
    });
    expect((await provider.list(ROOT, '')).truncated).toBe(true);
  });

  it('walks recursively and honours the depth cap', async () => {
    const listAtPath = vi.fn(async (_t: string, path: string) => {
      if (path === '') return { items: [folder('A'), file('root.pdf')], nextLink: null };
      if (path === 'A') return { items: [folder('B'), file('a.pdf')], nextLink: null };
      return { items: [file('deep.pdf')], nextLink: null };
    });
    const { provider } = make({ listAtPath });
    const listing = await provider.list(ROOT, '', { recursive: true, maxDepth: 1 });
    expect(listing.entries.map((e) => e.path).sort()).toEqual(['A/a.pdf', 'root.pdf']);
    expect(listing.depthLimited).toBe(true);
    expect(listing.folderCount).toBe(2);
  });

  it('honours the file cap', async () => {
    const { provider } = make({
      listAtPath: async () => ({
        items: [file('1.pdf'), file('2.pdf'), file('3.pdf')],
        nextLink: null,
      }),
    });
    const listing = await provider.list(ROOT, '', { recursive: true, maxFiles: 2 });
    expect(listing.entries).toHaveLength(2);
    expect(listing.truncated).toBe(true);
  });

  it('refuses a path that leaves the drive root', async () => {
    const { provider, deps } = make();
    await expect(provider.list(ROOT, '../../etc')).rejects.toBeInstanceOf(CloudPathError);
    expect(deps.listAtPath).not.toHaveBeenCalled();
  });
});

describe('OneDriveProvider.find', () => {
  it('uses drive search for a name and rebuilds paths from parentReference', async () => {
    const search = vi.fn(async () => ({
      items: [
        file('Haushalt 2026.pdf', {
          parentReference: { path: '/drive/root:/Finanzen/Ber%C3%ADchte' },
        }),
        file('Haushalt-Inhalt.docx', { parentReference: { path: '/drive/root:' } }),
        file('Fremd.pdf', { parentReference: { path: '/drives/x/items/y:/Foo' } }),
        // Treffer im Inhalt, nicht im Namen — fliegt raus
        file('Protokoll.pdf', { parentReference: { path: '/drive/root:' } }),
      ],
      nextLink: null,
    }));
    const { provider } = make({ search });
    const listing = await provider.find(ROOT, { name: 'Haushalt' });
    expect(search).toHaveBeenCalledWith('tok', 'Haushalt');
    expect(listing.entries.map((e) => e.path)).toEqual([
      'Finanzen/Beríchte/Haushalt 2026.pdf',
      'Haushalt-Inhalt.docx',
    ]);
  });

  it('filters by extension on top of a name', async () => {
    const { provider } = make({
      search: async () => ({
        items: [
          file('Haushalt.pdf', { parentReference: { path: '/drive/root:' } }),
          file('Haushalt.docx', { parentReference: { path: '/drive/root:' } }),
        ],
        nextLink: null,
      }),
    });
    const listing = await provider.find(ROOT, { name: 'Haushalt', extensions: ['pdf'] });
    expect(listing.entries.map((e) => e.name)).toEqual(['Haushalt.pdf']);
  });

  it('falls back to a folder walk when only extensions are given', async () => {
    const search = vi.fn();
    const { provider } = make({
      search,
      listAtPath: async () => ({ items: [file('a.pdf'), file('b.docx')], nextLink: null }),
    });
    const listing = await provider.find(ROOT, { extensions: ['.pdf'] });
    expect(search).not.toHaveBeenCalled();
    expect(listing.entries.map((e) => e.name)).toEqual(['a.pdf']);
  });
});

describe('OneDriveProvider.read', () => {
  it('downloads a PDF natively', async () => {
    const { provider, deps } = make();
    const result = await provider.read(ROOT, 'a.pdf');
    expect(deps.download).toHaveBeenCalledWith('tok', 'id-a.pdf', { asPdf: false });
    expect(result).toMatchObject({ mimeType: 'application/pdf', name: 'a.pdf' });
  });

  it('asks Graph for a PDF conversion for spreadsheets', async () => {
    const { provider, deps } = make({
      getByPath: async () =>
        file('Zahlen.xlsx', { file: { mimeType: 'application/vnd.ms-excel' } }),
    });
    const result = await provider.read(ROOT, 'Zahlen.xlsx');
    expect(deps.download).toHaveBeenCalledWith('tok', 'id-Zahlen.xlsx', { asPdf: true });
    expect(result).toMatchObject({ mimeType: 'application/pdf', name: 'Zahlen.xlsx.pdf' });
  });

  it('refuses folders and oversized files', async () => {
    const folderCase = make({ getByPath: async () => folder('X') });
    await expect(folderCase.provider.read(ROOT, 'X')).rejects.toMatchObject({
      kind: 'unsupported',
    });
    const big = make({ getByPath: async () => file('big.pdf', { size: 30 * 1024 * 1024 }) });
    await expect(big.provider.read(ROOT, 'big.pdf')).rejects.toMatchObject({ kind: 'too_large' });
    expect(big.deps.download).not.toHaveBeenCalled();
  });

  it('requires a file path', async () => {
    await expect(make().provider.read(ROOT, '')).rejects.toBeInstanceOf(CloudPathError);
  });
});

describe('error mapping', () => {
  const failing = (status: number) =>
    make({
      listAtPath: async () => {
        throw axiosError(status);
      },
    });

  it.each([
    [401, 'reauth'],
    [403, 'reauth'],
    [404, 'not_found'],
    [429, 'rate_limit'],
    [500, 'unavailable'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const { provider } = failing(status);
    await expect(provider.list(ROOT, '')).rejects.toMatchObject({ kind });
  });

  it('never leaks the token or the raw error', async () => {
    const { provider } = failing(401);
    const err = await provider.list(ROOT, '').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudAccessError);
    expect((err as Error).message).not.toMatch(/Bearer|tok|401/);
    expect((err as Error).message).toContain('neu verbinden');
  });

  it('treats a failing token lookup as reconnect', async () => {
    const { provider } = make({
      token: async () => {
        throw new CloudAccessError('reauth', 'neu verbinden');
      },
    });
    await expect(provider.list(ROOT, '')).rejects.toMatchObject({ kind: 'reauth' });
  });
});

describe('OneDriveProvider.test', () => {
  it('reports the root entry count', async () => {
    const { provider } = make({
      listAtPath: async () => ({ items: [file('a.pdf')], nextLink: null }),
    });
    expect(await provider.test(ROOT)).toEqual({ ok: true, entryCount: 1 });
  });

  it('reports forbidden for an expired connection and rejects raw links', async () => {
    const { provider } = make({
      listAtPath: async () => {
        throw axiosError(401);
      },
    });
    expect(await provider.test(ROOT)).toEqual({ ok: false, errorCode: 'forbidden' });
    expect(await provider.test({ link: 'https://x' })).toEqual({
      ok: false,
      errorCode: 'invalid_link',
    });
  });
});

describe('read-only guarantee', () => {
  it('has no write methods', () => {
    const { provider } = make();
    for (const name of ['write', 'delete', 'mkdir', 'upload', 'put', 'move']) {
      expect(name in provider).toBe(false);
    }
  });
});
