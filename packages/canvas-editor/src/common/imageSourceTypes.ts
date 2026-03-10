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
