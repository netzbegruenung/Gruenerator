/**
 * WordPress REST API Extractor
 *
 * Discovers article URLs by querying a WordPress site's `/wp-json/wp/v2/posts`
 * endpoint with a category filter. Lets the scraper bypass HTML-listing pagination
 * entirely on WP sites where article URLs don't share the listing-path prefix
 * (root-permalink sites where /category/X/ is a virtual index, not part of the
 * article URL — see mv-lv, thueringen-lv, sachsen-anhalt-lv post-relaunch).
 *
 * Returns canonical article URLs only; the existing per-URL Qdrant skip and
 * ContentExtractor pipeline still runs to fetch+parse each post page. This keeps
 * the integration small but means N+1 HTTP fetches per content path. A future
 * optimization can pipe `post.content.rendered` directly into DocumentProcessor.
 */

import type {
  LandesverbandSource,
  ContentPath,
} from '../../../../../config/landesverbaendeConfig.js';

interface WpPost {
  link: string;
}

export class WpApiExtractor {
  constructor(
    private fetchUrl: (url: string) => Promise<Response>,
    private delay: (ms: number) => Promise<void>
  ) {}

  async extractArticleLinks(
    source: LandesverbandSource,
    contentPath: ContentPath,
    log: (msg: string) => void,
    modifiedAfter?: Date | null
  ): Promise<string[]> {
    if (!contentPath.wpApi) return [];

    const { categoryId, maxPages = 50 } = contentPath.wpApi;
    const perPage = 100;
    // Incremental window: restrict to posts changed since `modifiedAfter`, newest
    // first, so an hourly run pulls the handful of recent edits instead of the
    // whole category. Catches edits to existing posts, not just new ones.
    const recentQuery = modifiedAfter
      ? `&modified_after=${modifiedAfter.toISOString()}&orderby=modified&order=desc`
      : '';
    if (modifiedAfter) {
      log(`[WP API] incremental: posts modified after ${modifiedAfter.toISOString()}`);
    }
    const links = new Set<string>();
    let page = 1;

    while (page <= maxPages) {
      const url = `${source.baseUrl}/wp-json/wp/v2/posts?categories=${categoryId}&per_page=${perPage}&page=${page}&_fields=link${recentQuery}`;
      let response: Response;
      try {
        response = await this.fetchUrl(url);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        log(`[WP API] page ${page} fetch failed: ${msg}`);
        break;
      }

      // WP returns HTTP 400 with code rest_post_invalid_page_number when paging
      // past the last page. Treat that as a normal end-of-results.
      if (response.status === 400) {
        log(`[WP API] page ${page} beyond range, stopping`);
        break;
      }
      if (!response.ok) {
        log(`[WP API] page ${page} HTTP ${response.status}, stopping`);
        break;
      }

      let posts: WpPost[];
      try {
        posts = (await response.json()) as WpPost[];
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        log(`[WP API] page ${page} JSON parse failed: ${msg}`);
        break;
      }
      if (!Array.isArray(posts) || posts.length === 0) break;

      for (const post of posts) {
        if (post.link) links.add(post.link);
      }
      log(`[WP API] page ${page}: ${posts.length} posts (total: ${links.size})`);

      if (posts.length < perPage) break;
      page++;
      await this.delay(300);
    }

    return Array.from(links);
  }
}
