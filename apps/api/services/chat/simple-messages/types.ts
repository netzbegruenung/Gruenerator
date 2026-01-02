/**
 * Simple Message Detection Types
 */

export interface CategoryConfig {
  maxLength: number;
  patterns: string[];
  responses: {
    [locale: string]: string[];
  };
}

export interface SimpleMessagesConfig {
  defaultLocale: string;
  categories: {
    [category: string]: CategoryConfig;
  };
}

export interface SimpleMessageDetectionResult {
  isSimple: boolean;
  category?: string;
  confidence?: number;
}
