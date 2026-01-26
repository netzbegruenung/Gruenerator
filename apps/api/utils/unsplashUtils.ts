/**
 * Unsplash API Compliance Utilities
 *
 * Provides UTM parameter management and URL building utilities
 * to comply with Unsplash API attribution guidelines.
 *
 * All links back to Unsplash must include:
 * - utm_source=gruenerator
 * - utm_medium=referral
 */

const UTM_PARAMS = {
  source: 'gruenerator',
  medium: 'referral',
} as const;

/**
 * Add required UTM parameters to Unsplash URLs
 * Required by Unsplash API guidelines for proper attribution tracking
 */
export function addUnsplashUTM(url: string): string {
  if (!url) return url;

  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('utm_source', UTM_PARAMS.source);
    urlObj.searchParams.set('utm_medium', UTM_PARAMS.medium);
    return urlObj.toString();
  } catch (error) {
    return url;
  }
}

/**
 * Build Unsplash profile and photo URLs with UTM parameters
 *
 * @param photoId - Unsplash photo ID (e.g., "2SfssudtyIA")
 * @param photographerSlug - Photographer username slug (e.g., "benjamin-jopen")
 * @returns Object with profileUrl and photoUrl including UTM parameters
 */
export function buildUnsplashUrls(photoId: string, photographerSlug: string) {
  const profileUrl = `https://unsplash.com/@${photographerSlug}`;
  const photoUrl = `https://unsplash.com/photos/${photoId}`;

  return {
    profileUrl: addUnsplashUTM(profileUrl),
    photoUrl: addUnsplashUTM(photoUrl),
  };
}
