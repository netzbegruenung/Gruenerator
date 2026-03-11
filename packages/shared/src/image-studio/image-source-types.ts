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

export interface UnsplashSearchResult {
  results: StockImage[];
  total: number;
  total_pages: number;
}

export type ImageSourceTab = 'device' | 'stock' | 'unsplash' | 'mediathek';
