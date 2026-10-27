/**
 * Woher das Original einer Quelle für „Neu indexieren" kommt, und wie der
 * Worker es holt. Getrennt von `reindex.ts`, weil `fileProcessing.ts` es
 * braucht und `reindex.ts` den Worker anstößt — sonst ein Importkreis.
 *
 * WOLKE-DATEIEN und GESCHEITERTE UPLOADS. URL- und WordPress-Quellen gewännen
 * keine Seitenzahlen, und WordPress verlöre dabei: sein Text kommt beim Import
 * aus der REST-API, ein Neu-Crawl ersetzte ihn durch die gerenderte Seite samt
 * Navigation.
 *
 * Ein Upload behält seine Datei nur, solange er nicht fertig ist: erfolgreich
 * verarbeitet wird sie gelöscht, gescheitert bleibt sie liegen, bis der
 * `pending`-Sweep (`uploadsCleanupService.ts`, 7 Tage) sie abräumt. Solange sie
 * da ist, liest der Worker sie über `metadata.filePath` wie beim ersten Lauf.
 */
import fs from 'fs';

import { resolveDocumentUploadFormat } from '@gruenerator/contracts';

import type { UploadedFile } from './types.js';

export interface WolkeOrigin {
  kind: 'wolke';
  shareLinkId: string;
  filePath: string;
}

export type ReindexOrigin = WolkeOrigin | { kind: 'upload' };

export interface ReindexRow {
  id: string;
  user_id: string | null;
  filename: string | null;
  status: string | null;
  wolke_share_link_id: string | null;
  wolke_file_path?: string | null;
  vector_count?: number | null;
  /** Objekt oder JSON-Text, je nach Leser. */
  metadata?: unknown;
}

/**
 * Woher das Original kommt — `null` heißt: nur noch der gespeicherte Text.
 */
export function reindexOrigin(row: ReindexRow): ReindexOrigin | null {
  return wolkeOrigin(row) ?? (hasKeptUpload(row) ? { kind: 'upload' } : null);
}

/** Eine Wolke-Datei zählt nur, wenn der Upload-Pfad ihr Format lesen kann. */
export function wolkeOrigin(row: ReindexRow): WolkeOrigin | null {
  if (
    row.wolke_share_link_id &&
    row.wolke_file_path &&
    resolveDocumentUploadFormat(row.filename ?? '', '')
  ) {
    return { kind: 'wolke', shareLinkId: row.wolke_share_link_id, filePath: row.wolke_file_path };
  }
  return null;
}

function hasKeptUpload(row: ReindexRow): boolean {
  const meta: unknown = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
  const filePath = (meta as { filePath?: unknown } | null | undefined)?.filePath;
  return typeof filePath === 'string' && fs.existsSync(filePath);
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
  origin: WolkeOrigin,
  document: { filename?: string | null | undefined },
  ownerUserId: string
): Promise<UploadedFile> {
  const { NextcloudShareManager } = await import('../../../utils/integrations/nextcloud/index.js');
  const { default: NextcloudApiClient } = await import('../../api-clients/nextcloudApiClient.js');
  const links = await NextcloudShareManager.getShareLinks(ownerUserId);
  const link = links.find((l) => l.id === origin.shareLinkId);
  if (!link || !link.is_active) {
    throw new Error('Die Wolke-Freigabe ist nicht mehr verfügbar.');
  }
  const client = await NextcloudApiClient.create(link.share_link);
  const download = await client.downloadFile(origin.filePath);
  return {
    buffer: download.buffer,
    mimetype: download.mimeType || 'application/octet-stream',
    originalname: document.filename || 'dokument',
    size: download.buffer.length,
  };
}
