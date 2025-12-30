/**
 * Canva Image Helper Utilities
 *
 * Handles image extraction and conversion from Canva designs for Alt Text generation
 */

/**
 * Converts an image URL to base64 string
 * @param {string} imageUrl - URL of the image to convert
 * @returns {Promise<string>} Base64 encoded string (without data URL prefix)
 */
export const imageUrlToBase64 = async (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        ctx.drawImage(img, 0, 0);

        const dataURL = canvas.toDataURL('image/png');

        const base64String = dataURL.split(',')[1];

        resolve(base64String);
      } catch (error) {
        reject(new Error(`Failed to convert image to base64: ${error.message}`));
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
 * @param {string} imageUrl - URL of the image to convert
 * @returns {Promise<string>} Base64 encoded string (without data URL prefix)
 */
export const fetchImageAsBase64 = async (imageUrl) => {
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
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } catch (error) {
          reject(new Error(`Failed to convert blob to base64: ${error.message}`));
        }
      };

      reader.onerror = () => {
        reject(new Error('Failed to read blob as data URL'));
      };

      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Failed to fetch image: ${error.message}`);
  }
};

/**
 * Converts Canva design data to image base64 with fallback methods
 * @param {Object} canvaDesign - Canva design object from API
 * @returns {Promise<Object>} Object containing base64 data and metadata
 */
export const convertCanvaDesignToBase64 = async (canvaDesign) => {
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
  } catch (canvasError) {
    console.warn(`[canvaImageHelper] Canvas method failed, trying fetch method:`, canvasError.message);

    try {
      base64Data = await fetchImageAsBase64(thumbnail_url);
      conversionMethod = 'fetch';
    } catch (fetchError) {
      console.error(`[canvaImageHelper] Both conversion methods failed:`, {
        canvas: canvasError.message,
        fetch: fetchError.message
      });
      throw new Error(`Failed to convert image: ${fetchError.message}`);
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
 * @param {Object} canvaDesign - Canva design object
 * @returns {boolean} True if design has a valid image
 */
export const hasValidImage = (canvaDesign) => {
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
 * @param {Array} designs - Array of Canva design objects
 * @returns {Array} Filtered array of designs with valid images
 */
export const filterDesignsWithValidImages = (designs) => {
  if (!Array.isArray(designs)) {
    return [];
  }

  return designs.filter(design => hasValidImage(design));
};

/**
 * Creates a preview URL for a Canva design image with optional size parameters
 * @param {Object} canvaDesign - Canva design object
 * @param {Object} options - Options for image preview
 * @param {number} options.width - Desired width
 * @param {number} options.height - Desired height
 * @param {string} options.format - Image format (optional)
 * @returns {string} Preview URL
 */
export const getCanvaImagePreviewUrl = (canvaDesign, options = {}) => {
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
export const createCanvaImageError = (type, message, details = {}) => {
  const error = new Error(message);
  error.type = type;
  error.details = details;
  return error;
};

/**
 * Estimates the size of a base64 string in MB
 * @param {string} base64String - Base64 encoded string
 * @returns {number} Size in megabytes
 */
export const estimateBase64Size = (base64String) => {
  if (!base64String || typeof base64String !== 'string') {
    return 0;
  }

  const sizeInBytes = (base64String.length * 3) / 4;
  const sizeInMB = sizeInBytes / (1024 * 1024);

  return Math.round(sizeInMB * 100) / 100;
};

/**
 * Validates if a base64 image is within size limits for Claude API
 * @param {string} base64String - Base64 encoded string
 * @param {number} maxSizeMB - Maximum size in MB (default: 5MB)
 * @returns {Object} Validation result
 */
export const validateImageSize = (base64String, maxSizeMB = 5) => {
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
