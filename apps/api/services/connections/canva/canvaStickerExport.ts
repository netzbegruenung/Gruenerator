/**
 * A Marktplatz collection as a Canva sticker package: its stickers and
 * backgrounds, uploaded into one new folder named after the collection in the
 * user's Canva uploads.
 *
 * The package is the collection itself — no table of its own. What a viewer
 * gets is what the collection page shows them (`resolveCollection`: their
 * country, live and unmoderated assets only), so the export can never carry a
 * sticker the viewer could not open in the Marktplatz.
 *
 * The bytes are read from disk, not fetched back over HTTP: no request to
 * ourselves, nothing an asset URL could redirect.
 */
import { promises as fs } from 'node:fs';

import {
  type CanvaCollectionExportResponse,
  type MarketplaceCollectionId,
  type MarketplaceItem,
} from '@gruenerator/contracts';
import { collectionById } from '@gruenerator/shared/marketplace/frontpage';

import { createLogger } from '../../../utils/logger.js';
import {
  createAssetUploadJob,
  createFolder,
  getAssetUploadJob,
  moveFolderItem,
} from '../../api-clients/canvaClient.js';
import { type MarketplaceContext } from '../../marketplace/context.js';
import { resolveCollection } from '../../marketplace/marketplaceService.js';
import { getSharedMediaService } from '../../sharedMediaService.js';

import { CanvaConnectionManager } from './CanvaConnectionManager.js';

const log = createLogger('canva-sticker-export');

/** Canva allows 30 upload jobs per minute and user; two at a time stays well below. */
const UPLOAD_CONCURRENCY = 2;
const POLL_DELAYS_MS = [500, 1000, 1500, 2000, 3000, 5000, 5000, 5000];

type AssetItem = Extract<MarketplaceItem, { kind: 'sticker' | 'background' }>;

const isAssetItem = (item: MarketplaceItem): item is AssetItem =>
  item.kind === 'sticker' || item.kind === 'background';

/** Every studio asset is served as `/api/share/<token>/download` (studioAssetsService). */
const SHARE_SRC = /^\/api\/share\/([A-Za-z0-9_-]+)\/download$/;

async function readAssetBytes(item: AssetItem): Promise<Buffer> {
  const token = SHARE_SRC.exec(item.asset.src)?.[1];
  if (!token) throw new Error(`unexpected asset src for ${item.ref}`);
  const media = getSharedMediaService();
  const share = await media.getShareByToken(token);
  const filePath = share?.media_type === 'image' ? media.getMediaFilePath(share.file_path) : null;
  if (!filePath) throw new Error(`no image file for ${item.ref}`);
  return fs.readFile(filePath);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Upload one asset and wait for Canva to accept it; returns the Canva asset id. */
async function uploadOne(accessToken: string, item: AssetItem): Promise<string> {
  const bytes = await readAssetBytes(item);
  let job = await createAssetUploadJob(accessToken, { bytes, name: item.title });
  for (const delay of POLL_DELAYS_MS) {
    if (job.status !== 'in_progress') break;
    await sleep(delay);
    job = await getAssetUploadJob(accessToken, job.id);
  }
  if (job.status === 'success' && job.asset) return job.asset.id;
  throw new Error(job.error?.message ?? `upload job ${job.id} ended as ${job.status}`);
}

export type CollectionExportOutcome =
  { ok: true; value: CanvaCollectionExportResponse } | { ok: false; status: 404; message: string };

export async function exportCollectionToCanva(
  ctx: MarketplaceContext,
  collectionId: MarketplaceCollectionId
): Promise<CollectionExportOutcome> {
  const def = collectionById(collectionId);
  const resolved = def ? await resolveCollection(ctx, def) : null;
  // Samples exist only as files in the web bundle, not as studio assets.
  const samples = new Set(def?.samples?.map((s) => s.key));
  const items = (resolved?.items ?? []).filter(
    (item): item is AssetItem => isAssetItem(item) && !samples.has(item.key)
  );
  if (!def || items.length === 0) {
    return { ok: false, status: 404, message: 'Diese Kollektion enthält keine Sticker.' };
  }

  // Fetched once: a refresh mid-export would rotate the refresh token per call.
  const accessToken = await CanvaConnectionManager.getValidAccessToken(ctx.userId);
  const folder = await createFolder(accessToken, { name: def.title, parentFolderId: 'uploads' });

  const failed: CanvaCollectionExportResponse['failed'] = [];
  let uploaded = 0;
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) {
      try {
        const assetId = await uploadOne(accessToken, item);
        await moveFolderItem(accessToken, { itemId: assetId, toFolderId: folder.id });
        uploaded += 1;
      } catch (error) {
        log.warn('Sticker not exported to Canva', {
          collectionId,
          ref: item.ref,
          error: (error as Error).message,
        });
        failed.push({ ref: item.ref, title: item.title });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, worker));

  log.info('Collection exported to Canva', { collectionId, uploaded, failed: failed.length });
  return { ok: true, value: { folderName: folder.name, uploaded, failed } };
}
