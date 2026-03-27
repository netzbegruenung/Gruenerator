export interface BundestagSourceConfig {
  id: string;
  name: string;
  path: string;
  primaryCategory: string;
  maxDepth: number;
  maxPages: number;
  discovery: 'crawl' | 'sitemap' | 'generated';
}

export interface BundestagScrapeOptions {
  forceUpdate?: boolean;
  sourceId?: string;
}

export interface BundestagScrapeResult {
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  totalVectors: number;
  duration: number;
  sources: Array<{
    id: string;
    name: string;
    pages: number;
    stored: number;
    updated: number;
    skipped: number;
    errors: number;
  }>;
}
