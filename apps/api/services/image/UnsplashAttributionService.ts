/**
 * Unsplash Attribution Service
 * Parses Unsplash image filenames and generates attribution data
 *
 * Filename pattern: {photographer-name}-{photo-id}-unsplash.jpg
 * Example: benjamin-jopen-2SfssudtyIA-unsplash.jpg
 */

import { env } from '../../config/env.js';
import { buildUnsplashUrls as buildUrlsWithUTM } from '../../utils/unsplashUtils.js';

import type {
  UnsplashParsedFilename,
  UnsplashUrls,
  UnsplashAttribution,
  ImageWithAttribution,
} from './types.js';

export class UnsplashAttributionService {
  private readonly UNSPLASH_SUFFIX = '-unsplash.jpg';
  private readonly DEFAULT_PHOTOGRAPHER_SEGMENTS = 2;

  /**
   * Parse an Unsplash filename to extract photographer slug and photo ID
   * Unsplash IDs are 11 characters and may contain hyphens and underscores
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

    // An id may itself start with a hyphen ("--E6jqIGzgOY" leaves an empty segment);
    // a one-word photographer ("absolutvision-WYd_PkCa1BY") has the id right after it.
    const looksLikeId = (segment: string) => segment === '' || /[A-Z0-9_]/.test(segment);
    let photoIdStartIndex = parts.findIndex((segment, i) => i > 0 && looksLikeId(segment));
    if (photoIdStartIndex === -1) {
      photoIdStartIndex = Math.min(this.DEFAULT_PHOTOGRAPHER_SEGMENTS, parts.length - 1);
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
   * Build Unsplash URLs for a photo with UTM parameters
   * Uses utility function to ensure compliance with Unsplash API guidelines
   */
  buildUnsplashUrls(photoId: string, photographerSlug: string): UnsplashUrls {
    return buildUrlsWithUTM(photoId, photographerSlug);
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
      license: 'Unsplash License',
      downloadLocation: `https://api.unsplash.com/photos/${photoId}/download?client_id=${env.UNSPLASH_ACCESS_KEY ?? 'demo'}`,
    };
  }

  /**
   * Enhance an image object with attribution data
   */
  enhanceWithAttribution(image: {
    filename: string;
    [key: string]: unknown;
  }): ImageWithAttribution {
    const attribution = this.getAttribution(image.filename);

    return {
      ...image,
      filename: image.filename,
      path: `/api/image-picker/stock-image/${image.filename}`,
      attribution: attribution || {
        photographer: 'Unknown',
        license: 'Unknown',
      },
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

export const enhanceWithAttribution = (image: { filename: string; [key: string]: unknown }) =>
  unsplashAttributionService.enhanceWithAttribution(image);
