/**
 * The gruene-bundestag.de markup contract: the two selectors the indexer reads
 * a page through. A leaf module (cheerio types only) so
 * `BundestagScraper.manual-test` can exercise the real selectors without
 * pulling in the Qdrant/embedding chain the scraper itself imports.
 */
import type * as cheerio from 'cheerio';

/**
 * Chrome that must not become indexed prose.
 *
 * `noscript` is the load-bearing entry: cheerio parses its contents as ordinary
 * elements, so the site's "Diese Seite verwendet JavaScript" banner opened the
 * indexed text of every MdB profile — those pages carry a near-empty
 * TYPO3SEARCH block and therefore fall through to the `main` extraction.
 */
export const NOISE_SELECTOR =
  'nav, footer, script, style, noscript, .noscript, header, .cookie-banner, [role="banner"]';

/**
 * Publication date of an article page as `YYYY-MM-DD`, or null for page types
 * that have none (MdB profiles).
 *
 * gruene-bundestag.de emits no `article:published_time` meta tag, so reading
 * only that returned null for every indexed chunk — which silently disabled the
 * `published_at` date filter the collection advertises in both the notebook UI
 * and the MCP catalog, and left recency ranking nothing to sort by. The date
 * lives in the `release-date` block instead ("Veröffentlicht am 06.12.2024").
 *
 * The selector must stay scoped to that block: article teasers on the same page
 * carry their own `<time>` elements, so a bare `time[datetime]` picks up a
 * neighbour's date. The meta tag stays as a fallback in case the site starts
 * emitting one.
 */
export function extractPublishedAt($: cheerio.CheerioAPI): string | null {
  return (
    $('.release-date time[datetime]').first().attr('datetime') ||
    $('meta[property="article:published_time"]').attr('content') ||
    null
  );
}
