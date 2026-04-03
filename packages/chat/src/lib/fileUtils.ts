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
  | 'text/markdown'
  | 'text/csv'
  | 'text/html'
  | 'text/xml'
  | 'text/javascript'
  | 'text/x-python'
  | 'application/json'
  | 'application/xml'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'application/vnd.ms-excel'
  | 'application/vnd.oasis.opendocument.text'
  | 'application/vnd.oasis.opendocument.spreadsheet';

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
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
  'text/html': 'HTML',
  'text/xml': 'XML',
  'text/javascript': 'JavaScript',
  'text/x-python': 'Python',
  'application/json': 'JSON',
  'application/xml': 'XML',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.oasis.opendocument.text': 'OpenDocument',
  'application/vnd.oasis.opendocument.spreadsheet': 'ODS Spreadsheet',
};

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_TOTAL_SIZE = 30 * 1024 * 1024;
const MAX_FILES = 10;

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export function validateFile(file: File): void {
  if (!file) {
    throw new Error('Keine Datei ausgewählt');
  }

  if (!isSupportedFileType(file.type, file.name)) {
    const allowedTypes = Object.values(ALLOWED_FILE_TYPES).join(', ');
    throw new Error(
      `Dateityp nicht unterstützt: ${file.type || 'unbekannt'}. Erlaubt: ${allowedTypes}`
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
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

export function getFileTypeDisplayName(mimeType: string, filename?: string): string {
  if (ALLOWED_FILE_TYPES[mimeType as AllowedMimeType]) {
    return ALLOWED_FILE_TYPES[mimeType as AllowedMimeType];
  }
  if (filename) {
    const ext = filename.split('.').pop()?.toUpperCase();
    if (ext) return ext;
  }
  return mimeType;
}

/**
 * File extensions accepted regardless of MIME type.
 * Browsers misidentify some code files (e.g. .ts → video/mp2t).
 */
const TEXT_EXTENSION_OVERRIDES = new Set([
  '.ts',
  '.tsx',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sh',
  '.sql',
  '.toml',
  '.env',
  '.log',
  '.yml',
  '.yaml',
  '.md',
  '.mdx',
  '.css',
  '.less',
  '.scss',
  '.rs',
  '.go',
  '.java',
  '.rb',
  '.php',
  '.c',
  '.cpp',
  '.h',
]);

export function isSupportedFileType(mimeType: string, filename?: string): boolean {
  if (ALLOWED_FILE_TYPES[mimeType as AllowedMimeType]) return true;
  if (filename) {
    const ext = filename.includes('.') ? `.${filename.split('.').pop()?.toLowerCase()}` : '';
    if (TEXT_EXTENSION_OVERRIDES.has(ext)) return true;
  }
  return false;
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
      displayType: getFileTypeDisplayName(file.type, file.name),
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
  const mimeTypes = Object.keys(ALLOWED_FILE_TYPES);
  const extensions = [...TEXT_EXTENSION_OVERRIDES];
  return [...mimeTypes, ...extensions].join(',');
}

export const FILE_LIMITS = {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  MAX_FILES,
  ALLOWED_FILE_TYPES,
};
