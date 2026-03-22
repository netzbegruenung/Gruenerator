import { BundestagScraper } from './BundestagScraper.js';

export { BundestagScraper } from './BundestagScraper.js';
export { BUNDESTAG_SOURCES } from './bundestagConfig.js';
export type { BundestagScrapeOptions, BundestagScrapeResult } from './types.js';

export const bundestagScraperService = new BundestagScraper();
