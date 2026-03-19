import * as cheerio from 'cheerio';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { parallelLimit } from '../../utils/parallelLimit.js';
import { urlCrawler } from '../scrapers/implementations/UrlCrawler/index.js';

import type { CollectedItem, ScrapeConfig } from './types.js';

const log = createLogger('PageScraper');

const CRAWL_CONCURRENCY = 3;

interface ScrapedArticle {
  url: string;
  title: string;
  date: string | null;
  excerpt: string;
}

/**
 * Scrapes a listing page for articles, filters by date, and crawls each for full content.
 * Supports two extraction strategies:
 * - JSON extraction: for React SSR/RSC sites with embedded structured data
 * - CSS selectors: for traditional HTML listing pages
 */
export async function scrapeListingPage(
  pageUrl: string,
  config: ScrapeConfig,
  since: Date,
  maxResults: number
): Promise<CollectedItem[]> {
  const { html } = await urlCrawler.fetchUrl(pageUrl);

  let articles = extractArticlesFromJson(html, pageUrl, config);

  if (articles.length === 0 && config.articleSelector) {
    articles = extractArticlesFromHtml(html, pageUrl, config);
  }

  if (articles.length === 0) {
    log.warn(`No articles found on ${pageUrl}`);
    return [];
  }

  const filtered = articles.filter((a) => {
    if (!a.date) return true;
    return new Date(a.date) >= since;
  });

  const capped = filtered.slice(0, maxResults);
  log.info(
    `${pageUrl}: ${articles.length} total, ${filtered.length} since ${since.toISOString()}, crawling ${capped.length}`
  );

  const hostname = new URL(pageUrl).hostname;
  const crawlTasks = capped.map((article) => async (): Promise<CollectedItem> => {
    let fullContent: string | undefined;
    try {
      const result = await urlCrawler.crawlUrl(article.url, { timeout: 15000, maxRetries: 1 });
      fullContent = result.success && result.data ? result.data.content : undefined;
    } catch (error) {
      log.warn(`Failed to crawl ${article.url}: ${toError(error).message}`);
    }
    return {
      url: article.url,
      title: article.title,
      excerpt: article.excerpt,
      source: hostname,
      sourceType: 'scrape',
      publishedAt: article.date,
      fullContent,
    };
  });

  return parallelLimit(crawlTasks, CRAWL_CONCURRENCY);
}

/**
 * Strategy A: Extract article data from embedded JSON in the HTML source.
 * Works for React SSR/RSC sites where article objects are serialized in the page.
 * Handles both regular JSON ("key":"value") and RSC double-escaped JSON (\\"key\\":\\"value\\").
 */
function extractArticlesFromJson(
  html: string,
  pageUrl: string,
  config: ScrapeConfig
): ScrapedArticle[] {
  const baseUrl = config.baseUrl || new URL(pageUrl).origin;
  const articles: ScrapedArticle[] = [];
  const seen = new Set<string>();

  if (config.jsonPattern) {
    try {
      const pattern = new RegExp(config.jsonPattern, 'g');
      let match;
      while ((match = pattern.exec(html)) !== null) {
        addArticle(articles, seen, baseUrl, match[1], match[2], match[3], match[4]);
      }
    } catch (error) {
      log.error(`Invalid jsonPattern "${config.jsonPattern}": ${toError(error).message}`);
    }
  } else {
    // Try RSC double-escaped format first (React Server Components)
    const rscPattern =
      /\\"title\\":\\"((?:[^\\]|\\[^"])*)\\",?\s*\\"date\\":\\"((?:[^\\]|\\[^"])*)\\",?\s*\\"path\\":\\"((?:[^\\]|\\[^"])*)\\",?\s*\\"text\\":\\"((?:[^\\]|\\[^"])*?)\\"/g;
    let match;
    while ((match = rscPattern.exec(html)) !== null) {
      addArticle(articles, seen, baseUrl, match[1], match[2], match[3], match[4]);
    }

    // Fall back to regular JSON format
    if (articles.length === 0) {
      const jsonPattern =
        /"title":"([^"]+)"[^}]*?"date":"([^"]+)"[^}]*?"path":"([^"]+)"[^}]*?"text":"([^"]*?)"/g;
      while ((match = jsonPattern.exec(html)) !== null) {
        addArticle(articles, seen, baseUrl, match[1], match[2], match[3], match[4]);
      }
    }
  }

  if (articles.length > 0) {
    log.info(`JSON extraction: found ${articles.length} articles from ${pageUrl}`);
  }

  return articles;
}

function addArticle(
  articles: ScrapedArticle[],
  seen: Set<string>,
  baseUrl: string,
  rawTitle: string,
  rawDate: string,
  rawPath: string,
  rawExcerpt: string
): void {
  const title = unescapeJson(rawTitle);
  const date = unescapeJson(rawDate);
  const path = unescapeJson(rawPath);
  const excerpt = unescapeJson(rawExcerpt);

  const url = path.startsWith('http://') || path.startsWith('https://') ? path : baseUrl + path;
  if (seen.has(url)) return;
  seen.add(url);

  articles.push({ url, title, date, excerpt });
}

/**
 * Strategy B: Extract articles using CSS selectors (Cheerio).
 * Works for traditional HTML listing pages (WordPress, static sites, etc.).
 */
function extractArticlesFromHtml(
  html: string,
  pageUrl: string,
  config: ScrapeConfig
): ScrapedArticle[] {
  if (!config.articleSelector) return [];

  const $ = cheerio.load(html);
  const baseUrl = config.baseUrl || new URL(pageUrl).origin;
  const articles: ScrapedArticle[] = [];

  $(config.articleSelector).each((_, el) => {
    const $el = $(el);

    const linkEl = config.linkSelector ? $el.find(config.linkSelector) : $el.find('a');
    const href = linkEl.attr('href');
    if (!href) return;
    const url = href.startsWith('http://') || href.startsWith('https://') ? href : baseUrl + href;

    const title = config.titleSelector
      ? $el.find(config.titleSelector).text().trim()
      : linkEl.text().trim();

    let date: string | null = null;
    if (config.dateSelector) {
      const dateEl = $el.find(config.dateSelector);
      date = config.dateAttribute
        ? dateEl.attr(config.dateAttribute) || null
        : dateEl.text().trim() || null;
    }

    const excerpt = config.excerptSelector ? $el.find(config.excerptSelector).text().trim() : '';

    if (title || href) {
      articles.push({ url, title: title || url, date, excerpt });
    }
  });

  if (articles.length > 0) {
    log.info(`CSS extraction: found ${articles.length} articles from ${pageUrl}`);
  }

  return articles;
}

function unescapeJson(str: string): string {
  try {
    return JSON.parse(`"${str}"`);
  } catch {
    return str.replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}
