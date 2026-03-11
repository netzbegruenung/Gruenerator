import type {
  FetchStockImagesResponse,
  StockImage,
  UnsplashSearchResult,
} from './image-source-types.js';
import type { AxiosInstance } from 'axios';

export const STOCK_CATEGORY_LABELS: Record<string, string> = {
  all: 'Alle',
  environment: 'Umwelt',
  transport: 'Mobilit\u00e4t',
  social: 'Gesellschaft',
  nature: 'Natur',
  politics: 'Politik',
  education: 'Bildung',
};

export async function fetchStockImages(
  client: AxiosInstance,
  category?: string | null
): Promise<FetchStockImagesResponse> {
  const url =
    category && category !== 'all'
      ? `/image-picker/stock-catalog?category=${category}`
      : '/image-picker/stock-catalog';

  const response = await client.get(url);

  if (response.data.success) {
    return {
      success: true,
      images: response.data.images,
      categories: response.data.categories || [],
    };
  }

  throw new Error(response.data.error || 'Failed to fetch stock images');
}

export async function searchUnsplashImages(
  client: AxiosInstance,
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<UnsplashSearchResult> {
  if (!query || query.trim().length === 0) {
    return { results: [], total: 0, total_pages: 0 };
  }

  const response = await client.get('/unsplash/search', {
    params: {
      query: query.trim(),
      page,
      per_page: perPage,
    },
  });

  return response.data;
}

export async function trackUnsplashDownload(
  client: AxiosInstance,
  image: StockImage
): Promise<void> {
  if (!image.attribution?.downloadLocation) {
    return;
  }

  try {
    await client.post('/image-picker/download-track', {
      filename: image.filename,
      downloadLocation: image.attribution.downloadLocation,
    });
  } catch (error) {
    console.warn('Failed to track Unsplash download:', error);
  }
}

export async function trackUnsplashDownloadLive(
  client: AxiosInstance,
  downloadLocation: string
): Promise<void> {
  if (!downloadLocation) {
    return;
  }

  try {
    await client.post('/unsplash/track-download', {
      downloadLocation,
    });
  } catch (error) {
    console.warn('Failed to track Unsplash download:', error);
  }
}
