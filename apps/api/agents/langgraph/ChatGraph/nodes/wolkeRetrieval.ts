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

import NextcloudApiClient from '../../../../services/api-clients/nextcloudApiClient.js';
import { extractTextFromFile } from '../../../../services/document-services/DocumentProcessingService/textExtraction.js';
import { NextcloudShareManager } from '../../../../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../../../../utils/logger.js';
import { SOURCE_PREFIX, type DocumentSource, type SearchResult } from '../types.js';

const log = createLogger('WolkeRetrieval');

const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 100;

function chunkText(text: string, perSourceLimit: number): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= CHUNK_SIZE) return [cleaned];
  const chunks: string[] = [];
  let pos = 0;
  const stride = CHUNK_SIZE - CHUNK_OVERLAP;
  while (pos < cleaned.length && chunks.length < perSourceLimit) {
    chunks.push(cleaned.slice(pos, pos + CHUNK_SIZE));
    pos += stride;
  }
  return chunks;
}

function mimeTypeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.pptx'))
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain';
  return 'application/octet-stream';
}

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

export async function retrieveWolkeFile(
  src: DocumentSource,
  perSourceLimit: number,
  userId: string
): Promise<WolkeRetrievalResult> {
  if (src.kind !== 'wolke' || !src.wolke) return { results: [] };
  const { shareLinkId, path: filePath, name } = src.wolke;

  const shareLink = await resolveShareLink(userId, shareLinkId);
  if (!shareLink) {
    log.warn(`[Wolke] Skip ${name}: share link ${shareLinkId} not available`);
    return {
      results: [],
      error: { message: `Wolke-Freigabe für "${name}" nicht verfügbar` },
    };
  }

  let client: NextcloudApiClient;
  try {
    client = await NextcloudApiClient.create(shareLink.share_link);
  } catch (err) {
    log.warn(`[Wolke] NextcloudApiClient init failed for ${shareLinkId}`, err);
    return {
      results: [],
      error: { message: `Wolke-Verbindung fehlgeschlagen: ${errMessage(err)}` },
    };
  }

  let download: { buffer: Buffer; mimeType: string | null; size: number };
  try {
    download = await client.downloadFile(filePath);
  } catch (err) {
    log.warn(`[Wolke] downloadFile failed for ${filePath}`, err);
    return {
      results: [],
      error: { message: `Download von "${name}" fehlgeschlagen: ${errMessage(err)}` },
    };
  }

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
