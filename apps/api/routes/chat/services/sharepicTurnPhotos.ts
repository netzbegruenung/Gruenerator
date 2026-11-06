/**
 * The photos a chat sharepic turn brings: uploads and Wolke images go into the
 * person's Mediathek (visible there like any upload), get analysed, and reach
 * the creator as own photos with a durable URL. The same bytes are stored once
 * per person.
 */
import { createHash } from 'node:crypto';

import {
  parseSharepicChatProps,
  type SharepicBerichtEintrag,
  type SharepicPhotoAnalysis,
  type SharepicChatProps,
  type WolkeFileRef,
} from '@gruenerator/contracts';

import { downloadWolkeFile } from '../../../agents/langgraph/ChatGraph/nodes/wolkeRetrieval.js';
import {
  type ChatGraphState,
  type ImageAttachment,
} from '../../../agents/langgraph/ChatGraph/types.js';
import { getSharedMediaService } from '../../../services/sharedMediaService.js';
import {
  analyzePhoto,
  loadOwnPhoto,
  MAX_BYTES,
} from '../../../services/sharepicCreator/photoAnalysis.js';
import { createLogger } from '../../../utils/logger.js';

import { loadLastGeneratedImage } from './lastGeneratedImage.js';
import { collectTurnPhotos, type SharepicOwnPhotoWithUrl } from './turnPhotos.js';

const log = createLogger('sharepicTurnPhotos');

const CACHE_MAX = 500;
interface Known {
  url: string;
  /** Vision result, once computed — a revision does not pay for it again. */
  analysis: SharepicPhotoAnalysis | null;
}
/** `userId:sha256(bytes)` → library URL and analysis. */
const cache = new Map<string, Known>();

const keyOf = (userId: string, buffer: Buffer): string =>
  `${userId}:${createHash('sha256').update(buffer).digest('hex')}`;

function remember(key: string, known: Known): void {
  if (!cache.has(key) && cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, known);
}

async function analysisOf(key: string, buffer: Buffer): Promise<SharepicPhotoAnalysis> {
  const known = cache.get(key);
  if (known?.analysis) return known.analysis;
  const analysis = await analyzePhoto(buffer);
  // A failed vision call is a placeholder, not worth keeping.
  if (known && analysis.analysiert) known.analysis = analysis;
  return analysis;
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
/** collectTurnPhotos only lets jpg/jpeg/png/webp through, so the extension decides. */
const imageMimeOf = (name: string): string =>
  IMAGE_MIME[name.split('.').pop()!.toLowerCase()] ?? 'image/jpeg';

const photoUrl = (shareToken: string): string => `/api/share/${shareToken}/download`;

/** Library URL of these bytes, stored on first sight; the copy is a normal upload. */
async function storeOnce(
  userId: string,
  key: string,
  buffer: Buffer,
  name: string,
  mimeType: string
): Promise<string> {
  const media = getSharedMediaService();
  const cached = cache.get(key);
  if (cached) {
    // The person may have deleted the copy from their library since.
    const share = await media.getShareByToken(cached.url.split('/')[3]!);
    if (share?.status === 'ready') return cached.url;
    cache.delete(key);
  }
  const share = await media.uploadMediaFile(userId, {
    fileBuffer: buffer,
    originalFilename: name,
    mimeType,
    title: name,
    altText: name,
    uploadSource: 'upload',
  });
  const url = photoUrl(share.shareToken);
  remember(key, { url, analysis: null });
  return url;
}

const notUsed = (id: string, grund: string): SharepicBerichtEintrag => ({
  art: 'foto',
  id,
  status: 'nicht_verwendet',
  grund,
});

export async function prepareSharepicPhotos(opts: {
  userId: string;
  images: readonly ImageAttachment[];
  wolke: readonly WolkeFileRef[];
  prior: readonly SharepicOwnPhotoWithUrl[];
}): Promise<{ photos: SharepicOwnPhotoWithUrl[]; bericht: SharepicBerichtEintrag[] }> {
  const { userId, prior } = opts;
  const { take, skipped } = collectTurnPhotos(opts.images, opts.wolke, prior);
  const photos: SharepicOwnPhotoWithUrl[] = [...prior];
  const bericht: SharepicBerichtEintrag[] = [...skipped];

  for (const { id, source } of take) {
    try {
      let buffer: Buffer;
      let name: string;
      let mimeType: string;
      if (source.kind === 'upload') {
        buffer = Buffer.from(source.data, 'base64');
        ({ name, mimeType } = source);
      } else {
        const download = await downloadWolkeFile(userId, source.ref);
        if (!download.ok) {
          bericht.push(notUsed(id, download.message.slice(0, 200)));
          continue;
        }
        if (download.buffer.length > MAX_BYTES || download.size > MAX_BYTES) {
          bericht.push(notUsed(id, 'Das Foto ist zu groß.'));
          continue;
        }
        buffer = download.buffer;
        name = source.ref.name;
        mimeType = download.mimeType || imageMimeOf(name);
      }
      const key = keyOf(userId, buffer);
      const url = await storeOnce(userId, key, buffer, name, mimeType);
      // The same photo again (a prior one, or twice in this turn) keeps its id.
      if (photos.some((p) => p.url === url)) continue;
      photos.push({ id, url, analysis: await analysisOf(key, buffer) });
    } catch (error) {
      log.warn(`photo ${id} not used: ${error instanceof Error ? error.message : String(error)}`);
      bericht.push(notUsed(id, 'Das Foto konnte nicht gespeichert werden.'));
    }
  }
  return { photos, bericht };
}

/**
 * The photos a revised variant already holds. The analysis is recomputed from
 * the stored file — the props come back from the client, so only the url is
 * taken from them, and `loadOwnPhoto` checks it is the person's own.
 */
export async function priorSharepicPhotos(
  props: Pick<SharepicChatProps, 'photos'> | null,
  userId: string
): Promise<{ photos: SharepicOwnPhotoWithUrl[]; bericht: SharepicBerichtEintrag[] }> {
  const media = getSharedMediaService();
  const photos: SharepicOwnPhotoWithUrl[] = [];
  const bericht: SharepicBerichtEintrag[] = [];
  for (const { id, url } of props?.photos ?? []) {
    try {
      const buffer = await loadOwnPhoto(url, userId, media);
      if (!buffer) {
        bericht.push(notUsed(id, 'Das Foto ist nicht mehr in deiner Mediathek.'));
        continue;
      }
      const key = keyOf(userId, buffer);
      // This url is known to be the person's own and ready.
      remember(key, { url, analysis: cache.get(key)?.analysis ?? null });
      photos.push({ id, url, analysis: await analysisOf(key, buffer) });
    } catch (error) {
      log.warn(
        `prior photo ${id} not used: ${error instanceof Error ? error.message : String(error)}`
      );
      bericht.push(notUsed(id, 'Das Foto konnte nicht geladen werden.'));
    }
  }
  return { photos, bericht };
}

/**
 * Everything a sharepic turn hands the creator as own photos: what the revised
 * variant holds (`priorProps`, null on a fresh draft) plus this turn's
 * attachments. Wolke files carried over from earlier turns are material, not
 * photos of this order — unless the thread is still working on the sharepic they
 * were picked for (`sharepicInProgress`; live 06.11.2026: „nimm das bild im
 * anhang für das sharepic", built two turns later without it). The image the
 * thread generated last comes along when the turn means it
 * (`sharepicTakesThreadImage`; live 06.11.2026: „nimm dieses bild und pack es in
 * ein Sharepic" after a FLUX image) — an attached image wins, it is the one
 * „dieses Bild" points at. Without a person there is no library to store in.
 */
export async function photosForTurn(
  state: Partial<
    Pick<
      ChatGraphState,
      | 'imageAttachments'
      | 'wolkeFiles'
      | 'cloudFilesCarriedOnly'
      | 'sharepicInProgress'
      | 'sharepicTakesThreadImage'
      | 'threadId'
      | 'agentConfig'
    >
  >,
  priorProps: unknown
): Promise<{ photos: SharepicOwnPhotoWithUrl[]; bericht: SharepicBerichtEintrag[] }> {
  const userId = state.agentConfig?.userId ?? null;
  if (!userId) return { photos: [], bericht: [] };
  const prior = await priorSharepicPhotos(parseSharepicChatProps(priorProps), userId);
  const attached = state.imageAttachments ?? [];
  const threadImage =
    state.sharepicTakesThreadImage === true && attached.length === 0 && state.threadId
      ? await loadLastGeneratedImage(state.threadId)
      : null;
  const turn = await prepareSharepicPhotos({
    userId,
    images: threadImage ? [threadImage] : attached,
    wolke:
      state.cloudFilesCarriedOnly === true && state.sharepicInProgress !== true
        ? []
        : (state.wolkeFiles ?? []),
    prior: prior.photos,
  });
  return { photos: turn.photos, bericht: [...prior.bericht, ...turn.bericht] };
}
