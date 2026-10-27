/**
 * A collection becomes one Canva folder holding its stickers and backgrounds:
 * one folder, one upload and one move per asset, a failed asset reported
 * instead of aborting the rest, and nothing but what the viewer may see.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketplaceItem } from '@gruenerator/contracts';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const createFolder = vi.fn();
const createAssetUploadJob = vi.fn();
const getAssetUploadJob = vi.fn();
const moveFolderItem = vi.fn();
vi.mock('../../api-clients/canvaClient.js', () => ({
  createFolder: (...a: unknown[]) => createFolder(...a),
  createAssetUploadJob: (...a: unknown[]) => createAssetUploadJob(...a),
  getAssetUploadJob: (...a: unknown[]) => getAssetUploadJob(...a),
  moveFolderItem: (...a: unknown[]) => moveFolderItem(...a),
}));
vi.mock('./CanvaConnectionManager.js', () => ({
  CanvaConnectionManager: { getValidAccessToken: vi.fn(async () => 'token') },
}));

const resolveCollection = vi.fn();
vi.mock('../../marketplace/marketplaceService.js', () => ({
  resolveCollection: (...a: unknown[]) => resolveCollection(...a),
}));

vi.mock('../../sharedMediaService.js', () => ({
  getSharedMediaService: () => ({
    getShareByToken: async (token: string) =>
      token === 'missing' ? null : { media_type: 'image', file_path: `${token}.png` },
    getMediaFilePath: (p: string) => `/media/${p}`,
  }),
}));
vi.mock('node:fs', () => ({
  promises: { readFile: vi.fn(async (p: string) => Buffer.from(p)) },
}));

const { exportCollectionToCanva } = await import('./canvaStickerExport.js');

const ctx = { userId: 'user-1' } as Parameters<typeof exportCollectionToCanva>[0];

function asset(kind: 'sticker' | 'background', id: string): MarketplaceItem {
  return {
    kind,
    key: `${kind}:${id}`,
    ref: id,
    title: `Sticker ${id}`,
    asset: { src: `/api/share/${id}/download` },
  } as unknown as MarketplaceItem;
}

beforeEach(() => {
  vi.clearAllMocks();
  createFolder.mockResolvedValue({ id: 'F1', name: 'Queer und sichtbar' });
  createAssetUploadJob.mockImplementation(async (_t: string, p: { bytes: Buffer }) => ({
    id: `job-${p.bytes.toString()}`,
    status: 'success',
    asset: { id: `asset-${p.bytes.toString()}` },
  }));
  moveFolderItem.mockResolvedValue(undefined);
});

describe('exportCollectionToCanva', () => {
  it('puts every sticker and background of the collection into one new uploads folder', async () => {
    resolveCollection.mockResolvedValue({
      collectionId: 'queer',
      items: [
        asset('sticker', 'a'),
        { kind: 'agent', key: 'agent:x', ref: 'x', title: 'Agent' },
        asset('background', 'b'),
      ],
    });

    const outcome = await exportCollectionToCanva(ctx, 'queer');

    expect(outcome).toEqual({
      ok: true,
      value: { folderName: 'Queer und sichtbar', uploaded: 2, failed: [] },
    });
    expect(createFolder).toHaveBeenCalledOnce();
    expect(createFolder).toHaveBeenCalledWith('token', {
      name: 'Queer und sichtbar',
      parentFolderId: 'uploads',
    });
    expect(createAssetUploadJob).toHaveBeenCalledTimes(2);
    expect(moveFolderItem.mock.calls.map((c) => c[1])).toEqual(
      expect.arrayContaining([
        { itemId: 'asset-/media/a.png', toFolderId: 'F1' },
        { itemId: 'asset-/media/b.png', toFolderId: 'F1' },
      ])
    );
  });

  it('reports a failed asset and still exports the others', async () => {
    resolveCollection.mockResolvedValue({
      collectionId: 'queer',
      items: [asset('sticker', 'a'), asset('sticker', 'missing'), asset('sticker', 'c')],
    });

    const outcome = await exportCollectionToCanva(ctx, 'queer');

    expect(outcome).toEqual({
      ok: true,
      value: {
        folderName: 'Queer und sichtbar',
        uploaded: 2,
        failed: [{ ref: 'missing', title: 'Sticker missing' }],
      },
    });
  });

  it('waits for an upload job that is still running', async () => {
    vi.useFakeTimers();
    resolveCollection.mockResolvedValue({ collectionId: 'queer', items: [asset('sticker', 'a')] });
    createAssetUploadJob.mockResolvedValue({ id: 'job-1', status: 'in_progress' });
    getAssetUploadJob.mockResolvedValue({ id: 'job-1', status: 'success', asset: { id: 'A' } });

    const pending = exportCollectionToCanva(ctx, 'queer');
    await vi.runAllTimersAsync();
    const outcome = await pending;
    vi.useRealTimers();

    expect(getAssetUploadJob).toHaveBeenCalledWith('token', 'job-1');
    expect(moveFolderItem).toHaveBeenCalledWith('token', { itemId: 'A', toFolderId: 'F1' });
    expect(outcome.ok && outcome.value.uploaded).toBe(1);
  });

  it('creates no folder when the viewer sees no sticker in the collection', async () => {
    // resolveCollection already drops what the viewer may not see (other country, moderated).
    resolveCollection.mockResolvedValue({ collectionId: 'starter', items: [] });

    const outcome = await exportCollectionToCanva(ctx, 'starter');

    expect(outcome.ok).toBe(false);
    expect(createFolder).not.toHaveBeenCalled();
  });
});
