// The image shapes moved to @ggraphic/schema (the editor core reads them); kept so existing imports resolve.
export type {
  StockImageAttribution,
  StockImage,
  FetchStockImagesResponse,
  UnsplashSearchResult,
} from '@ggraphic/schema/media/stockImages';

export type ImageSourceTab = 'device' | 'stock' | 'unsplash' | 'mediathek';

export const STOCK_CATEGORY_LABELS: Record<string, string> = {
  all: 'Alle',
  environment: 'Umwelt',
  transport: 'Mobilit\u00e4t',
  social: 'Gesellschaft',
  nature: 'Natur',
  politics: 'Politik',
  education: 'Bildung',
};
