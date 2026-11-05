/**
 * Ob eine gerade hochgeladene Datei schon in dem Notebook liegt, in das sie
 * soll (#5342). Ohne diese Prüfung lag dieselbe PDF zweimal in einem Notebook,
 * die Suche zeigte jede Karte doppelt und eine Antwort zitierte jeden Satz mit
 * beiden Kopien.
 *
 * Verglichen wird der SHA-256 der rohen Bytes. Zeilen von vor der Spalte
 * `file_hash` haben keinen Hash, und ihre Datei liegt nach dem Ingest nicht
 * mehr auf der Platte — für sie gelten gleicher Dateiname und gleiche Größe
 * als dieselbe Datei.
 *
 * Gesucht wird unter allen Dokumenten des Notebooks, nicht nur den eigenen:
 * in einem geteilten Notebook lädt jemand eine Datei hoch, die eine andere
 * Person schon angehängt hat. Der Aufrufer prüft vorher das Bearbeitungsrecht,
 * sonst ließe sich fremder Notebook-Inhalt per Hash abfragen.
 */
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

export interface UploadedFileIdentity {
  hash: string;
  filename: string;
  size: number;
}

export interface DuplicateDocument {
  id: string;
  title: string;
}

interface Deps {
  listDocumentIds: (collectionId: string) => Promise<string[]>;
  query: (sql: string, params: unknown[]) => Promise<unknown[]>;
}

const defaultDeps = (): Deps => {
  const helper = new NotebookQdrantHelper();
  return {
    listDocumentIds: async (collectionId) =>
      (await helper.getCollectionDocuments(collectionId, { rethrow: true })).map(
        (d) => d.document_id
      ),
    query: async (sql, params) => (await getPostgresInstance().query(sql, params)) as unknown[],
  };
};

export async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

export async function findDuplicateInNotebook(
  collectionId: string,
  file: UploadedFileIdentity,
  deps: Deps = defaultDeps()
): Promise<DuplicateDocument | null> {
  const ids = await deps.listDocumentIds(collectionId);
  if (ids.length === 0) return null;

  const rows = (await deps.query(
    `SELECT id, title FROM documents
      WHERE id = ANY($1) AND deleted_at IS NULL
        AND (file_hash = $2 OR (file_hash IS NULL AND filename = $3 AND file_size = $4))
      LIMIT 1`,
    [ids, file.hash, file.filename, file.size]
  )) as DuplicateDocument[];
  return rows[0] ?? null;
}
