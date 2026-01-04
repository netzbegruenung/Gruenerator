import apiClient from '../../../components/utils/apiClient';

export interface StockImageAttribution {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
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
