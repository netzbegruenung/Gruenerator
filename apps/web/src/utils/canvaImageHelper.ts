/**
 * Canva Image Helper Utilities
 *
 * Handles image extraction and conversion from Canva designs for Alt Text generation
 */

interface CanvaDesign {
  thumbnail_url?: string;
  title?: string;
  id?: string;
  [key: string]: unknown;
}

interface ConversionResult {
  base64: string;
  metadata: {
    source: string;
    designId: string | undefined;
    title: string | undefined;
    thumbnailUrl: string | undefined;
    conversionMethod: string;
    convertedAt: string;
  };
}

interface ImagePreviewOptions {
  width?: number;
  height?: number;
  format?: string;
}

interface ImageSizeValidation {
  isValid: boolean;
  sizeMB: number;
  maxSizeMB: number;
  message: string;
}

/**
 * Converts an image URL to base64 string
 * @param imageUrl - URL of the image to convert
 * @returns Base64 encoded string (without data URL prefix)
 */
export const imageUrlToBase64 = async (imageUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx?.drawImage(img, 0, 0);

        const dataURL = canvas.toDataURL('image/png');

        const base64String = dataURL.split(',')[1];

        resolve(base64String);
      } catch (error: unknown) {
        const err = error as Error;
        reject(new Error(`Failed to convert image to base64: ${err.message}`));
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image from URL'));
    };

    img.src = imageUrl;
  });
};

/**
 * Converts an image URL to base64 using fetch (alternative method for CORS issues)
 * @param imageUrl - URL of the image to convert
 * @returns Base64 encoded string (without data URL prefix)
 */
export const fetchImageAsBase64 = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl, {
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const base64String = (reader.result as string).split(',')[1];
          resolve(base64String);
        } catch (error: unknown) {
          const err = error as Error;
          reject(new Error(`Failed to convert blob to base64: ${err.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read blob as data URL'));
      };

      reader.readAsDataURL(blob);
    });
  } catch (error: unknown) {
    const err = error as Error;
    throw new Error(`Failed to fetch image: ${err.message}`);
  }
};

/**
 * Converts Canva design data to image base64 with fallback methods
 * @param canvaDesign - Canva design object from API
 * @returns Object containing base64 data and metadata
 */
export const convertCanvaDesignToBase64 = async (canvaDesign: CanvaDesign): Promise<ConversionResult> => {
  const { thumbnail_url, title, id } = canvaDesign;

  if (!thumbnail_url) {
    throw new Error('No thumbnail URL available for this design');
  }

  console.log(`[canvaImageHelper] Converting Canva design "${title}" to base64`);

  let base64Data;
  let conversionMethod;

  try {
    base64Data = await imageUrlToBase64(thumbnail_url);
    conversionMethod = 'canvas';
  } catch (canvasError: unknown) {
    const canvasErr = canvasError as Error;
    console.warn(`[canvaImageHelper] Canvas method failed, trying fetch method:`, canvasErr.message);

    try {
      base64Data = await fetchImageAsBase64(thumbnail_url);
      conversionMethod = 'fetch';
    } catch (fetchError: unknown) {
      const fetchErr = fetchError as Error;
      console.error(`[canvaImageHelper] Both conversion methods failed:`, {
        canvas: canvasErr.message,
        fetch: fetchErr.message
      });
      throw new Error(`Failed to convert image: ${fetchErr.message}`);
    }
  }

  console.log(`[canvaImageHelper] Successfully converted using ${conversionMethod} method`);

  return {
    base64: base64Data,
    metadata: {
      source: 'canva',
      designId: id,
      title: title,
      thumbnailUrl: thumbnail_url,
      conversionMethod: conversionMethod,
      convertedAt: new Date().toISOString()
    }
  };
};

/**
 * Validates if a Canva design has a usable image
 * @param canvaDesign - Canva design object
 * @returns True if design has a valid image
 */
export const hasValidImage = (canvaDesign: CanvaDesign | null | undefined): boolean => {
  if (!canvaDesign || typeof canvaDesign !== 'object') {
    return false;
  }

  const { thumbnail_url } = canvaDesign;

  if (!thumbnail_url || typeof thumbnail_url !== 'string' || thumbnail_url.trim() === '') {
    return false;
  }

  try {
    new URL(thumbnail_url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Preprocesses Canva designs to filter out those without valid images
 * @param designs - Array of Canva design objects
 * @returns Filtered array of designs with valid images
 */
export const filterDesignsWithValidImages = (designs: CanvaDesign[] | null | undefined): CanvaDesign[] => {
  if (!Array.isArray(designs)) {
    return [];
  }

  return designs.filter(design => hasValidImage(design));
};

/**
 * Creates a preview URL for a Canva design image with optional size parameters
 * @param canvaDesign - Canva design object
 * @param options - Options for image preview
 * @returns Preview URL
 */
export const getCanvaImagePreviewUrl = (canvaDesign: CanvaDesign, options: ImagePreviewOptions = {}): string | null => {
  const { thumbnail_url } = canvaDesign;

  if (!hasValidImage(canvaDesign)) {
    return null;
  }

  return thumbnail_url;
};

/**
 * Error types for better error handling
 */
export const CANVA_IMAGE_ERRORS = {
  NO_THUMBNAIL: 'NO_THUMBNAIL',
  INVALID_URL: 'INVALID_URL',
  CORS_ERROR: 'CORS_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONVERSION_ERROR: 'CONVERSION_ERROR'
};

/**
 * Creates a standardized error object for Canva image operations
 * @param {string} type - Error type from CANVA_IMAGE_ERRORS
 * @param {string} message - Error message
 * @param {Object} details - Additional error details
 * @returns {Error} Standardized error object
 */
interface CanvaImageError extends Error {
  type: string;
  details: Record<string, unknown>;
}

export const createCanvaImageError = (type: string, message: string, details: Record<string, unknown> = {}): CanvaImageError => {
  const error = new Error(message) as CanvaImageError;
  error.type = type;
  error.details = details;
  return error;
};

/**
 * Estimates the size of a base64 string in MB
 * @param base64String - Base64 encoded string
 * @returns Size in megabytes
 */
export const estimateBase64Size = (base64String: string | null | undefined): number => {
  if (!base64String || typeof base64String !== 'string') {
    return 0;
  }

  const sizeInBytes = (base64String.length * 3) / 4;
  const sizeInMB = sizeInBytes / (1024 * 1024);

  return Math.round(sizeInMB * 100) / 100;
};

/**
 * Validates if a base64 image is within size limits for Claude API
 * @param base64String - Base64 encoded string
 * @param maxSizeMB - Maximum size in MB (default: 5MB)
 * @returns Validation result
 */
export const validateImageSize = (base64String: string | null | undefined, maxSizeMB = 5): ImageSizeValidation => {
  const sizeMB = estimateBase64Size(base64String);

  return {
    isValid: sizeMB <= maxSizeMB,
    sizeMB: sizeMB,
    maxSizeMB: maxSizeMB,
    message: sizeMB > maxSizeMB
      ? `Image size (${sizeMB}MB) exceeds maximum allowed size (${maxSizeMB}MB)`
      : 'Image size is valid'
  };
};
