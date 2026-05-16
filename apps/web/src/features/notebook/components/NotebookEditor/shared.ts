import { type WolkeFolderRef } from '@gruenerator/contracts';
import { type DragEvent } from 'react';

export type PublicOwnership = 'owner' | 'public_data';

export interface NotebookCollection {
  id?: string;
  name: string;
  description?: string;
  documents?: { id: string; title?: string; source_type?: string | null }[];
  labels?: string[];
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
  wolke_folders?: WolkeFolderRef[];
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
export const TOTAL_STEPS = 4;

export function getFileTypeStyle(filename: string): { label: string; cornerClass: string } {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'pdf':
      return { label: 'PDF', cornerClass: 'bg-red-400 dark:bg-red-700' };
    case 'docx':
      return { label: 'DOCX', cornerClass: 'bg-blue-400 dark:bg-blue-700' };
    case 'doc':
      return { label: 'DOC', cornerClass: 'bg-blue-400 dark:bg-blue-700' };
    case 'odt':
      return { label: 'ODT', cornerClass: 'bg-emerald-400 dark:bg-emerald-700' };
    case 'rtf':
      return { label: 'RTF', cornerClass: 'bg-orange-400 dark:bg-orange-700' };
    case 'md':
      return { label: 'MD', cornerClass: 'bg-slate-400 dark:bg-slate-600' };
    case 'txt':
      return { label: 'TXT', cornerClass: 'bg-slate-400 dark:bg-slate-600' };
    default:
      return {
        label: ext.slice(0, 4).toUpperCase() || 'FILE',
        cornerClass: 'bg-grey-400 dark:bg-grey-600',
      };
  }
}

export function hasFileDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}
