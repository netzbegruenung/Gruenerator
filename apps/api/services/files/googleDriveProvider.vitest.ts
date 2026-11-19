import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';

import { CloudPathError } from '../../utils/validation/cloudPaths.js';

import { CloudAccessError } from './driveErrors.js';
import {
  GOOGLE_PICKER_NOTE,
  GoogleDriveProvider,
  type GoogleDriveDeps,
} from './googleDriveProvider.js';

import type { GoogleDriveFile } from '../api-clients/googleDriveClient.js';
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
  connectionId: 'nango-g',
  providerId: 'google-drive',
  label: 'Google Drive',
  host: 'drive.google.com',
  origin: 'own',
  isActive: true,
  secret: 'user-1',
};

function gfile(id: string, name: string, over: Partial<GoogleDriveFile> = {}): GoogleDriveFile {
  return {
    id,
    name,
    mimeType: 'application/pdf',
    size: '2048',
    modifiedTime: '2026-01-02T03:04:05Z',
    ...over,
  };
}

function make(over: Partial<GoogleDriveDeps> = {}) {
  const deps: GoogleDriveDeps = {
    connectionIdOf: async () => 'nango-g',
    token: async () => 'tok',
    listFiles: vi.fn(async () => ({ files: [], nextPageToken: null })),
    getFile: vi.fn(async () => gfile('f1', 'Bericht.pdf')),
    downloadFile: vi.fn(async () => Buffer.from('pdf')),
    exportFile: vi.fn(async () => 'Text'),
    ...over,
  };
  return { provider: new GoogleDriveProvider(deps), deps };
}

describe('GoogleDriveProvider.listRoots', () => {
  it('returns one own root per connected Google account', async () => {
    expect(await make().provider.listRoots('user-1')).toEqual([ROOT]);
  });

  it('returns nothing when no Google account is connected', async () => {
    const { provider } = make({ connectionIdOf: async () => null });
    expect(await provider.listRoots('user-1')).toEqual([]);
  });
});

describe('GoogleDriveProvider.list', () => {
  it('lists the accessible files flat, with the Drive id as path', async () => {
    const { provider } = make({
      listFiles: async () => ({
        files: [
          gfile('f1', 'Bericht.pdf'),
          gfile('d1', 'Notiz', { mimeType: 'application/vnd.google-apps.document', size: null }),
        ],
        nextPageToken: null,
      }),
    });
    const listing = await provider.list(ROOT, '');
    expect(listing.entries.map((e) => [e.path, e.name, e.isSupported])).toEqual([
      ['f1', 'Bericht.pdf', true],
      ['d1', 'Notiz', true],
    ]);
    expect(listing.entries[1].size).toBeNull();
  });

  it('says plainly that only picked files are visible, also when the list is empty', async () => {
    const listing = await make().provider.list(ROOT, '');
    expect(listing.entries).toEqual([]);
    expect(listing.note).toBe(GOOGLE_PICKER_NOTE);
    expect(listing.note).toContain('Dateiwähler');
    expect(listing.note).toContain('nicht das ganze Drive');
  });

  it('marks a capped list as truncated', async () => {
    const { provider } = make({
      listFiles: async () => ({ files: [gfile('f1', 'a.pdf')], nextPageToken: 'more' }),
    });
    expect((await provider.list(ROOT, '')).truncated).toBe(true);
  });

  it('has no folders: a non-empty path is not found', async () => {
    await expect(make().provider.list(ROOT, 'Ordner')).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('GoogleDriveProvider.find', () => {
  it('passes the name to Drive and filters extensions locally', async () => {
    const listFiles = vi.fn(async () => ({
      files: [gfile('f1', 'Haushalt.pdf'), gfile('f2', 'Haushalt.docx')],
      nextPageToken: null,
    }));
    const { provider } = make({ listFiles });
    const listing = await provider.find(ROOT, { name: 'Haushalt', extensions: ['pdf'] });
    expect(listFiles).toHaveBeenCalledWith('tok', { nameContains: 'Haushalt' });
    expect(listing.entries.map((e) => e.path)).toEqual(['f1']);
    expect(listing.note).toBe(GOOGLE_PICKER_NOTE);
  });
});

describe('GoogleDriveProvider.read', () => {
  it('downloads a regular file', async () => {
    const { provider, deps } = make();
    const result = await provider.read(ROOT, 'f1');
    expect(deps.downloadFile).toHaveBeenCalledWith('tok', 'f1');
    expect(result).toMatchObject({ mimeType: 'application/pdf', name: 'Bericht.pdf' });
  });

  it.each([
    ['application/vnd.google-apps.document', 'text/plain'],
    ['application/vnd.google-apps.presentation', 'text/plain'],
    ['application/vnd.google-apps.spreadsheet', 'text/csv'],
  ])('exports %s as %s', async (mimeType, exportMime) => {
    const { provider, deps } = make({
      getFile: async () => gfile('d1', 'Notiz', { mimeType, size: null }),
    });
    const result = await provider.read(ROOT, 'd1');
    expect(deps.exportFile).toHaveBeenCalledWith('tok', 'd1', exportMime);
    expect(deps.downloadFile).not.toHaveBeenCalled();
    expect(result).toMatchObject({ mimeType: exportMime, name: 'Notiz' });
    expect(result.buffer.toString()).toBe('Text');
  });

  it('refuses non-exportable Google formats, folders, ids that are no ids, and big files', async () => {
    const form = make({
      getFile: async () => gfile('x', 'F', { mimeType: 'application/vnd.google-apps.form' }),
    });
    await expect(form.provider.read(ROOT, 'x')).rejects.toMatchObject({ kind: 'unsupported' });

    const dir = make({
      getFile: async () => gfile('x', 'D', { mimeType: 'application/vnd.google-apps.folder' }),
    });
    await expect(dir.provider.read(ROOT, 'x')).rejects.toMatchObject({ kind: 'not_found' });

    const bad = make();
    await expect(bad.provider.read(ROOT, 'a b.pdf')).rejects.toMatchObject({ kind: 'not_found' });
    expect(bad.deps.getFile).not.toHaveBeenCalled();

    const big = make({ getFile: async () => gfile('x', 'B', { size: String(30 * 1024 * 1024) }) });
    await expect(big.provider.read(ROOT, 'x')).rejects.toMatchObject({ kind: 'too_large' });
    expect(big.deps.downloadFile).not.toHaveBeenCalled();
  });

  it('requires a path', async () => {
    await expect(make().provider.read(ROOT, '')).rejects.toBeInstanceOf(CloudPathError);
  });
});

describe('error mapping', () => {
  const failing = (status: number, reason?: string) =>
    make({
      listFiles: async () => {
        throw axiosError(status, reason);
      },
    });

  it.each([
    [401, undefined, 'reauth'],
    [403, undefined, 'reauth'],
    [403, 'rateLimitExceeded', 'rate_limit'],
    [403, 'exportSizeLimitExceeded', 'too_large'],
    [404, undefined, 'not_found'],
    [429, undefined, 'rate_limit'],
    [503, undefined, 'unavailable'],
  ])('maps HTTP %i (%s) to %s', async (status, reason, kind) => {
    await expect(failing(status, reason).provider.list(ROOT, '')).rejects.toMatchObject({ kind });
  });

  it('never leaks the raw error', async () => {
    const err = await failing(401)
      .provider.list(ROOT, '')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CloudAccessError);
    expect((err as Error).message).not.toMatch(/Bearer|boom|401/);
  });
});

describe('GoogleDriveProvider.test', () => {
  it('counts the accessible files; zero is still ok', async () => {
    expect(await make().provider.test(ROOT)).toEqual({ ok: true, entryCount: 0 });
  });

  it('reports forbidden when access was revoked', async () => {
    expect(await failing401().provider.test(ROOT)).toEqual({ ok: false, errorCode: 'forbidden' });
    expect(await make().provider.test({ link: 'https://x' })).toEqual({
      ok: false,
      errorCode: 'invalid_link',
    });
  });
});

function failing401() {
  return make({
    listFiles: async () => {
      throw axiosError(401);
    },
  });
}

describe('read-only guarantee', () => {
  it('has no write methods', () => {
    const { provider } = make();
    for (const name of ['write', 'delete', 'mkdir', 'upload', 'put', 'move']) {
      expect(name in provider).toBe(false);
    }
  });
});
