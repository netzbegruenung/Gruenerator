/**
 * Wolke file retrieval for the multi-doc fan-out.
 *
 * Downloads a single user-selected Wolke (Nextcloud) file via WebDAV at
 * chat-send time, extracts its text via the shared OCR / text-extraction
 * pipeline, and returns SearchResult chunks the respondNode can quote.
 *
 * No DB writes, no Qdrant indexing — purely inline-at-send-time. Stale or
 * unsupported files yield an empty result set plus an `error` so the rest of
 * the turn still succeeds while the failure stays visible.
 */

import { type WolkeFileRef } from '@gruenerator/contracts';

import NextcloudApiClient from '../../../../services/api-clients/nextcloudApiClient.js';
import { extractTextFromFile } from '../../../../services/document-services/DocumentProcessingService/textExtraction.js';
import { NextcloudShareManager } from '../../../../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../../../../utils/logger.js';
import { SOURCE_PREFIX, type DocumentSource, type SearchResult } from '../types.js';

import { chunkText, mimeTypeFromName } from './retrievalChunking.js';

const log = createLogger('WolkeRetrieval');

interface ShareLinkRecord {
  id: string;
  share_link: string;
  is_active?: boolean;
}

async function resolveShareLink(
  userId: string,
  shareLinkId: string
): Promise<ShareLinkRecord | null> {
  try {
    const links = (await NextcloudShareManager.getShareLinks(userId)) as ShareLinkRecord[];
    return links.find((l) => l.id === shareLinkId && l.is_active !== false) ?? null;
  } catch (err) {
    log.warn(`[Wolke] Share-link lookup failed for ${shareLinkId}`, err);
    return null;
  }
}

/**
 * Retrieval outcome. `error` is set whenever the file could not be read, so the
 * fan-out can record a failure instead of silently treating an empty result set
 * as "the file had nothing to say".
 */
export interface WolkeRetrievalResult {
  results: SearchResult[];
  error?: { message: string; reauth?: boolean };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type WolkeDownload =
  | { ok: true; buffer: Buffer; mimeType: string | null; size: number }
  | { ok: false; message: string };

/** Share link → client → download; the shared first half of every Wolke read. */
export async function downloadWolkeFile(userId: string, ref: WolkeFileRef): Promise<WolkeDownload> {
  const { shareLinkId, path: filePath, name } = ref;

  const shareLink = await resolveShareLink(userId, shareLinkId);
  if (!shareLink) {
    log.warn(`[Wolke] Skip ${name}: share link ${shareLinkId} not available`);
    return { ok: false, message: `Wolke-Freigabe für "${name}" nicht verfügbar` };
  }

  let client: NextcloudApiClient;
  try {
    client = await NextcloudApiClient.create(shareLink.share_link);
  } catch (err) {
    log.warn(`[Wolke] NextcloudApiClient init failed for ${shareLinkId}`, err);
    return { ok: false, message: `Wolke-Verbindung fehlgeschlagen: ${errMessage(err)}` };
  }

  try {
    const download = await client.downloadFile(filePath);
    return { ok: true, ...download };
  } catch (err) {
    log.warn(`[Wolke] downloadFile failed for ${filePath}`, err);
    return { ok: false, message: `Download von "${name}" fehlgeschlagen: ${errMessage(err)}` };
  }
}

export async function retrieveWolkeFile(
  src: DocumentSource,
  perSourceLimit: number,
  userId: string
): Promise<WolkeRetrievalResult> {
  if (src.kind !== 'wolke' || !src.wolke) return { results: [] };
  const { shareLinkId, path: filePath, name } = src.wolke;

  const download = await downloadWolkeFile(userId, src.wolke);
  if (!download.ok) return { results: [], error: { message: download.message } };

  const mimetype = download.mimeType || mimeTypeFromName(name);
  let text: string;
  try {
    text = await extractTextFromFile({
      buffer: download.buffer,
      mimetype,
      originalname: name,
      size: download.size,
    });
  } catch (err) {
    log.warn(`[Wolke] text extraction skipped for ${name} (${mimetype})`, err);
    return {
      results: [],
      error: { message: `Textextraktion für "${name}" fehlgeschlagen: ${errMessage(err)}` },
    };
  }

  const chunks = chunkText(text, perSourceLimit);
  return {
    results: chunks.map<SearchResult>((content, idx) => ({
      source: `${SOURCE_PREFIX.WOLKE}${shareLinkId}:${filePath}`,
      title: name,
      content,
      relevance: 0.7,
      documentSourceId: src.id,
      chunkIndex: idx,
    })),
  };
}
