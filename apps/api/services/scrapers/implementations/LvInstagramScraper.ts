/**
 * Daily Instagram posts of every Landesverband into `landesverbaende_documents`,
 * for the "Neu auf Instagram" card on the notebook overview.
 *
 * Posts share the corpus with the scraped articles (so the notebook chat finds
 * them) but stay out of the overview statistics and the `/feed`: both readers
 * exclude `content_type: 'instagram'`. No `recordSyncEvent` for the same reason.
 */
import { ApifyClient } from 'apify-client';
import { v5 as uuidv5 } from 'uuid';

import { env } from '../../../config/env.js';
import { CONTENT_TYPE_LABELS } from '../../../config/landesverbaendeConfig.js';
import { LV_SOCIAL_ACCOUNTS } from '../../../config/landesverbaendeSocialAccounts.js';
import { SYSTEM_COLLECTIONS } from '../../../config/systemCollectionsConfig.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { batchUpsert } from '../../../database/services/QdrantService/operations/batchOperations.js';
import { createLogger } from '../../../utils/logger.js';
import { deleteCachedKey } from '../../../utils/redis/jsonCache.js';
import { generateContentHash } from '../../../utils/validation/index.js';
import { embeddingPayload } from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { fetchInstagramPosts, type InstagramPost } from '../utils/apifyInstagram.js';
import { pruneLvSocialImages, storeLvSocialImage } from '../utils/lvSocialImages.js';

const log = createLogger('LvInstagramScraper');

const COLLECTION = 'landesverbaende_documents';
const RESULTS_LIMIT = 10;
/** Overlaps the 24 h cadence so one failed run loses nothing. */
const NEWER_THAN = '3 days';
const TITLE_MAX = 100;

interface LvInstagramResult {
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
  errorSamples: string[];
}

export function instagramPointId(postUrl: string): string {
  return uuidv5(postUrl, uuidv5.URL);
}

function titleOf(caption: string): string {
  const firstLine = caption.split('\n').find((line) => line.trim().length > 0) ?? caption;
  const trimmed = firstLine.trim();
  return trimmed.length > TITLE_MAX ? `${trimmed.slice(0, TITLE_MAX - 1)}…` : trimmed;
}

export function buildInstagramPayload(
  post: InstagramPost,
  lv: string,
  contentHash: string,
  imagePath: string | null,
  now: string
): Record<string, unknown> {
  return {
    document_id: `lv_ig_${post.shortCode}`,
    source_url: post.url,
    source_id: `${lv.toLowerCase()}-instagram`,
    source_name: `Instagram @${post.sourceAccount}`,
    landesverband: lv,
    source_type: 'landesverband',
    content_type: 'instagram',
    content_type_label: CONTENT_TYPE_LABELS.instagram,
    content_hash: contentHash,
    chunk_index: 0,
    chunk_text: post.caption,
    full_text: post.caption,
    title: titleOf(post.caption),
    published_at: post.publishedAt,
    indexed_at: now,
    checked_at: now,
    source: 'landesverbaende_gruene',
    platform: 'instagram',
    source_account: post.sourceAccount,
    image_path: imagePath,
    ...embeddingPayload(),
  };
}

/** `notebook:overview:*` keys of every system collection that shows this LV. */
function overviewCacheKeys(lv: string): string[] {
  return Object.values(SYSTEM_COLLECTIONS)
    .filter((c) => {
      if (c.qdrantCollection !== COLLECTION || c.defaultFilter?.field !== 'landesverband') {
        return false;
      }
      const value = c.defaultFilter.value;
      return Array.isArray(value) ? value.includes(lv) : value === lv;
    })
    .map((c) => `notebook:overview:${c.id}`);
}

export async function scrapeLvInstagram(
  options: { landesverband?: string; forceUpdate?: boolean } = {}
): Promise<LvInstagramResult> {
  const result: LvInstagramResult = {
    stored: 0,
    updated: 0,
    skipped: 0,
    fetchErrors: 0,
    errors: 0,
    errorSamples: [],
  };
  const fail = (message: string) => {
    log.error(message);
    result.errors++;
    if (result.errorSamples.length < 10) result.errorSamples.push(message);
  };

  if (!env.APIFY_TOKEN) {
    fail('APIFY_TOKEN not configured — cannot fetch LV Instagram posts');
    return result;
  }
  const apify = new ApifyClient({ token: env.APIFY_TOKEN });

  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client;
  if (!client) {
    fail('Qdrant not available — cannot index LV Instagram posts');
    return result;
  }
  await mistralEmbeddingService.init();
  if (!mistralEmbeddingService.isReady()) {
    fail('Mistral embedding service not ready — cannot index LV Instagram posts');
    return result;
  }

  const accounts = LV_SOCIAL_ACCOUNTS.filter(
    (a) =>
      a.platform === 'instagram' &&
      (options.landesverband === undefined || a.lv === options.landesverband)
  );
  const changedLvs = new Set<string>();

  for (const account of accounts) {
    let posts: InstagramPost[];
    try {
      posts = await fetchInstagramPosts(apify, account.handle, {
        resultsLimit: RESULTS_LIMIT,
        onlyPostsNewerThan: NEWER_THAN,
      });
      log.info(`[${account.lv}] ${posts.length} posts from @${account.handle}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[${account.lv}] fetch @${account.handle} failed: ${message}`);
      result.fetchErrors++;
      continue;
    }

    for (const post of posts) {
      try {
        const id = instagramPointId(post.url);
        const contentHash = generateContentHash(post.caption);
        const [existing] = await client.retrieve(COLLECTION, {
          ids: [id],
          with_payload: ['content_hash', 'image_path'],
          with_vector: false,
        });
        const existingPayload = (existing?.payload ?? null) as Record<string, unknown> | null;
        if (existingPayload?.content_hash === contentHash && !options.forceUpdate) {
          result.skipped++;
          continue;
        }

        let imagePath =
          typeof existingPayload?.image_path === 'string' ? existingPayload.image_path : null;
        if (!imagePath && post.imageUrl) {
          imagePath = await storeLvSocialImage(post.shortCode, post.imageUrl).catch(
            (error: unknown) => {
              log.warn(`[${account.lv}] image for ${post.url} failed: ${String(error)}`);
              return null;
            }
          );
        }

        const vector = await mistralEmbeddingService.generateEmbedding(post.caption);
        const payload = buildInstagramPayload(
          post,
          account.lv,
          contentHash,
          imagePath,
          new Date().toISOString()
        );
        await batchUpsert(client, COLLECTION, [{ id, vector, payload }]);

        if (existing) result.updated++;
        else result.stored++;
        changedLvs.add(account.lv);
      } catch (error) {
        fail(
          `[${account.lv}] ${post.url}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  for (const key of [...changedLvs].flatMap(overviewCacheKeys)) {
    await deleteCachedKey(key);
  }
  const pruned = await pruneLvSocialImages();

  log.info(
    `LV Instagram sync: ${result.stored} stored, ${result.updated} updated, ${result.skipped} skipped, ` +
      `${result.fetchErrors} fetch errors, ${result.errors} errors, ${pruned} images pruned`
  );
  return result;
}
