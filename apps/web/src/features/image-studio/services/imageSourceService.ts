import {
  fetchStockImages as fetchStockImagesShared,
  searchUnsplashImages as searchUnsplashImagesShared,
  trackUnsplashDownload as trackUnsplashDownloadShared,
  trackUnsplashDownloadLive as trackUnsplashDownloadLiveShared,
} from '@gruenerator/shared/image-studio';

import apiClient from '../../../components/utils/apiClient';

export type {
  StockImageAttribution,
  StockImage,
  FetchStockImagesResponse,
  UnsplashSearchResult,
} from '@gruenerator/shared/image-studio';

import type { StockImage } from '@gruenerator/shared/image-studio';

export async function fetchStockImages(category?: string | null) {
  return fetchStockImagesShared(apiClient, category);
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

export async function trackUnsplashDownload(image: StockImage): Promise<void> {
  return trackUnsplashDownloadShared(apiClient, image);
}

export async function searchUnsplashImages(query: string, page: number = 1, perPage: number = 20) {
  return searchUnsplashImagesShared(apiClient, query, page, perPage);
}

export async function trackUnsplashDownloadLive(downloadLocation: string): Promise<void> {
  return trackUnsplashDownloadLiveShared(apiClient, downloadLocation);
}

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
