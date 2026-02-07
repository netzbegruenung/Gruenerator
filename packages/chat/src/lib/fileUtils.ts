/**
 * File Attachment Utilities
 *
 * Handles file validation, processing, and preparation for chat API submission.
 * Supports images for vision analysis and documents for text extraction.
 */

export type AllowedMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'text/plain'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export interface ProcessedFile {
  name: string;
  type: string;
  size: number;
  data: string;
  isImage: boolean;
  displayName: string;
  displayType: string;
  displaySize: string;
}

export interface FileSummary {
  count: number;
  types: string[];
  totalSize: string;
  files: Array<{
    name: string;
    type: string;
    size: string;
  }>;
}

const ALLOWED_FILE_TYPES: Record<AllowedMimeType, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/webp': 'WebP Image',
  'text/plain': 'Text File',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
};

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024;
const MAX_FILES = 10;

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export function validateFile(file: File): void {
  if (!file) {
    throw new Error('Keine Datei ausgewählt');
  }

  if (!ALLOWED_FILE_TYPES[file.type as AllowedMimeType]) {
    const allowedTypes = Object.values(ALLOWED_FILE_TYPES).join(', ');
    throw new Error(`Dateityp nicht unterstützt: ${file.type || 'unbekannt'}. Erlaubt: ${allowedTypes}`);
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
    throw new Error(`Datei zu groß: ${file.name} (${sizeMB}MB). Maximum: ${maxSizeMB}MB`);
  }
}

export function validateFiles(files: File[]): void {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Keine Dateien ausgewählt');
  }

  if (files.length > MAX_FILES) {
    throw new Error(`Zu viele Dateien: ${files.length}. Maximum: ${MAX_FILES} Dateien`);
  }

  for (const file of files) {
    validateFile(file);
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    const totalSizeMB = Math.round(totalSize / (1024 * 1024));
    const maxTotalSizeMB = Math.round(MAX_TOTAL_SIZE / (1024 * 1024));
    throw new Error(`Gesamtgröße zu groß: ${totalSizeMB}MB. Maximum: ${maxTotalSizeMB}MB`);
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Fehler beim Konvertieren: ${file.name}: ${errorMessage}`));
      }
    };

    reader.onerror = () => {
      reject(new Error(`Fehler beim Lesen: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getFileTypeDisplayName(mimeType: string): string {
  return ALLOWED_FILE_TYPES[mimeType as AllowedMimeType] || mimeType;
}

export function isSupportedFileType(mimeType: string): boolean {
  return !!ALLOWED_FILE_TYPES[mimeType as AllowedMimeType];
}

export async function prepareFilesForSubmission(files: File[]): Promise<ProcessedFile[]> {
  validateFiles(files);

  const processedFiles: ProcessedFile[] = [];

  for (const file of files) {
    const base64Data = await fileToBase64(file);

    processedFiles.push({
      name: file.name,
      type: file.type,
      size: file.size,
      data: base64Data,
      isImage: isImageMimeType(file.type),
      displayName: file.name,
      displayType: ALLOWED_FILE_TYPES[file.type as AllowedMimeType] || file.type,
      displaySize: formatFileSize(file.size),
    });
  }

  return processedFiles;
}

export function createFilesSummary(processedFiles: ProcessedFile[]): FileSummary {
  if (!processedFiles || processedFiles.length === 0) {
    return {
      count: 0,
      types: [],
      totalSize: '0 B',
      files: [],
    };
  }

  const totalSize = processedFiles.reduce((sum, file) => sum + file.size, 0);
  const types = [...new Set(processedFiles.map((file) => file.displayType))];

  return {
    count: processedFiles.length,
    types,
    totalSize: formatFileSize(totalSize),
    files: processedFiles.map((file) => ({
      name: file.displayName,
      type: file.displayType,
      size: file.displaySize,
    })),
  };
}

export function getAcceptedFileTypes(): string {
  return Object.keys(ALLOWED_FILE_TYPES).join(',');
}

export const FILE_LIMITS = {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILES,
  ALLOWED_FILE_TYPES,
};
