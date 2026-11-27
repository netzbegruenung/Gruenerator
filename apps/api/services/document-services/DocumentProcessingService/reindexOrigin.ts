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
 *
 * AUFBEWAHRTE ORIGINALE. Seit 23.11.2026 bleibt das Original eines fertigen
 * manuellen Uploads liegen (`documentOriginals.ts`, Spalte `file_path`). Damit
 * lässt sich eine Quelle neu lesen, wenn die Extraktion besser geworden ist —
 * etwa Tabellen (`scripts/repair-notebook-tables.ts`). Geprüft wird nur, wo der
 * Leser `file_path` mitliest; die Notebook-Liste tut das nicht und bleibt ohne
 * Dateisystem-Aufruf.
 */
import fs from 'fs';

import { resolveDocumentUploadFormat } from '@gruenerator/contracts';

import { resolveOriginalPath } from '../documentOriginals.js';

import { DocumentReadError } from './processingError.js';

import type { UploadedFile } from './types.js';

export interface WolkeOrigin {
  kind: 'wolke';
  shareLinkId: string;
  filePath: string;
}

export type ReindexOrigin = WolkeOrigin | { kind: 'original' } | { kind: 'upload' };

export interface ReindexRow {
  id: string;
  user_id: string | null;
  filename: string | null;
  status: string | null;
  wolke_share_link_id: string | null;
  wolke_file_path?: string | null;
  /** Relativer Pfad des aufbewahrten Originals (`documentOriginals.ts`). */
  file_path?: string | null;
  vector_count?: number | null;
  /** Objekt oder JSON-Text, je nach Leser. */
  metadata?: unknown;
}

/**
 * Woher das Original kommt — `null` heißt: nur noch der gespeicherte Text.
 */
export function reindexOrigin(row: ReindexRow): ReindexOrigin | null {
  const wolke = wolkeOrigin(row);
  if (wolke) return wolke;
  if (keptOriginalPath(row)) return { kind: 'original' };
  return hasKeptUpload(row) ? { kind: 'upload' } : null;
}

/** Absoluter Pfad des aufbewahrten Originals, wenn es lesbar daliegt. */
export function keptOriginalPath(row: Pick<ReindexRow, 'file_path' | 'filename'>): string | null {
  if (!row.file_path || !resolveDocumentUploadFormat(row.filename ?? '', '')) return null;
  const absolute = resolveOriginalPath(row.file_path);
  return absolute && fs.existsSync(absolute) ? absolute : null;
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

/**
 * Läuft je Zeile bei jedem Lesen eines Notebooks. Eine fertige Quelle hat ihre
 * Datei nie mehr (sie wird bei Erfolg gelöscht) — und das ist die große
 * Mehrheit; sie kommt ohne Parsen und ohne Dateisystem-Aufruf davon.
 */
function hasKeptUpload(row: ReindexRow): boolean {
  if (row.status === 'completed') return false;
  const filePath = rowMetadata(row).filePath;
  return typeof filePath === 'string' && fs.existsSync(filePath);
}

/** `metadata` als Objekt — je nach Leser kommt es als JSON-Text. */
export function rowMetadata(row: Pick<ReindexRow, 'metadata'>): Record<string, unknown> {
  const meta: unknown = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
  return meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
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
    throw new DocumentReadError('Die Wolke-Freigabe ist nicht mehr verfügbar.');
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
