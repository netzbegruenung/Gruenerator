import { type LinkedDocRef, type WolkeFolderRef } from '@gruenerator/contracts';
import { type DragEvent } from 'react';

export interface NotebookCollection {
  id?: string;
  name: string;
  description?: string;
  documents?: { id: string; title?: string; source_type?: string | null }[];
  labels?: string[];
  wolke_folders?: WolkeFolderRef[];
  linked_docs?: LinkedDocRef[];
}

export interface NotebookEditorFormData {
  name: string;
  description: string;
}

export interface UploadedDocument {
  id: string;
  title: string;
  filename?: string;
  source?: 'wolke';
  [key: string]: unknown;
}

export const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt', '.md', '.odt', '.rtf'];
export const MAX_DOCUMENTS = 100;
export const TOTAL_STEPS = 3;

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
