/**
 * Unsplash Attribution Service
 * Parses Unsplash image filenames and generates attribution data
 *
 * Filename pattern: {photographer-name}-{photo-id}-unsplash.jpg
 * Example: benjamin-jopen-2SfssudtyIA-unsplash.jpg
 */

import type {
  UnsplashParsedFilename,
  UnsplashUrls,
  UnsplashAttribution,
  ImageWithAttribution
} from './types.js';

export class UnsplashAttributionService {
  private readonly UNSPLASH_SUFFIX = '-unsplash.jpg';
  private readonly DEFAULT_PHOTOGRAPHER_SEGMENTS = 2;

  /**
   * Parse an Unsplash filename to extract photographer slug and photo ID
   * Unsplash IDs are alphanumeric only (no hyphens), typically 10-11 chars
   */
  parseFilename(filename: string): UnsplashParsedFilename | null {
    if (!filename || typeof filename !== 'string') {
      return null;
    }

    if (!filename.endsWith(this.UNSPLASH_SUFFIX)) {
      return null;
    }

    const baseName = filename.slice(0, -this.UNSPLASH_SUFFIX.length);
    const parts = baseName.split('-');

    if (parts.length < 2) {
      return null;
    }

    let photoIdStartIndex = this.DEFAULT_PHOTOGRAPHER_SEGMENTS;

    for (let i = 2; i < parts.length; i++) {
      const segment = parts[i];
      const hasUppercase = /[A-Z]/.test(segment);
      const hasNumber = /[0-9]/.test(segment);
      const isMixedCase = /[a-z]/.test(segment) && hasUppercase;

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
   * Convert a hyphenated slug to a properly formatted name
   */
  formatPhotographerName(slug: string): string {
    if (!slug) return '';

    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Build Unsplash URLs for a photo
   */
  buildUnsplashUrls(photoId: string, photographerSlug: string): UnsplashUrls {
    return {
      profileUrl: `https://unsplash.com/@${photographerSlug}`,
      photoUrl: `https://unsplash.com/photos/${photoId}`
    };
  }

  /**
   * Generate complete attribution data for an Unsplash image
   */
  getAttribution(filename: string): UnsplashAttribution | null {
    const parsed = this.parseFilename(filename);
    if (!parsed) {
      return null;
    }

    const { photographerSlug, photoId } = parsed;
    const urls = this.buildUnsplashUrls(photoId, photographerSlug);

    return {
      photographer: this.formatPhotographerName(photographerSlug),
      photographerSlug,
      photoId,
      profileUrl: urls.profileUrl,
      photoUrl: urls.photoUrl,
      license: 'Unsplash License'
    };
  }

  /**
   * Enhance an image object with attribution data
   */
  enhanceWithAttribution(image: { filename: string; [key: string]: any }): ImageWithAttribution {
    const attribution = this.getAttribution(image.filename);

    return {
      ...image,
      filename: image.filename,
      path: `/api/image-picker/stock-image/${image.filename}`,
      attribution: attribution || {
        photographer: 'Unknown',
        license: 'Unknown'
      }
    };
  }
}

export const unsplashAttributionService = new UnsplashAttributionService();

export const parseFilename = (filename: string) =>
  unsplashAttributionService.parseFilename(filename);

export const formatPhotographerName = (slug: string) =>
  unsplashAttributionService.formatPhotographerName(slug);

export const buildUnsplashUrls = (photoId: string, photographerSlug: string) =>
  unsplashAttributionService.buildUnsplashUrls(photoId, photographerSlug);

export const getAttribution = (filename: string) =>
  unsplashAttributionService.getAttribution(filename);

export const enhanceWithAttribution = (image: { filename: string; [key: string]: any }) =>
  unsplashAttributionService.enhanceWithAttribution(image);
