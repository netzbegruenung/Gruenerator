/**
 * Social Media Scraper for Monitor
 * Fetches recent Instagram posts from political party accounts via Apify.
 */

import { createLogger } from '../../utils/logger.js';

import { getRecentInstagramPosts, isConfigured } from './ApifyService.js';

import type { CollectedMonitorItem } from './MonitorCollectorService.js';

const log = createLogger('SocialMediaScraper');

const INSTAGRAM_ACCOUNTS = [
  { username: 'die_gruenen', label: 'Die Grünen' },
  { username: 'cdu', label: 'CDU' },
  { username: 'spdde', label: 'SPD' },
  { username: 'afd.bund', label: 'AfD' },
  { username: 'dielinke', label: 'Die Linke' },
];

const MAX_POSTS_PER_ACCOUNT = 5;

export async function scrapeInstagramAccounts(): Promise<CollectedMonitorItem[]> {
  if (!isConfigured()) {
    log.warn('Apify not configured (APIFY_TOKEN missing), skipping Instagram scrape');
    return [];
  }

  log.info(`Scraping Instagram: ${INSTAGRAM_ACCOUNTS.length} party accounts...`);

  const allItems: CollectedMonitorItem[] = [];

  for (const account of INSTAGRAM_ACCOUNTS) {
    try {
      const posts = await getRecentInstagramPosts(account.username, MAX_POSTS_PER_ACCOUNT);

      for (const post of posts) {
        allItems.push({
          url: post.url,
          title: `[${account.label}] ${post.title}`,
          excerpt: post.excerpt,
          source: `Instagram @${account.username}`,
          publishedAt: post.publishedAt,
          locale: 'de',
        });
      }

      log.info(`Instagram @${account.username}: ${posts.length} posts`);
    } catch (error) {
      log.error(`Instagram @${account.username} failed: ${error}`);
    }
  }

  log.info(`Instagram total: ${allItems.length} posts from ${INSTAGRAM_ACCOUNTS.length} accounts`);
  return allItems;
}
