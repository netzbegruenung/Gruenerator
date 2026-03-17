import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { withRetry } from '../search/searchRetryStrategy.js';
import { searxngService } from '../search/SearxngService.js';

import {
  isConfigured as isApifyConfigured,
  getRecentTweets,
  getRecentInstagramPosts,
} from './ApifyService.js';
import { fetchNewItems } from './RSSService.js';

import type { BriefingConfig, CollectedItem, SourceConfig } from './types.js';

const log = createLogger('DataCollector');

async function searchWeb(
  query: string,
  options: { timeRange: string; categories?: string }
): Promise<CollectedItem[]> {
  if (!query.trim()) return [];

  try {
    const results = await withRetry(
      () =>
        searxngService.performWebSearch(query, {
          time_range: options.timeRange,
          maxResults: 20,
          categories: options.categories || 'general,news',
          language: 'de-DE',
        }),
      { maxRetries: 1, delayMs: 1000, label: 'briefing-search' }
    );

    return (results.results || []).map((r) => ({
      url: r.url,
      title: r.title || '',
      excerpt: r.content || '',
      source: r.engine || new URL(r.url).hostname,
      sourceType: 'web' as const,
      publishedAt: r.publishedDate || null,
    }));
  } catch (error) {
    log.error(`Web search failed for "${query}": ${toError(error).message}`);
    return [];
  }
}

async function collectFromWeb(source: SourceConfig, timeRange: string): Promise<CollectedItem[]> {
  const query = source.domains?.length
    ? `${source.query} ${source.domains.map((d) => `site:${d}`).join(' OR ')}`
    : source.query || '';

  return searchWeb(query, { timeRange });
}

async function collectFromRSS(source: SourceConfig, since: Date): Promise<CollectedItem[]> {
  if (!source.url) return [];
  return fetchNewItems(source.url, since, source.query);
}

async function collectFromSocial(source: SourceConfig, maxItems: number): Promise<CollectedItem[]> {
  if (!source.username) return [];

  if (isApifyConfigured()) {
    return source.type === 'twitter'
      ? getRecentTweets(source.username, maxItems)
      : getRecentInstagramPosts(source.username, maxItems);
  }

  // Fallback: web search when APIFY_TOKEN is not set
  const platform = source.type === 'twitter' ? 'twitter.com' : 'instagram.com';
  return searchWeb(`${source.username} site:${platform}`, { timeRange: 'day' });
}

function getSinceDate(timeRange: BriefingConfig['timeRange']): Date {
  const now = new Date();
  return timeRange === 'week'
    ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

export async function collectAll(config: BriefingConfig): Promise<CollectedItem[]> {
  const since = getSinceDate(config.timeRange);

  const sourcePromises = config.sources.map(async (source): Promise<CollectedItem[]> => {
    switch (source.type) {
      case 'web':
        return collectFromWeb(source, config.timeRange);
      case 'rss':
        return collectFromRSS(source, since);
      case 'twitter':
      case 'instagram':
        return collectFromSocial(source, config.maxResultsPerSource);
      default:
        return [];
    }
  });

  const results = await Promise.allSettled(sourcePromises);
  const allItems: CollectedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allItems.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  // Sort by date (newest first) before capping
  unique.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  // Cap per source type
  const maxPerSource = config.maxResultsPerSource || 20;
  const byType = new Map<string, number>();
  const capped = unique.filter((item) => {
    const count = byType.get(item.sourceType) || 0;
    if (count >= maxPerSource) return false;
    byType.set(item.sourceType, count + 1);
    return true;
  });

  log.info(`Collected ${capped.length} items (${unique.length} unique, ${allItems.length} total)`);
  return capped;
}
