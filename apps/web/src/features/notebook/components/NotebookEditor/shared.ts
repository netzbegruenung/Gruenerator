import {
  DOCUMENT_MAX_UPLOAD_BYTES,
  DOCUMENT_UPLOAD_EXTENSIONS,
  DOCUMENT_UPLOAD_FORMAT_HINT,
  NOTEBOOK_MAX_DOCUMENTS,
  resolveDocumentUploadFormat,
  type LinkedDocRef,
  type WolkeFolderRef,
  type WordpressSiteRef,
} from '@gruenerator/contracts';
import { type DragEvent } from 'react';

export interface NotebookCollection {
  id?: string;
  name: string;
  description?: string;
  documents?: {
    id: string;
    title?: string;
    source_type?: string | null;
    status?: string | null;
    processing_error?: string | null;
  }[];
  labels?: string[];
  wolke_folders?: WolkeFolderRef[];
  linked_docs?: LinkedDocRef[];
  wordpress_sites?: WordpressSiteRef[];
}

export interface NotebookEditorFormData {
  name: string;
  description: string;
}

export interface UploadedDocument {
  id: string;
  title: string;
  filename?: string;
  source?: 'wolke' | 'wordpress';
  [key: string]: unknown;
}

/** Where a document came from — a facet of the one document list, not a separate list. */
export type DocumentSource = 'upload' | 'wolke' | 'docs' | 'wordpress';

export interface DocumentWithSource {
  doc: UploadedDocument;
  source: DocumentSource;
}

export const DOCUMENT_SOURCE_LABELS: Record<DocumentSource, string> = {
  upload: 'Upload',
  wolke: 'Wolke',
  docs: 'Docs',
  wordpress: 'WordPress',
};

export const ACCEPTED_EXTENSIONS = DOCUMENT_UPLOAD_EXTENSIONS;
export const ACCEPTED_FORMATS_HINT = DOCUMENT_UPLOAD_FORMAT_HINT;
export const MAX_DOCUMENTS = NOTEBOOK_MAX_DOCUMENTS;
export const TOTAL_STEPS = 3;

const MAX_UPLOAD_MB = Math.round(DOCUMENT_MAX_UPLOAD_BYTES / (1024 * 1024));

export interface RejectedFile {
  name: string;
  reason: string;
}

/**
 * Gate every file on its way into the staging tray. The dialog's `accept` list
 * is only a suggestion and does nothing for drag & drop, so this — not the
 * input — is what keeps unreadable files out. Rejecting here rather than at
 * upload time means the user finds out while still looking at the file.
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
      continue;
    }
    if (file.size > DOCUMENT_MAX_UPLOAD_BYTES) {
      rejected.push({ name: file.name, reason: `größer als ${MAX_UPLOAD_MB} MB` });
      continue;
    }
    accepted.push(file);
  }

  return { accepted, rejected };
}

export function describeRejectedFiles(rejected: RejectedFile[]): string {
  const listed = rejected
    .slice(0, 3)
    .map((r) => `${r.name} (${r.reason})`)
    .join(', ');
  const rest = rejected.length > 3 ? ` und ${rejected.length - 3} weitere` : '';
  return `Nicht übernommen: ${listed}${rest}. Unterstützt werden ${ACCEPTED_FORMATS_HINT} bis ${MAX_UPLOAD_MB} MB.`;
}

export function getFileTypeStyle(filename: string): { label: string; accentVia: string } {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return { label: 'PDF', accentVia: 'via-red-400/50 dark:via-red-500/40' };
    case 'docx':
      return { label: 'DOCX', accentVia: 'via-blue-400/50 dark:via-blue-500/40' };
    case 'doc':
      return { label: 'DOC', accentVia: 'via-blue-400/50 dark:via-blue-500/40' };
    case 'odt':
      return { label: 'ODT', accentVia: 'via-emerald-400/50 dark:via-emerald-500/40' };
    case 'rtf':
      return { label: 'RTF', accentVia: 'via-orange-400/50 dark:via-orange-500/40' };
    case 'md':
      return { label: 'MD', accentVia: 'via-slate-400/50 dark:via-slate-500/40' };
    case 'txt':
      return { label: 'TXT', accentVia: 'via-slate-400/50 dark:via-slate-500/40' };
    default:
      return {
        label: ext.slice(0, 4).toUpperCase() || 'FILE',
        accentVia: 'via-grey-400/50 dark:via-grey-500/40',
      };
  }
}

export function hasFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}
