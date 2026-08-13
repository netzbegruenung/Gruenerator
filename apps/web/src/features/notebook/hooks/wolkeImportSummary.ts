/**
 * Turns the raw per-file results of a Wolke import into something a person can
 * read.
 *
 * Before this existed, both sync paths looked only at `success` and at
 * `reason === 'already_imported'`. Every other outcome — an unreadable PDF, a
 * file over the size cap, a download that threw — was dropped on the floor: the
 * notebook showed "3/1000" and not a single word about the four files that had
 * failed. "The Grünerator doesn't pull everything" was in truth "these files
 * failed and nobody was told".
 */
import { type WolkeFile, type WolkeImportResult } from '../../../stores/documentsStore';

/** Outcomes that are not failures — the file is in the notebook either way. */
const BENIGN_REASONS = new Set(['already_imported', 'up_to_date']);

/**
 * Reasons `WolkeSyncService.processFile` and the import endpoint can report.
 * Anything unknown falls back to a generic label rather than leaking a raw
 * exception message into the UI.
 */
const REASON_LABELS: Record<string, string> = {
  no_extractable_text: 'kein Text auslesbar',
  no_content: 'Datei ist leer',
  unsupported_file_type: 'Format wird nicht unterstützt',
  file_too_large: 'größer als 100 MB',
  processing_failed: 'Verarbeitung fehlgeschlagen',
};

export function wolkeFailureLabel(reason: string | undefined): string {
  if (!reason) return 'Verarbeitung fehlgeschlagen';
  return REASON_LABELS[reason] ?? 'Verarbeitung fehlgeschlagen';
}

export interface WolkeImportFailure {
  filename: string;
  reason: string | undefined;
  label: string;
}

export interface WolkeImportedDocument {
  id: string;
  title: string;
}

export interface WolkeImportSummary {
  imported: WolkeImportedDocument[];
  /** Files that were already in the notebook — still part of the folder's contents. */
  alreadyImported: WolkeImportedDocument[];
  failures: WolkeImportFailure[];
}

export function summarizeWolkeImport(results: WolkeImportResult[]): WolkeImportSummary {
  const imported: WolkeImportedDocument[] = [];
  const alreadyImported: WolkeImportedDocument[] = [];
  const failures: WolkeImportFailure[] = [];

  for (const r of results) {
    if (r.success && typeof r.documentId === 'string') {
      imported.push({ id: r.documentId, title: r.filename });
      continue;
    }
    if (r.reason && BENIGN_REASONS.has(r.reason)) {
      // A benign skip without a documentId tells us nothing usable — the file is
      // neither new nor resolvable, so it stays out of the folder's id list.
      if (typeof r.documentId === 'string') {
        alreadyImported.push({ id: r.documentId, title: r.filename });
      }
      continue;
    }
    failures.push({ filename: r.filename, reason: r.reason, label: wolkeFailureLabel(r.reason) });
  }

  return { imported, alreadyImported, failures };
}

/** Files in the folder the import never even offered, grouped by extension. */
export function unsupportedFileNotice(files: WolkeFile[]): string | null {
  const unsupported = files.filter((f) => !f.isDirectory && !f.isSupported);
  if (unsupported.length === 0) return null;

  const extensions = [
    ...new Set(unsupported.map((f) => f.fileExtension).filter((ext) => ext.length > 0)),
  ].sort();
  const extensionList = extensions.length > 0 ? ` (${extensions.join(', ')})` : '';

  return unsupported.length === 1
    ? `1 Datei in einem nicht unterstützten Format${extensionList} übersprungen.`
    : `${unsupported.length} Dateien in nicht unterstützten Formaten${extensionList} übersprungen.`;
}

const MAX_NAMED_FAILURES = 3;

/** One sentence naming what failed and why — null when everything worked. */
export function failureNotice(failures: WolkeImportFailure[]): string | null {
  if (failures.length === 0) return null;

  const named = failures
    .slice(0, MAX_NAMED_FAILURES)
    .map((f) => `„${f.filename}" (${f.label})`)
    .join(', ');
  const rest = failures.length - MAX_NAMED_FAILURES;
  const tail = rest > 0 ? ` und ${rest} weitere` : '';

  return failures.length === 1
    ? `1 Datei konnte nicht importiert werden: ${named}.`
    : `${failures.length} Dateien konnten nicht importiert werden: ${named}${tail}.`;
}

/** Joins the notices a sync produced into the single line the UI shows. */
export function joinNotices(notices: (string | null)[]): string | null {
  const kept = notices.filter((n): n is string => Boolean(n));
  return kept.length > 0 ? kept.join(' ') : null;
}
