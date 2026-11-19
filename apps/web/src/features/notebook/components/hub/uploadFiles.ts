import {
  DOCUMENT_MAX_UPLOAD_BYTES,
  DOCUMENT_UPLOAD_EXTENSIONS,
  DOCUMENT_UPLOAD_FORMAT_HINT,
  resolveDocumentUploadFormat,
} from '@gruenerator/contracts';
import { type DragEvent } from 'react';

export const ACCEPTED_EXTENSIONS = DOCUMENT_UPLOAD_EXTENSIONS;

const MAX_UPLOAD_MB = Math.round(DOCUMENT_MAX_UPLOAD_BYTES / (1024 * 1024));

export interface RejectedFile {
  name: string;
  reason: string;
}

/**
 * Das `accept` des Dateidialogs ist nur ein Vorschlag und greift bei Drag &
 * Drop gar nicht — diese Prüfung hält unlesbare Dateien draußen, bevor sie
 * hochgeladen werden.
 */
export function partitionUploadableFiles(files: File[]): {
  accepted: File[];
  rejected: RejectedFile[];
} {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    if (!resolveDocumentUploadFormat(file.name, file.type)) {
      rejected.push({ name: file.name, reason: 'Format wird nicht unterstützt' });
    } else if (file.size > DOCUMENT_MAX_UPLOAD_BYTES) {
      rejected.push({ name: file.name, reason: `größer als ${MAX_UPLOAD_MB} MB` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export function describeRejectedFiles(rejected: RejectedFile[]): string {
  const listed = rejected
    .slice(0, 3)
    .map((r) => `${r.name} (${r.reason})`)
    .join(', ');
  const rest = rejected.length > 3 ? ` und ${rejected.length - 3} weitere` : '';
  return `Nicht übernommen: ${listed}${rest}. Unterstützt werden ${DOCUMENT_UPLOAD_FORMAT_HINT} bis ${MAX_UPLOAD_MB} MB.`;
}

export function hasFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}

/**
 * Inhaltsgleiche Dateien einer Auswahl auf die erste reduzieren (#5342). Der
 * Server erkennt Dubletten nur gegen schon angehängte Quellen, angehängt wird
 * aber erst nach der ganzen Auswahl — zwei Kopien in einem Wurf, auch unter
 * verschiedenen Namen, kämen sonst beide durch. Gehasht wird nur, was eine
 * Größe mit einer anderen Datei teilt: gleiche Bytes heißt gleiche Größe.
 */
export async function dropSameContent(files: File[]): Promise<File[]> {
  const sizeCount = new Map<number, number>();
  for (const file of files) sizeCount.set(file.size, (sizeCount.get(file.size) ?? 0) + 1);

  const seen = new Set<string>();
  const kept: File[] = [];
  for (const file of files) {
    if ((sizeCount.get(file.size) ?? 0) > 1) {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
        ''
      );
      if (seen.has(key)) continue;
      seen.add(key);
    }
    kept.push(file);
  }
  return kept;
}

/**
 * Dateien, deren Name schon als Upload im Notebook steht, mit den betroffenen
 * Quellen. Inhaltsgleiches fängt der Server ab (409, #5342) — ein gleicher Name
 * mit ANDEREM Inhalt kam dagegen still als zweite Quelle dazu, und Antworten
 * zitierten danach beide Fassungen. Uploads tragen den Dateinamen als Titel.
 */
export function findNameClashes<T extends { id: string; title: string }>(
  files: File[],
  existing: T[]
): Map<File, T[]> {
  const key = (name: string) => name.trim().toLocaleLowerCase('de');
  const byName = new Map<string, T[]>();
  for (const doc of existing)
    byName.set(key(doc.title), [...(byName.get(key(doc.title)) ?? []), doc]);
  const clashes = new Map<File, T[]>();
  for (const file of files) {
    const hits = byName.get(key(file.name));
    if (hits) clashes.set(file, hits);
  }
  return clashes;
}
