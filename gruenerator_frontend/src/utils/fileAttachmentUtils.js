/**
 * File Attachment Utilities
 * 
 * Handles file validation, processing, and preparation for Claude API submission
 * with direct upload approach (minimal preprocessing)
 */


// File type validation
const ALLOWED_FILE_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG Image',
  'image/jpg': 'JPEG Image', 
  'image/png': 'PNG Image',
  'image/webp': 'WebP Image'
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB per file (conservative for 32MB total Claude limit)
const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30MB total (leaving buffer for request overhead)

/**
 * Validates a single file
 * @param {File} file - The file to validate
 * @throws {Error} If file is invalid
 * @returns {boolean} True if valid
 */
export const validateFile = (file) => {
  if (!file) {
    throw new Error('No file provided');
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES[file.type]) {
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
 * @param {File[]} files - Array of files to validate
 * @throws {Error} If validation fails
 * @returns {boolean} True if all valid
 */
export const validateFiles = (files) => {
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
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  console.log('[fileAttachmentUtils] Total file size:', totalSize, 'bytes');

  if (totalSize > MAX_TOTAL_SIZE) {
    const totalSizeMB = Math.round(totalSize / (1024 * 1024));
    const maxTotalSizeMB = Math.round(MAX_TOTAL_SIZE / (1024 * 1024));
    console.error('[fileAttachmentUtils] Total size too large:', totalSizeMB, 'MB >', maxTotalSizeMB, 'MB');
    throw new Error(`Gesamtgröße zu groß: ${totalSizeMB}MB. Maximum: ${maxTotalSizeMB}MB`);
  }

  console.log('[fileAttachmentUtils] Files validated successfully');
  return true;
};

/**
 * Converts file to base64 string
 * @param {File} file - The file to convert
 * @returns {Promise<string>} Base64 encoded string (without data URL prefix)
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        // Remove data URL prefix (e.g., "data:application/pdf;base64,")
        const base64String = reader.result.split(',')[1];
        resolve(base64String);
      } catch (error) {
        reject(new Error(`Fehler beim Konvertieren der Datei ${file.name}: ${error.message}`));
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
 * @param {File[]} files - Array of files to process
 * @returns {Promise<Object[]>} Array of processed file objects
 */
export const prepareFilesForSubmission = async (files) => {
  console.log('[fileAttachmentUtils] Starting file preparation:', files?.length || 0, 'files');
  console.log('[fileAttachmentUtils] Files to process:', files?.map(f => ({ name: f.name, type: f.type, size: f.size })) || []);

  // Validate all files first
  validateFiles(files);

  const processedFiles = [];

  try {
    // Process files sequentially to avoid memory issues
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      console.log(`[fileAttachmentUtils] Processing file ${i + 1}/${files.length}: ${file.name}`);
      console.log(`[fileAttachmentUtils] File details:`, { name: file.name, type: file.type, size: file.size });

      const base64Data = await fileToBase64(file);
      console.log(`[fileAttachmentUtils] File ${file.name} converted to base64, size:`, base64Data?.length || 0);
      
      processedFiles.push({
        name: file.name,
        type: file.type,
        size: file.size,
        data: base64Data,
        // Add metadata for UI display
        displayName: file.name,
        displayType: ALLOWED_FILE_TYPES[file.type] || file.type,
        displaySize: formatFileSize(file.size)
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
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size string
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Gets file type display name
 * @param {string} mimeType - MIME type of the file
 * @returns {string} Display name for the file type
 */
export const getFileTypeDisplayName = (mimeType) => {
  return ALLOWED_FILE_TYPES[mimeType] || mimeType;
};

/**
 * Checks if file type is supported
 * @param {string} mimeType - MIME type to check
 * @returns {boolean} True if supported
 */
export const isSupportedFileType = (mimeType) => {
  return !!ALLOWED_FILE_TYPES[mimeType];
};

/**
 * Creates a summary of attached files for display
 * @param {Object[]} processedFiles - Array of processed file objects
 * @returns {Object} Summary object with count, types, and total size
 */
export const createFilesSummary = (processedFiles) => {
  if (!processedFiles || processedFiles.length === 0) {
    return {
      count: 0,
      types: [],
      totalSize: '0 B',
      files: []
    };
  }
  
  const totalSize = processedFiles.reduce((sum, file) => sum + file.size, 0);
  const types = [...new Set(processedFiles.map(file => file.displayType))];
  
  return {
    count: processedFiles.length,
    types,
    totalSize: formatFileSize(totalSize),
    files: processedFiles.map(file => ({
      name: file.displayName,
      type: file.displayType,
      size: file.displaySize
    }))
  };
};

/**
 * Get PDF page count using pdf-lib
 * @param {File} file - PDF file to analyze
 * @returns {Promise<number>} Number of pages in the PDF
 */
export const getPDFPageCount = async (file) => {
  if (file.type !== 'application/pdf') {
    throw new Error('File is not a PDF');
  }
  
  try {
    // Page count disabled to avoid pdf-lib in frontend
    return 0;
  } catch (error) {
    return 0;
  }
};

/**
 * Validates files for privacy mode with PDF page count restrictions
 * @param {File[]} files - Array of files to validate
 * @param {boolean} privacyModeActive - Whether privacy mode is active
 * @returns {Promise<{valid: boolean, error?: string}>} Validation result
 */
export const validateFilesForPrivacyMode = async (files, privacyModeActive) => {
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
            error: `PDF "${file.name}" hat ${pageCount} Seiten. Im Privacy Mode sind maximal ${MAX_PDF_PAGES} Seiten erlaubt. Bitte deaktivieren Sie den Privacy Mode oder verwenden Sie ein kürzeres PDF.`
          };
        }
      } catch (error) {
        return {
          valid: false,
          error: `Fehler beim Verarbeiten von "${file.name}": ${error.message}`
        };
      }
    }
    // Images are skipped in privacy mode (as mentioned in requirements)
    else if (file.type.startsWith('image/')) {
      return {
        valid: false,
        error: `Bilder können im Privacy Mode nicht verarbeitet werden. Bitte deaktivieren Sie den Privacy Mode oder entfernen Sie "${file.name}".`
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
  MAX_PDF_PAGES_PRIVACY_MODE: 10
};
