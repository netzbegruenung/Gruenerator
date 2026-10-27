// SPDX-License-Identifier: MPL-2.0

/**
 * Stock and Unsplash photos as a host's image API returns them: the
 * editor's photo pickers read these shapes, the host's API writes them.
 */

export interface StockImageAttribution {
  photographer: string;
  profileUrl: string;
  photoUrl: string;
  downloadLocation?: string;
  /** Without the `@`; credited in the post text when present. */
  instagramUsername?: string;
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

export interface UnsplashSearchResult {
  results: StockImage[];
  total: number;
  total_pages: number;
  /** Searches left on the shared Unsplash key this hour; absent on cached answers. */
  rateLimitRemaining?: number;
}
