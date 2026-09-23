/**
 * Woher das Original einer Quelle für „Neu indexieren" kommt, und wie der
 * Worker es holt. Getrennt von `reindex.ts`, weil `fileProcessing.ts` es
 * braucht und `reindex.ts` den Worker anstößt — sonst ein Importkreis.
 */
import { resolveDocumentUploadFormat } from '@gruenerator/contracts';

import type { UploadedFile } from './types.js';

export type ReindexOrigin =
  { kind: 'wolke'; shareLinkId: string; filePath: string } | { kind: 'url'; url: string };

export interface ReindexRow {
  id: string;
  user_id: string | null;
  filename: string | null;
  status: string | null;
  source_url: string | null;
  wolke_share_link_id: string | null;
  wolke_file_path?: string | null;
  metadata: unknown;
}

function readMeta(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Woher das Original kommt — `null` heißt: nur noch der gespeicherte Text.
 * Eine Wolke-Datei zählt nur, wenn der Upload-Pfad ihr Format lesen kann.
 */
export function reindexOrigin(row: ReindexRow): ReindexOrigin | null {
  if (
    row.wolke_share_link_id &&
    row.wolke_file_path &&
    resolveDocumentUploadFormat(row.filename ?? '', '')
  ) {
    return { kind: 'wolke', shareLinkId: row.wolke_share_link_id, filePath: row.wolke_file_path };
  }
  const meta = readMeta(row.metadata);
  const url = isHttpUrl(row.source_url) ? row.source_url : meta.originalUrl;
  if (isHttpUrl(url)) return { kind: 'url', url: url.trim() };
  return null;
}

/**
 * Für die Notebook-Liste, die `wolke_file_path` nicht liest: der Wolke-Sync
 * schreibt Freigabe und Pfad immer zusammen, die Freigabe genügt als Zeichen.
 */
export function isReindexable(row: Omit<ReindexRow, 'wolke_file_path'>): boolean {
  return reindexOrigin({ ...row, wolke_file_path: row.wolke_share_link_id ? 'x' : null }) !== null;
}

/**
 * Holt das Original für den Worker. Wirft mit einer Nachricht, die die
 * Nutzer*in versteht — sie landet als `processing_error` an der Zeile.
 */
export async function fetchOriginal(
  origin: ReindexOrigin,
  document: { filename?: string | null | undefined; title?: string | null | undefined },
  ownerUserId: string
): Promise<UploadedFile> {
  if (origin.kind === 'wolke') {
    const { NextcloudShareManager } =
      await import('../../../utils/integrations/nextcloud/index.js');
    const { default: NextcloudApiClient } = await import('../../api-clients/nextcloudApiClient.js');
    const links = await NextcloudShareManager.getShareLinks(ownerUserId);
    const link = links.find((l) => l.id === origin.shareLinkId);
    if (!link || !link.is_active) {
      throw new Error('Die Wolke-Freigabe ist nicht mehr verfügbar.');
    }
    const client = await NextcloudApiClient.create(link.share_link);
    const download = await client.downloadFile(origin.filePath);
    const originalname = document.filename || 'dokument';
    return {
      buffer: download.buffer,
      mimetype: download.mimeType || 'application/octet-stream',
      originalname,
      size: download.buffer.length,
    };
  }

  const { validateUrlForFetch } = await import('../../../utils/validation/urlSecurity.js');
  const check = await validateUrlForFetch(origin.url);
  if (!check.isValid || !check.url) {
    throw new Error('Die Adresse der Quelle ist ungültig oder nicht erlaubt.');
  }
  const { urlCrawlerService } = await import('../../scrapers/implementations/UrlCrawler/index.js');
  const page = await urlCrawlerService.crawlUrl(check.url.toString());
  const content = page.success ? page.data?.content?.trim() : undefined;
  if (!content) {
    throw new Error('Die Seite ließ sich nicht laden oder enthielt keinen lesbaren Text.');
  }
  const buffer = Buffer.from(content, 'utf-8');
  return { buffer, mimetype: 'text/markdown', originalname: 'quelle.md', size: buffer.length };
}
