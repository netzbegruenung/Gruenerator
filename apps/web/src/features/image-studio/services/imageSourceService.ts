import apiClient from '../../../components/utils/apiClient';

export interface StockImageAttribution {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
  downloadLocation?: string;
}

export interface StockImage {
  filename: string;
  attribution?: StockImageAttribution;
  category?: string;
  url?: string;
  alt_text?: string;
  [key: string]: unknown;
}

export interface FetchStockImagesResponse {
  success: boolean;
  images: StockImage[];
  categories: string[];
  error?: string;
}

export async function fetchStockImages(category?: string | null): Promise<FetchStockImagesResponse> {
  const url = category && category !== 'all'
    ? `/image-picker/stock-catalog?category=${category}`
    : '/image-picker/stock-catalog';

  const response = await apiClient.get(url);

  if (response.data.success) {
    return {
      success: true,
      images: response.data.images,
      categories: response.data.categories || []
    };
  }

  throw new Error(response.data.error || 'Failed to fetch stock images');
}

export async function fetchStockImageAsFile(image: StockImage): Promise<File> {
  const imageUrl = `${apiClient.defaults.baseURL}/image-picker/stock-image/${image.filename}`;
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error('Failed to fetch stock image');
  }

  const blob = await response.blob();
  return new File([blob], image.filename, { type: blob.type || 'image/jpeg' });
}

export function openUnsplashSearch(query: string): void {
  if (!query) return;
  const searchUrl = `https://unsplash.com/de/s/fotos/${encodeURIComponent(query)}?license=free`;
  window.open(searchUrl, '_blank');
}

/**
 * Track Unsplash download (required by Unsplash API guidelines)
 * Call this when user applies image to canvas (actual usage)
 * Non-blocking: Won't fail image selection if tracking fails
 */
export async function trackUnsplashDownload(image: StockImage): Promise<void> {
  if (!image.attribution?.downloadLocation) {
    return; // Not an Unsplash image or no tracking URL
  }

  try {
    await apiClient.post('/image-picker/download-track', {
      filename: image.filename,
      downloadLocation: image.attribution.downloadLocation
    });
  } catch (error) {
    console.warn('Failed to track Unsplash download:', error);
    // Don't throw - this is non-critical
  }
}

// ============================================================================
// Live Unsplash API Search
// ============================================================================

export interface UnsplashSearchResult {
  results: StockImage[];
  total: number;
  total_pages: number;
}

/**
 * Search Unsplash photos via backend proxy
 * @param query - Search query (e.g., "nature", "green", "politics")
 * @param page - Page number (1-indexed)
 * @param perPage - Results per page (max 30)
 * @returns Search results with transformed photos
 */
export async function searchUnsplashImages(
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<UnsplashSearchResult> {
  if (!query || query.trim().length === 0) {
    return { results: [], total: 0, total_pages: 0 };
  }

  const response = await apiClient.get('/unsplash/search', {
    params: {
      query: query.trim(),
      page,
      per_page: perPage,
    },
  });

  return response.data;
}

/**
 * Track Unsplash download for live API images
 * @param downloadLocation - The download_location URL from photo.links
 */
export async function trackUnsplashDownloadLive(downloadLocation: string): Promise<void> {
  if (!downloadLocation) {
    return;
  }

  try {
    await apiClient.post('/unsplash/track-download', {
      downloadLocation,
    });
  } catch (error) {
    console.warn('Failed to track Unsplash download:', error);
    // Don't throw - this is non-critical
  }
}

/**
 * Fetch Unsplash image as File object
 * @param image - Stock image with URL
 * @returns File object ready for upload/canvas use
 */
export async function fetchUnsplashImageAsFile(image: StockImage): Promise<File> {
  if (!image.url) {
    throw new Error('Image URL is required');
  }

  const response = await fetch(image.url);

  if (!response.ok) {
    throw new Error('Failed to fetch Unsplash image');
  }

  const blob = await response.blob();
  const filename = image.filename || 'unsplash-image.jpg';
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
