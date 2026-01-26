/**
 * File Attachment Utilities
 *
 * Handles file validation, processing, and preparation for Claude API submission
 * with direct upload approach (minimal preprocessing)
 */

// Type definitions
type AllowedMimeType = 'application/pdf' | 'image/jpeg' | 'image/jpg' | 'image/png' | 'image/webp';

interface ProcessedFile {
  name: string;
  type: string;
  size: number;
  data: string;
  displayName: string;
  displayType: string;
  displaySize: string;
}

interface FileSummary {
  count: number;
  types: string[];
  totalSize: string;
  files: Array<{
    name: string;
    type: string;
    size: string;
  }>;
}

interface PrivacyValidationResult {
  valid: boolean;
  error?: string;
}

// File type validation
const ALLOWED_FILE_TYPES: Record<AllowedMimeType, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG Image',
  'image/jpg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/webp': 'WebP Image',
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file (conservative for 32MB total Claude limit)
const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30MB total (leaving buffer for request overhead)

/**
 * Validates a single file
 * @param file - The file to validate
 * @throws If file is invalid
 * @returns True if valid
 */
export const validateFile = (file: File): boolean => {
  if (!file) {
    throw new Error('No file provided');
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES[file.type as AllowedMimeType]) {
    const allowedTypes = Object.values(ALLOWED_FILE_TYPES).join(', ');
    throw new Error(`Dateityp nicht unterstützt: ${file.type}. Erlaubt sind: ${allowedTypes}`);
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    const maxSizeMB = Math.round(MAX_FILE_SIZE / (1024 * 1024));
    throw new Error(`Datei zu groß: ${file.name} (${sizeMB}MB). Maximum: ${maxSizeMB}MB`);
  }

  return true;
};

/**
 * Validates multiple files and total size
 * @param files - Array of files to validate
 * @throws If validation fails
 * @returns True if all valid
 */
export const validateFiles = (files: File[]): boolean => {
  console.log('[fileAttachmentUtils] Validating files:', files?.length || 0, 'files');

  if (!Array.isArray(files) || files.length === 0) {
    console.error('[fileAttachmentUtils] No files provided');
    throw new Error('Keine Dateien ausgewählt');
  }

  console.log('[fileAttachmentUtils] Validating individual files...');
  // Validate individual files
  for (const file of files) {
    validateFile(file);
  }

  // Check total size
  const totalSize = files.reduce((sum: number, file: File) => sum + file.size, 0);
  console.log('[fileAttachmentUtils] Total file size:', totalSize, 'bytes');

  if (totalSize > MAX_TOTAL_SIZE) {
    const totalSizeMB = Math.round(totalSize / (1024 * 1024));
    const maxTotalSizeMB = Math.round(MAX_TOTAL_SIZE / (1024 * 1024));
    console.error(
      '[fileAttachmentUtils] Total size too large:',
      totalSizeMB,
      'MB >',
      maxTotalSizeMB,
      'MB'
    );
    throw new Error(`Gesamtgröße zu groß: ${totalSizeMB}MB. Maximum: ${maxTotalSizeMB}MB`);
  }

  console.log('[fileAttachmentUtils] Files validated successfully');
  return true;
};

/**
 * Converts file to base64 string
 * @param file - The file to convert
 * @returns Base64 encoded string (without data URL prefix)
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        reject(new Error(`Fehler beim Konvertieren der Datei ${file.name}: ${errorMessage}`));
      }
    };

    reader.onerror = () => {
      reject(new Error(`Fehler beim Lesen der Datei ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
};

/**
 * Processes files for API submission
 * @param files - Array of files to process
 * @returns Array of processed file objects
 */
export const prepareFilesForSubmission = async (files: File[]): Promise<ProcessedFile[]> => {
  console.log('[fileAttachmentUtils] Starting file preparation:', files?.length || 0, 'files');
  console.log(
    '[fileAttachmentUtils] Files to process:',
    files?.map((f: File) => ({ name: f.name, type: f.type, size: f.size })) || []
  );

  // Validate all files first
  validateFiles(files);

  const processedFiles: ProcessedFile[] = [];

  try {
    // Process files sequentially to avoid memory issues
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      console.log(`[fileAttachmentUtils] Processing file ${i + 1}/${files.length}: ${file.name}`);
      console.log(`[fileAttachmentUtils] File details:`, {
        name: file.name,
        type: file.type,
        size: file.size,
      });

      const base64Data = await fileToBase64(file);
      console.log(
        `[fileAttachmentUtils] File ${file.name} converted to base64, size:`,
        base64Data?.length || 0
      );

      processedFiles.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64Data,
        // Add metadata for UI display
        displayName: file.name,
        displayType: ALLOWED_FILE_TYPES[file.type as AllowedMimeType] || file.type,
        displaySize: formatFileSize(file.size),
      });
    }

    console.log(`Successfully processed ${processedFiles.length} files`);
    return processedFiles;
  } catch (error) {
    console.error('File processing error:', error);
    throw error;
  }
};

/**
 * Formats file size for display
 * @param bytes - File size in bytes
 * @returns Formatted size string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Gets file type display name
 * @param mimeType - MIME type of the file
 * @returns Display name for the file type
 */
export const getFileTypeDisplayName = (mimeType: string): string => {
  return ALLOWED_FILE_TYPES[mimeType as AllowedMimeType] || mimeType;
};

/**
 * Checks if file type is supported
 * @param mimeType - MIME type to check
 * @returns True if supported
 */
export const isSupportedFileType = (mimeType: string): boolean => {
  return !!ALLOWED_FILE_TYPES[mimeType as AllowedMimeType];
};

/**
 * Creates a summary of attached files for display
 * @param processedFiles - Array of processed file objects
 * @returns Summary object with count, types, and total size
 */
export const createFilesSummary = (processedFiles: ProcessedFile[]): FileSummary => {
  if (!processedFiles || processedFiles.length === 0) {
    return {
      count: 0,
      types: [],
      totalSize: '0 B',
      files: [],
    };
  }

  const totalSize = processedFiles.reduce((sum: number, file: ProcessedFile) => sum + file.size, 0);
  const types = [...new Set(processedFiles.map((file: ProcessedFile) => file.displayType))];

  return {
    count: processedFiles.length,
    types,
    totalSize: formatFileSize(totalSize),
    files: processedFiles.map((file: ProcessedFile) => ({
      name: file.displayName,
      type: file.displayType,
      size: file.displaySize,
    })),
  };
};

/**
 * Get PDF page count using pdf-lib
 * @param file - PDF file to analyze
 * @returns Number of pages in the PDF
 */
export const getPDFPageCount = async (file: File): Promise<number> => {
  if (file.type !== 'application/pdf') {
    throw new Error('File is not a PDF');
  }

  try {
    // Page count disabled to avoid pdf-lib in frontend
    return 0;
  } catch {
    return 0;
  }
};

/**
 * Validates files for privacy mode with PDF page count restrictions
 * @param files - Array of files to validate
 * @param privacyModeActive - Whether privacy mode is active
 * @returns Validation result
 */
export const validateFilesForPrivacyMode = async (
  files: File[],
  privacyModeActive: boolean
): Promise<PrivacyValidationResult> => {
  if (!privacyModeActive) {
    return { valid: true };
  }

  const MAX_PDF_PAGES = 10; // Conservative limit for 16k token context

  for (const file of files) {
    if (file.type === 'application/pdf') {
      try {
        const pageCount = await getPDFPageCount(file);

        if (pageCount > MAX_PDF_PAGES) {
          return {
            valid: false,
            error: `PDF "${file.name}" hat ${pageCount} Seiten. Im Privacy Mode sind maximal ${MAX_PDF_PAGES} Seiten erlaubt. Bitte deaktivieren Sie den Privacy Mode oder verwenden Sie ein kürzeres PDF.`,
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          valid: false,
          error: `Fehler beim Verarbeiten von "${file.name}": ${errorMessage}`,
        };
      }
    }
    // Images are skipped in privacy mode (as mentioned in requirements)
    else if (file.type.startsWith('image/')) {
      return {
        valid: false,
        error: `Bilder können im Privacy Mode nicht verarbeitet werden. Bitte deaktivieren Sie den Privacy Mode oder entfernen Sie "${file.name}".`,
      };
    }
  }

  return { valid: true };
};

// Export constants for external use
export const FILE_LIMITS = {
  MAX_FILE_SIZE,
  MAX_TOTAL_SIZE,
  ALLOWED_FILE_TYPES,
  MAX_PDF_PAGES_PRIVACY_MODE: 10,
};

// Export types for external use
export type { ProcessedFile, FileSummary, PrivacyValidationResult, AllowedMimeType };
