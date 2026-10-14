/**
 * A `bild` with ausschnitt `freigestellt`: the rembg sidecar removes the
 * photo's background once, the PNG goes into the user's media library, and
 * the spec carries it as `freisteller: ki:<shareToken>`. The browser composer
 * cannot run the removal, so it happens here, after the draft.
 *
 * Results are cached per user and source bytes: a revision, a second slide or
 * a later draft with the same photo reuses the stored cut-out.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHAREPIC_SCENE_REF } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import { removeBackgroundWithRembg } from '../image/rembgIntegration.js';
import { getSharedMediaService } from '../sharedMediaService.js';

import { hasStockPhoto } from './catalog.js';
import { loadOwnPhoto } from './photoAnalysis.js';

const log = createLogger('sharepicCreator:cutOut');
const __dirname = dirname(fileURLToPath(import.meta.url));
const STOCK_DIR = path.join(__dirname, '../../public/sharepic_example_bg');

/** `ki:<token>` of the cut-out, or null where it could not be made. */
export type CutOutPainter = (quelle: string) => Promise<string | null>;

/**
 * The bytes behind a `bild` source, read from our own storage only. An own
 * upload (`upload:N`) is not: its URL stays on the client.
 */
async function loadSource(quelle: string, userId: string): Promise<Buffer | null> {
  const token = SHAREPIC_SCENE_REF.exec(quelle)?.[1];
  if (token) return loadOwnPhoto(`/api/share/${token}/download`, userId, getSharedMediaService());
  // Only a catalogue name reaches the disk: no path from the model is joined.
  return hasStockPhoto(quelle) ? fs.readFile(path.join(STOCK_DIR, quelle)) : null;
}

const CACHE_MAX = 500;
const cache = new Map<string, string>();

export function createCutOutPainter(userId: string): CutOutPainter {
  return async (quelle) => {
    try {
      const source = await loadSource(quelle, userId);
      if (!source) return null;
      const key = `${userId}:${createHash('sha256').update(source).digest('hex')}`;
      const media = getSharedMediaService();
      const cached = cache.get(key);
      if (cached) {
        // The person may have deleted the cut-out from their library since.
        const share = await media.getShareByToken(cached.slice('ki:'.length));
        if (share?.status === 'ready') return cached;
        cache.delete(key);
      }
      const cut = await removeBackgroundWithRembg(source, 'sharepic-foto.png');
      const share = await media.uploadMediaFile(userId, {
        fileBuffer: cut,
        originalFilename: 'sharepic-freigestellt.png',
        mimeType: 'image/png',
        title: 'Freigestelltes Foto',
        altText: 'Freigestelltes Foto für ein Sharepic',
        uploadSource: 'ai_generated',
      });
      const ref = `ki:${share.shareToken}`;
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
      cache.set(key, ref);
      return ref;
    } catch (error) {
      log.warn(`cut-out failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
}
