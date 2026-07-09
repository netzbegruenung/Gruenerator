/**
 * Server-side storage for run_python compute assets (matplotlib figures and
 * exported files). The resume endpoint receives them as capped base64; instead
 * of persisting megabytes into the message-metadata JSONB (which every thread
 * open re-downloads), they are written under uploads/compute-assets/{userId}/
 * and the metadata keeps only authenticated URLs.
 *
 * Serving goes through GET /api/chat-service/compute-assets/:fileName with a
 * session check + userId-scoped paths — deliberately NOT the public
 * /uploads static pattern, since exports contain user data.
 *
 * Retention: uploadsCleanupService removes assets after 90 days (see
 * AGE_BASED_DIRS); the ComputeCard hides figures whose URL has expired.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createLogger } from '../../../utils/logger.js';

import type { ComputePayload } from '@gruenerator/contracts';

const log = createLogger('ComputeAssetStorage');

export const COMPUTE_ASSETS_DIR = 'compute-assets';

// Env override exists for tests only (write to a tmp dir, not repo uploads).
const baseDir = () =>
  process.env.COMPUTE_ASSETS_BASE_DIR ?? path.join(process.cwd(), 'uploads', COMPUTE_ASSETS_DIR);

/** Strict shape check so the download route can never be steered outside the
 *  user's asset directory: `{uuid}.{ext}` only. */
const ASSET_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/i;
// User IDs are UUIDs or Better-Auth alphanumeric IDs — never path segments.
const SAFE_USER_ID = /^[a-z0-9_-]{1,64}$/i;

export function resolveComputeAssetPath(userId: string, fileName: string): string | null {
  if (!ASSET_FILE_NAME.test(fileName) || !SAFE_USER_ID.test(userId)) return null;
  return path.join(baseDir(), userId, fileName);
}

export function computeAssetUrl(fileName: string): string {
  return `/api/chat-service/compute-assets/${fileName}`;
}

function extensionFor(name: string, fallback: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : fallback;
}

async function storeAsset(userId: string, base64: string, extension: string): Promise<string> {
  const fileName = `${randomUUID()}.${extension}`;
  const dir = path.join(baseDir(), userId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), Buffer.from(base64, 'base64'));
  return fileName;
}

/**
 * Move the base64 assets of a validated compute payload to disk and return the
 * slim payload (URLs instead of base64). Fail-open: if storage breaks, the
 * original base64 payload is returned so the turn still completes — it just
 * pays the metadata weight this once.
 */
export async function persistComputeAssets(
  userId: string,
  payload: ComputePayload
): Promise<ComputePayload> {
  const hasAssets = (payload.figures?.length ?? 0) > 0 || (payload.files?.length ?? 0) > 0;
  if (!hasAssets) return payload;

  try {
    const figureUrls: string[] = [];
    for (const figure of payload.figures ?? []) {
      figureUrls.push(computeAssetUrl(await storeAsset(userId, figure, 'png')));
    }
    const fileAssets: Array<{ name: string; url: string }> = [];
    for (const file of payload.files ?? []) {
      const fileName = await storeAsset(userId, file.b64, extensionFor(file.name, 'bin'));
      fileAssets.push({ name: file.name, url: computeAssetUrl(fileName) });
    }

    const { figures: _figures, files: _files, ...slim } = payload;
    return {
      ...slim,
      ...(figureUrls.length > 0 && { figureUrls }),
      ...(fileAssets.length > 0 && { fileAssets }),
    };
  } catch (error) {
    log.error(
      `Failed to persist compute assets (falling back to inline base64): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return payload;
  }
}
