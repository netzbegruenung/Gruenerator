import { unsplashRateLimitErrorSchema } from '@gruenerator/contracts';
import { isAxiosError } from 'axios';

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

  const response = await client.get<FetchStockImagesResponse>(url);

  if (response.data.success) {
    return {
      success: true,
      images: response.data.images,
      categories: response.data.categories || [],
    };
  }

  throw new Error(response.data.error ?? 'Failed to fetch stock images');
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

  try {
    const response = await client.get<UnsplashSearchResult>('/unsplash/search', {
      params: {
        query: query.trim(),
        page,
        per_page: perPage,
      },
    });
    return response.data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 429) {
      const body = unsplashRateLimitErrorSchema.safeParse(error.response.data);
      if (body.success) throw new UnsplashLimitError(body.data.retryAfter);
    }
    throw new Error('Die Unsplash-Suche ist fehlgeschlagen.', { cause: error });
  }
}

/** The shared Unsplash key has used up its hourly searches. */
export class UnsplashLimitError extends Error {
  readonly retryAt: Date;

  constructor(retryAfterSeconds: number) {
    super('Das Unsplash-Kontingent ist für diese Stunde aufgebraucht.');
    this.name = 'UnsplashLimitError';
    this.retryAt = new Date(Date.now() + retryAfterSeconds * 1000);
  }
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
