/**
 * Utility for parsing Unsplash image filenames and generating attribution data.
 *
 * Filename pattern: {photographer-name}-{photo-id}-unsplash.jpg
 * Example: benjamin-jopen-2SfssudtyIA-unsplash.jpg
 */

/**
 * Parse an Unsplash filename to extract photographer slug and photo ID.
 * Unsplash IDs are alphanumeric only (no hyphens), typically 10-11 chars.
 * @param {string} filename - The image filename
 * @returns {{ photographerSlug: string, photoId: string } | null}
 */
function parseFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }

  const unsplashSuffix = '-unsplash.jpg';
  if (!filename.endsWith(unsplashSuffix)) {
    return null;
  }

  const baseName = filename.slice(0, -unsplashSuffix.length);
  const parts = baseName.split('-');

  if (parts.length < 2) {
    return null;
  }

  // Find where photographer name ends and photo ID begins
  // Photographer names are lowercase, photo IDs have mixed case or numbers
  let photoIdStartIndex = 2; // Default: assume first-last name (2 segments)

  // Look for first segment that looks like an ID (mixed case, contains numbers, or uppercase start)
  for (let i = 2; i < parts.length; i++) {
    const segment = parts[i];
    const hasUppercase = /[A-Z]/.test(segment);
    const hasNumber = /[0-9]/.test(segment);
    const isMixedCase = /[a-z]/.test(segment) && hasUppercase;

    // If segment has numbers, uppercase letters, or mixed case - it's likely the ID start
    if (hasNumber || hasUppercase || isMixedCase) {
      photoIdStartIndex = i;
      break;
    }
  }

  const photoId = parts.slice(photoIdStartIndex).join('-');
  const photographerSlug = parts.slice(0, photoIdStartIndex).join('-');

  if (!photoId || !photographerSlug) {
    return null;
  }

  return { photographerSlug, photoId };
}

/**
 * Convert a hyphenated slug to a properly formatted name.
 * @param {string} slug - The photographer slug (e.g., "benjamin-jopen")
 * @returns {string} - Formatted name (e.g., "Benjamin Jopen")
 */
function formatPhotographerName(slug) {
  if (!slug) return '';

  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Build Unsplash URLs for a photo.
 * @param {string} photoId - The Unsplash photo ID
 * @param {string} photographerSlug - The photographer's slug
 * @returns {{ profileUrl: string, photoUrl: string }}
 */
function buildUnsplashUrls(photoId, photographerSlug) {
  return {
    profileUrl: `https://unsplash.com/@${photographerSlug}`,
    photoUrl: `https://unsplash.com/photos/${photoId}`
  };
}

/**
 * Generate complete attribution data for an Unsplash image.
 * @param {string} filename - The image filename
 * @returns {{ photographer: string, photographerSlug: string, photoId: string, profileUrl: string, photoUrl: string, license: string } | null}
 */
function getAttribution(filename) {
  const parsed = parseFilename(filename);
  if (!parsed) {
    return null;
  }

  const { photographerSlug, photoId } = parsed;
  const urls = buildUnsplashUrls(photoId, photographerSlug);

  return {
    photographer: formatPhotographerName(photographerSlug),
    photographerSlug,
    photoId,
    profileUrl: urls.profileUrl,
    photoUrl: urls.photoUrl,
    license: 'Unsplash License'
  };
}

/**
 * Enhance an image object with attribution data.
 * @param {Object} image - Image object from catalog
 * @returns {Object} - Enhanced image with attribution
 */
function enhanceWithAttribution(image) {
  const attribution = getAttribution(image.filename);

  return {
    ...image,
    path: `/api/image-picker/stock-image/${image.filename}`,
    attribution: attribution || {
      photographer: 'Unknown',
      license: 'Unknown'
    }
  };
}

module.exports = {
  parseFilename,
  formatPhotographerName,
  buildUnsplashUrls,
  getAttribution,
  enhanceWithAttribution
};
