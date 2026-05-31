/**
 * Configuration for Landesverbände (state associations) and Fraktionen scrapers
 *
 * Each source defines:
 * - id: Unique identifier for the source
 * - name: Human-readable name
 * - shortName: Short code (used for filtering)
 * - type: 'landesverband' or 'fraktion'
 * - baseUrl: Root URL of the website
 * - cms: Content management system type for extraction strategy
 * - contentPaths: Array of content paths to scrape
 * - contentSelectors: CSS selectors for extracting content
 * - excludePatterns: URL patterns to skip
 */

import {
  type CuratedListId,
  type LandesverbandContentType,
  type LandesverbandSourceId,
  type LandesverbandSourceType,
} from '@gruenerator/shared/search';

export type ContentType = LandesverbandContentType;
export type CMSType = 'wordpress' | 'neos' | 'typo3' | 'custom' | 'drupal';
export type SourceType = LandesverbandSourceType;

export interface ContentPath {
  type: ContentType;
  path: string;
  listSelector: string;
  paginationPattern?: string;
  maxPages?: number;
  isPdfArchive?: boolean;
  processUndatedPdfs?: boolean; // When true, process PDFs without detectable dates instead of skipping them (default: false)
  paginationOffset?: number; // Offset for page number in pagination (default: 0). Use -1 for Drupal 0-indexed pagination.
  paginationLinkSelector?: string; // Optional: CSS selector for pagination links. When set, follows "next" links from HTML instead of constructing URLs (needed for Typo3 cHash).
  sitemapUrls?: string[]; // Optional: fetch URLs from sitemaps instead of pagination
  sitemapFilter?: string; // Optional: filter sitemap URLs (e.g., '/presse/')
  staticUrls?: string[]; // Optional: fixed list of URLs to scrape directly (bypasses pagination and sitemap)
  disableOffPathFilter?: boolean; // Optional: when true, skip the post-discovery filter that requires URLs to share the listing-path prefix. Auto-applied when sitemapUrls or wpApi is set, since both yield canonical URLs that rarely match the human-facing listing path (e.g. TYPO3 sitemaps emit /news/ while listings live under /nachrichten/; WP root-permalinks publish at /<slug>/ regardless of the /category/X listing seed).
  wpApi?: { categoryId: number; maxPages?: number }; // Optional: discover articles via WordPress REST API (/wp-json/wp/v2/posts?categories=…). Bypasses HTML-listing pagination entirely; required for WP sites with root-permalink structure where /category/X/ is a virtual index.
}

export interface ContentSelectors {
  title: string[];
  date: string[];
  content: string[];
  categories: string[];
  author: string[];
}

export interface LandesverbandSource {
  id: LandesverbandSourceId;
  name: string;
  shortName: string;
  type: SourceType;
  baseUrl: string;
  cms: CMSType;
  contentPaths: ContentPath[];
  contentSelectors: ContentSelectors;
  excludePatterns: string[];
  qdrantCollection?: string; // Optional: custom collection name (default: landesverbaende_documents)
  maxAgeYears?: number; // Optional: max age of content in years (default: 10)
  notificationEmail?: string; // Optional: email to notify when new articles are indexed
  dormant?: boolean; // Optional: when true, scrapeAllSources skips this source. Set for sources that no longer publish (e.g. dissolved Fraktionen). Direct scrapeSource(id) calls are unaffected.
}

/**
 * A curated list tags existing scraped documents (matched by URL) with a
 * category id. The same document can appear in multiple lists. Use this when
 * a sub-set of canonical content should be filterable independently of the
 * scraper that produced it (e.g. "Wahlprogramm" inside a generic Beschlüsse
 * sitemap), without re-fetching the same URLs under aliases.
 */
export interface CuratedList {
  id: CuratedListId;
  label: string;
  shortName?: string;
  urls: string[];
  /**
   * When set, documents matched to this list are stored with this content_type
   * instead of the scraping content path's type. Lets a curated subset of a
   * generic sitemap (e.g. the Wahlprogramm inside /beschluesse) surface under
   * the "Typ" filter as its own type — without a separate scraper or alias URLs.
   */
  contentType?: ContentType;
}

export interface LandesverbaendeConfig {
  sources: LandesverbandSource[];
  curatedLists?: CuratedList[];
}

export const LANDESVERBAENDE_CONFIG: LandesverbaendeConfig = {
  sources: [
    // ═══════════════════════════════════════════════════════════════════
    // SACHSEN-ANHALT
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'sachsen-anhalt-lv',
      name: 'Grüne Sachsen-Anhalt',
      shortName: 'LSA',
      type: 'landesverband',
      baseUrl: 'https://www.gruene-lsa.de',
      cms: 'wordpress',
      contentPaths: [
        {
          // Site relaunched in Dec 2025 and changed permalinks from
          // /category/pressemitteilung/<slug>/ to /<slug>/. Pre-relaunch URLs
          // matched the off-path filter; post-relaunch URLs don't, which is why
          // Qdrant froze at 2025-12-03. Use WP REST API (cat 9) to bypass
          // HTML-listing discovery entirely.
          type: 'presse',
          path: '/category/pressemitteilung/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          wpApi: { categoryId: 9 },
        },
        {
          type: 'beschluss',
          path: '/category/beschluesse/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          wpApi: { categoryId: 11 },
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', 'meta[property="article:published_time"]'],
        content: ['.entry-content', '.wp-block-post-content', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.category-links a', '.post-categories a'],
        author: ['.author-name', '.byline', '.entry-author'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },
    {
      id: 'sachsen-anhalt-fraktion',
      name: 'Grüne Fraktion Sachsen-Anhalt',
      shortName: 'LSA-F',
      type: 'fraktion',
      baseUrl: 'https://gruene-fraktion-lsa.de',
      cms: 'neos',
      contentPaths: [
        {
          type: 'presse',
          path: '/pressemitteilungen',
          listSelector: 'a[href*="/pressemitteilungen/"]',
          paginationPattern: '~p{page}.html',
          maxPages: 70,
        },
      ],
      contentSelectors: {
        title: ['h1', 'h2.headline', '.page-title', 'meta[property="og:title"]'],
        date: ['.mb-tiny', 'time', '.date', '.publication-date'],
        content: ['article', '.content-main', '.text-content', 'main'],
        categories: ['a[href*="/themen/"]', '.tags a'],
        author: ['.author', '.written-by'],
      },
      excludePatterns: ['/_Resources/', '/assets/', '#', 'javascript:', '.pdf', '.jpg', '.png'],
    },

    // ═══════════════════════════════════════════════════════════════════
    // MECKLENBURG-VORPOMMERN
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'mecklenburg-vorpommern-lv',
      name: 'Grüne Mecklenburg-Vorpommern',
      shortName: 'MV',
      type: 'landesverband',
      baseUrl: 'https://gruene-mv.de',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          // Articles publish at /<slug>/ (root permalinks); /presse/ is a virtual
          // category index. Off-path filter strips every article. Use WP REST API
          // category 12 = "Pressemitteilungen" (259 posts) instead.
          type: 'presse',
          path: '/presse/',
          listSelector: 'article a[href], h3 a, .elementor-post__title a',
          wpApi: { categoryId: 12 },
        },
        {
          type: 'beschluss',
          path: '/parteitags-beschluesse/',
          listSelector: 'a[href*="/download/"], a[href$=".pdf"], article a[href]',
          isPdfArchive: true,
          maxPages: 1,
        },
      ],
      contentSelectors: {
        title: [
          'h1',
          'h1.elementor-heading-title',
          '.elementor-widget-heading h1',
          'meta[property="og:title"]',
        ],
        date: [
          '.elementor-post-date',
          'time[datetime]',
          '.post-date',
          'meta[property="article:published_time"]',
        ],
        content: ['.elementor-widget-container', '.entry-content', 'article', 'main'],
        categories: ['.elementor-post-taxonomy a', 'a[rel="category tag"]', '.post-categories a'],
        author: ['.author-name', '.elementor-author-name'],
      },
      excludePatterns: [
        '/tag/',
        '/author/',
        '/wp-content/uploads/',
        '/wp-admin/',
        '#',
        'javascript:',
      ],
    },
    {
      id: 'mecklenburg-vorpommern-fraktion',
      name: 'Grüne Fraktion Mecklenburg-Vorpommern',
      shortName: 'MV-F',
      type: 'fraktion',
      baseUrl: 'https://gruene-fraktion-mv.de',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          // Same root-permalink pattern as mv-lv. WP cat 13 = "Pressemitteilung"
          // (1038 posts — Fraktion publishes ~4× more than the state party).
          type: 'presse',
          path: '/presse/',
          listSelector: 'article a[href], h2 a, h3 a, .wp-block-heading a',
          wpApi: { categoryId: 13 },
        },
        {
          // WP cat 4 = "Antrag" (135 posts).
          type: 'antrag',
          path: '/category/antrag/',
          listSelector: 'article a[href], h2 a, h3 a',
          wpApi: { categoryId: 4 },
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: [
          'time[datetime]',
          '.entry-date',
          '.post-date',
          'meta[property="article:published_time"]',
        ],
        content: ['.entry-content', '.wp-block-paragraph', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.post-categories a', 'a[href*="/category/"]'],
        author: ['.author-name', '.byline'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },

    // ═══════════════════════════════════════════════════════════════════
    // HAMBURG
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'hamburg-lv-beschluesse',
      name: 'Grüne Hamburg Beschlüsse',
      shortName: 'HH',
      type: 'landesverband',
      baseUrl: 'https://beschluss.gruene-hamburg.de',
      cms: 'wordpress',
      contentPaths: [
        {
          type: 'beschluss',
          path: '/',
          listSelector: 'article a[href], h2 a, h3 a, .entry-title a',
          paginationPattern: '?paged={page}',
          maxPages: 50,
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1', '.post-title', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', '.post-date'],
        content: ['.entry-content', '.post-content', 'article .content'],
        categories: ['a[rel="category tag"]', '.cat-links a'],
        author: ['.author-name', '.byline'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '#', 'javascript:', '.pdf'],
    },
    {
      id: 'hamburg-lv-presse',
      name: 'Grüne Hamburg Presse',
      shortName: 'HH',
      type: 'landesverband',
      baseUrl: 'https://www.gruene-hamburg.de',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'presse',
          path: '/presse/',
          listSelector: 'article a[href], h2 a, h3 a, .entry-title a',
          sitemapUrls: [
            'https://www.gruene-hamburg.de/wp-sitemap-posts-post-1.xml',
            'https://www.gruene-hamburg.de/wp-sitemap-posts-post-2.xml',
          ],
          sitemapFilter: '/presse/',
        },
      ],
      contentSelectors: {
        title: ['h1', '.entry-title', '.post-title', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', '.published'],
        content: ['.entry-content', '.post-content', 'article'],
        categories: ['.category', 'a[rel="category tag"]'],
        author: ['.author', '.byline'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '#', 'javascript:'],
    },

    // ═══════════════════════════════════════════════════════════════════
    // BAYERN
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'bayern-lv-beschluesse',
      name: 'Grüne Bayern Beschlüsse',
      shortName: 'BY',
      type: 'landesverband',
      baseUrl: 'https://www.gruene-bayern.de',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          // gruene-bayern.de runs WordPress (jkb theme) with German /kategorie/
          // permalinks but ROOT post permalinks (/<slug>/). The /kategorie/beschluesse/
          // listing is a virtual index, so its article links don't share the listing
          // path — the off-path filter would drop every result. Discover via the WP
          // REST API instead (category 5 = Beschlüsse), which yields canonical URLs and
          // auto-disables the off-path filter.
          type: 'beschluss',
          path: '/kategorie/beschluesse/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          wpApi: { categoryId: 5 },
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', 'meta[property="article:published_time"]'],
        content: ['.entry-content', '.wp-block-post-content', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.category-links a', '.post-categories a'],
        author: ['.author-name', '.byline', '.entry-author'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },
    {
      id: 'bayern-lv-presse',
      name: 'Grüne Bayern Presse',
      shortName: 'BY',
      type: 'landesverband',
      baseUrl: 'https://www.gruene-bayern.de',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          // WP REST API, category 29 = Presse (focused press releases, not the
          // broader /archiv/ Aktuelles listing which mixes blog + member news).
          type: 'presse',
          path: '/kategorie/presse/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          wpApi: { categoryId: 29 },
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', 'meta[property="article:published_time"]'],
        content: ['.entry-content', '.wp-block-post-content', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.category-links a', '.post-categories a'],
        author: ['.author-name', '.byline', '.entry-author'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },
    {
      id: 'bayern-fraktion-presse',
      name: 'Grüne Fraktion Bayern Presse',
      shortName: 'BY-F',
      type: 'fraktion',
      baseUrl: 'https://www.gruene-fraktion-bayern.de',
      cms: 'typo3',
      maxAgeYears: 5,
      contentPaths: [
        {
          // TYPO3 (tx_wwt3list). Press-release teasers link to canonical article URLs
          // under /themen/<topic>/<slug>/ (NOT /presse/pressemitteilungen/, which only
          // hosts the listing + its pagination). Target the teaser title links directly;
          // disableOffPathFilter is required because the article path (/themen/) differs
          // from the listing path (/presse/pressemitteilungen/). Pagination traversal
          // follows the rendered "vor" (next) link, whose cHash can't be reconstructed.
          type: 'presse',
          path: '/presse/pressemitteilungen/',
          listSelector: '.press-teaser__title a',
          disableOffPathFilter: true,
          paginationLinkSelector: '.page-navigation__next a',
          // ~3.75 listing pages/month; 230 pages reaches back ~5 years to match the
          // maxAgeYears window. Articles past the 5-year cutoff are dropped at processing.
          maxPages: 230,
        },
      ],
      contentSelectors: {
        // Detail pages use `.document-title` / `.document-content__main`. The date is a
        // bare <p> with no markup — ContentExtractor's TYPO3 German-long-form date
        // fallback handles it (no usable date selector exists here).
        title: ['h1.document-title', 'h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', 'meta[property="article:published_time"]'],
        content: ['.document-content__main', '.news-text-wrap', 'article', 'main'],
        categories: ['.news-category a', '.categories a'],
        author: ['.author', '.byline'],
      },
      excludePatterns: [
        '/fileadmin/',
        '/typo3/',
        'tx_wwt3list',
        '#',
        'javascript:',
        '.pdf',
        '.jpg',
        '.png',
      ],
    },

    // ═══════════════════════════════════════════════════════════════════
    // BERLIN
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'berlin-lv-presse',
      name: 'Grüne Berlin Presse',
      shortName: 'BE',
      type: 'landesverband',
      baseUrl: 'https://gruene.berlin',
      cms: 'typo3',
      maxAgeYears: 5,
      contentPaths: [
        {
          // Scrape the dedicated /pressemitteilungen listing instead of /nachrichten
          // or the news sub-sitemap. The news sub-sitemap aggregates ALL Berlin LV
          // posts (press releases + AG-Sitzung announcements + LAG meetings + events),
          // and articles indexed from there polluted Berlin Presse with non-press
          // content. /pressemitteilungen is TYPO3's category-filtered listing route
          // and only contains real press releases.
          //
          // Pagination on /pressemitteilungen actually works (unlike /nachrichten,
          // where tx_xblog_pi1[pointer] is silently ignored) — pages 1, 2, 3 ... 57
          // each return distinct article IDs, and the next-page links carry
          // per-page cHash signatures. Use paginationLinkSelector so the extractor
          // follows next-links from HTML rather than constructing URLs (which
          // wouldn't carry the required cHash). paginationPattern stays as fallback
          // for the rare case the link-following can't find a "next" anchor.
          type: 'presse',
          path: '/pressemitteilungen',
          listSelector: 'h2 a[href], h3 a[href]',
          paginationLinkSelector: '.pagination a',
          paginationPattern: '?tx_xblog_pi1[pointer]={page}',
          paginationOffset: -1,
          maxPages: 60,
        },
      ],
      contentSelectors: {
        title: ['h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.tx_xblog_pi1 .date', 'meta[property="article:published_time"]'],
        // gruene.berlin (TYPO3 xBlog) renders the page body in .ce-bodytext inside
        // the single-view .xBlog.single — NOT .tx_xblog_pi1 (empty in the rendered
        // DOM) or .bodytext (wrong class). Targeting the body element avoids the
        // $('body') fallback that swallowed header/nav/footer + the related-items
        // sidebar. Verified across Beschlüsse, Wahlprogramm chapters and Presse —
        // all share this template.
        content: [
          '.xBlog.single .ce-bodytext',
          '.ce-bodytext',
          '.xBlog.single',
          'article',
          'main .content',
        ],
        categories: ['.tx_xblog_pi1 .tags a', '.categories a'],
        author: ['.author', '.byline'],
      },
      excludePatterns: [
        '/fileadmin/',
        '/typo3/',
        'tx_xblog_pi1[catKey]',
        '#',
        'javascript:',
        '.pdf',
        '.jpg',
        '.png',
      ],
    },
    {
      id: 'berlin-lv-beschluesse',
      name: 'Grüne Berlin Beschlüsse',
      shortName: 'BE',
      type: 'landesverband',
      baseUrl: 'https://gruene.berlin',
      cms: 'typo3',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'beschluss',
          path: '/beschluesse',
          listSelector: 'h2 a[href], h3 a[href]',
          // TYPO3 silently ignores tx_xblog_pi1[pointer]: every page returns the
          // same first ~10 entries, so pagination plateaus and beschluesse stagnate
          // between LDKs. Discover via the typed sub-sitemap instead — sitemapindex
          // recursion follows /sitemap.xml into ?sitemap=beschluesse&cHash=… (273
          // entries, all canonical /beschluesse/<slug>_<id>).
          sitemapUrls: ['https://gruene.berlin/sitemap.xml'],
          sitemapFilter: '/beschluesse/',
        },
      ],
      contentSelectors: {
        title: ['h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.tx_xblog_pi1 .date', 'meta[property="article:published_time"]'],
        // gruene.berlin (TYPO3 xBlog) renders the page body in .ce-bodytext inside
        // the single-view .xBlog.single — NOT .tx_xblog_pi1 (empty in the rendered
        // DOM) or .bodytext (wrong class). Targeting the body element avoids the
        // $('body') fallback that swallowed header/nav/footer + the related-items
        // sidebar. Verified across Beschlüsse, Wahlprogramm chapters and Presse —
        // all share this template.
        content: [
          '.xBlog.single .ce-bodytext',
          '.ce-bodytext',
          '.xBlog.single',
          'article',
          'main .content',
        ],
        categories: ['.tx_xblog_pi1 .tags a', '.categories a'],
        author: ['.author', '.byline'],
      },
      excludePatterns: [
        '/fileadmin/',
        '/typo3/',
        'tx_xblog_pi1[catKey]',
        '#',
        'javascript:',
        '.pdf',
        '.jpg',
        '.png',
      ],
    },
    {
      id: 'berlin-fraktion-presse',
      name: 'Grüne Fraktion Berlin Presse',
      shortName: 'BE-F',
      type: 'fraktion',
      baseUrl: 'https://gruene-fraktion.berlin',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'presse',
          path: '/pressemitteilungen/',
          listSelector: 'article a[href*="/pressemitteilungen/"]',
          paginationPattern: '/page/{page}/',
          maxPages: 120,
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: [
          'time[datetime]',
          '.entry-date',
          '.post-date',
          'meta[property="article:published_time"]',
        ],
        content: ['.entry-content', '.wp-block-paragraph', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.post-categories a', 'a[href*="/category/"]'],
        author: ['.author-name', '.byline'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },
    {
      id: 'berlin-fraktion-beschluesse',
      name: 'Grüne Fraktion Berlin Beschlüsse',
      shortName: 'BE-F',
      type: 'fraktion',
      baseUrl: 'https://gruene-fraktion.berlin',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'beschluss',
          path: '/beschluesse/',
          listSelector: 'ul.dlm-downloads a[href*="/download/"]',
          isPdfArchive: true,
          processUndatedPdfs: true,
          maxPages: 1,
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: [
          'time[datetime]',
          '.entry-date',
          '.post-date',
          'meta[property="article:published_time"]',
        ],
        content: ['.entry-content', '.wp-block-paragraph', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.post-categories a', 'a[href*="/category/"]'],
        author: ['.author-name', '.byline'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },

    // ═══════════════════════════════════════════════════════════════════
    // THÜRINGEN
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'thueringen-lv',
      name: 'Grüne Thüringen',
      shortName: 'TH',
      type: 'landesverband',
      baseUrl: 'https://gruene-thueringen.de',
      cms: 'wordpress',
      maxAgeYears: 12,
      contentPaths: [
        {
          // Articles at /<slug>/ (root permalinks); /category/service/pressemitteilungen/
          // is a virtual category index. Off-path filter strips everything. WP cat 243
          // = "Pressemitteilungen" (471 posts).
          type: 'presse',
          path: '/category/service/pressemitteilungen/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          wpApi: { categoryId: 243 },
        },
      ],
      contentSelectors: {
        title: ['h1.entry-title', 'h1.wp-block-heading', 'h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', 'meta[property="article:published_time"]'],
        content: ['.entry-content', '.wp-block-post-content', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.category-links a', '.post-categories a'],
        author: ['.author-name', '.byline', '.entry-author'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:'],
    },
    {
      id: 'thueringen-fraktion',
      name: 'Grüne Fraktion Thüringen',
      shortName: 'TH-F',
      type: 'fraktion',
      baseUrl: 'https://www.gruene-thl.de',
      cms: 'drupal',
      maxAgeYears: 12,
      // Fraktion dissolved after the 2024-09-01 Landtag election (Greens fell below 5%
      // and lost all seats). Site is being kept as an archive — last article 2024-09-17.
      // Skip in scheduled scrapeAllSources runs to stop wasting cycles re-indexing dormant chunks.
      dormant: true,
      contentPaths: [
        {
          type: 'presse',
          path: '/presse',
          listSelector: 'h3 a, .views-row a, .node-title a, article a[href]',
          paginationPattern: '?page={page}',
          paginationOffset: -1,
          maxPages: 497,
        },
        {
          type: 'blog',
          path: '/in-aktion',
          listSelector: 'h3 a, .views-row a, .node-title a, article a[href]',
          paginationPattern: '?page={page}',
          paginationOffset: -1,
          maxPages: 55,
        },
        {
          type: 'antrag',
          path: '/parlament',
          listSelector: 'h3 a, .views-row a, .node-title a, article a[href]',
          paginationPattern: '?page={page}',
          paginationOffset: -1,
          maxPages: 50,
        },
        {
          type: 'blog',
          path: '/bilanz',
          listSelector: 'h3 a, .views-row a, .node-title a, article a[href]',
          paginationPattern: '?page={page}',
          paginationOffset: -1,
          maxPages: 20,
        },
      ],
      contentSelectors: {
        title: ['h1', '.page-title', 'h1.title', 'meta[property="og:title"]'],
        date: ['time[datetime]', 'time', '.date', '.field--name-created'],
        content: ['article', '.node__content', '.field--name-body', 'main .content'],
        categories: ['.field--name-field-tags a', '.tags a'],
        author: ['.author', '.field--name-uid'],
      },
      excludePatterns: ['/sites/default/files/', '/modules/', '/themes/', '#', 'javascript:'],
    },

    // ═══════════════════════════════════════════════════════════════════
    // BRANDENBURG
    // ═══════════════════════════════════════════════════════════════════
    {
      id: 'brandenburg-lv',
      name: 'Grüne Brandenburg',
      shortName: 'BB',
      type: 'landesverband',
      baseUrl: 'https://gruene-brandenburg.de',
      cms: 'wordpress',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'presse',
          path: '/',
          listSelector: 'article a[href], h2 a, h3 a, .wp-block-heading a',
          sitemapUrls: ['https://gruene-brandenburg.de/wp-sitemap-posts-post-1.xml'],
        },
        {
          type: 'beschluss',
          path: '/beschluesse/',
          listSelector: 'a[href$=".pdf"]',
          isPdfArchive: true,
          maxPages: 1,
        },
        {
          type: 'wahlprogramm',
          path: '/wahlprogramme/',
          listSelector: 'a[href*="LTW2024"]',
          isPdfArchive: true,
          maxPages: 1,
        },
      ],
      contentSelectors: {
        title: ['h1', 'h1.wp-block-heading', '.entry-title', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.entry-date', 'meta[property="article:published_time"]'],
        content: ['.entry-content', '.wp-block-post-content', 'article .content', 'main article'],
        categories: ['a[rel="category tag"]', '.category-links a', '.post-categories a'],
        author: ['.author-name', '.byline', '.entry-author'],
      },
      excludePatterns: ['/tag/', '/author/', '/wp-admin/', '#', 'javascript:'],
    },
    {
      id: 'brandenburg-archive-presse',
      name: 'Grüne Brandenburg Archiv Presse',
      shortName: 'BB',
      type: 'landesverband',
      baseUrl: 'https://archiv.gruene-brandenburg.de',
      cms: 'typo3',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'presse',
          path: '/startseite',
          listSelector: 'a[href*="/single-news/"]',
          paginationPattern: '/seite-{page}',
          paginationOffset: -1,
          maxPages: 15,
        },
      ],
      contentSelectors: {
        title: ['h1', '.news-single h2', 'meta[property="og:title"]'],
        date: [
          'time[datetime]',
          'time',
          '.date',
          '.news-date',
          'meta[property="article:published_time"]',
        ],
        content: ['.news-text', '.bodytext', 'article', 'main .content'],
        categories: ['.news-category', '.tags a', 'a[href*="/themen/"]'],
        author: ['.author', '.byline'],
      },
      excludePatterns: ['/fileadmin/', '/typo3/', '#', 'javascript:', '.pdf', '.jpg', '.png'],
    },
    {
      id: 'brandenburg-archive-beschluesse',
      name: 'Grüne Brandenburg Archiv Beschlüsse',
      shortName: 'BB',
      type: 'landesverband',
      baseUrl: 'https://archiv.gruene-brandenburg.de',
      cms: 'typo3',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'beschluss',
          path: '/beschluesse',
          listSelector: 'a[href*="/beschluesse/"], a[href$=".pdf"]',
          maxPages: 1,
        },
      ],
      contentSelectors: {
        title: ['h1', '.news-single h2', 'meta[property="og:title"]'],
        date: [
          'time[datetime]',
          'time',
          '.date',
          '.news-date',
          'meta[property="article:published_time"]',
        ],
        content: ['.news-text', '.bodytext', 'article', 'main .content'],
        categories: ['.news-category', '.tags a'],
        author: ['.author', '.byline'],
      },
      excludePatterns: ['/fileadmin/', '/typo3/', '#', 'javascript:', '.jpg', '.png'],
    },
  ],
  curatedLists: [
    {
      id: 'wahlprogramm-be',
      label: 'Wahlprogramm',
      shortName: 'BE',
      // Store these /beschluesse chapters as content_type 'wahlprogramm' so they
      // surface under the "Typ" filter as Wahlprogramme, not "Beschluss".
      contentType: 'wahlprogramm',
      urls: [
        'https://gruene.berlin/beschluesse/unser-wahlprogramm_3762',
        'https://gruene.berlin/beschluesse/unser-wahlprogramm-1_3763',
        'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-2_3764',
        'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-3_3765',
        'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-4_3766',
        'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-5_3767',
        'https://gruene.berlin/beschluesse/unser-wahlprogramm-kapitel-6_3768',
      ],
    },
  ],
};

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  presse: 'Pressemitteilung',
  beschluss: 'Beschluss/Resolution',
  antrag: 'Antrag/Motion',
  blog: 'Blog/News',
  wahlprogramm: 'Wahlprogramm',
};

export const CMS_TYPES: Record<CMSType, CMSType> = {
  wordpress: 'wordpress',
  neos: 'neos',
  typo3: 'typo3',
  custom: 'custom',
  drupal: 'drupal',
};

export function getSourceById(id: string): LandesverbandSource | undefined {
  return LANDESVERBAENDE_CONFIG.sources.find((s) => s.id === id);
}

export function getSourcesByType(type: SourceType): LandesverbandSource[] {
  return LANDESVERBAENDE_CONFIG.sources.filter((s) => s.type === type);
}

export function getSourcesByLandesverband(shortName: string): LandesverbandSource[] {
  return LANDESVERBAENDE_CONFIG.sources.filter(
    (s) => s.shortName === shortName || s.shortName.startsWith(shortName)
  );
}

export function getAllSourceIds(): string[] {
  return LANDESVERBAENDE_CONFIG.sources.map((s) => s.id);
}

/**
 * Extract the trailing TYPO3-style id (e.g. `_3763`) from a URL pathname,
 * keyed by hostname so /beschluesse/foo_3763 and /news/foo_3763 collide
 * but /beschluesse/foo_3763 on different domains do not.
 *
 * Exported so search-result assembly can collapse alias duplicates by node id.
 */
export function trailingSlugKey(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/_(\d+)$/);
    return m ? `${u.hostname}#_${m[1]}` : null;
  } catch {
    return null;
  }
}

/**
 * Return the curated-list ids whose `urls` include the given URL. Matches
 * either by exact URL or by trailing TYPO3 slug id within the same hostname,
 * so curated lists keep working when a CMS aliases the same entry under
 * multiple paths (e.g. /beschluesse/x_NNN vs /news/x_NNN).
 */
export function getCuratedListsForUrl(url: string): string[] {
  const lists = LANDESVERBAENDE_CONFIG.curatedLists;
  if (!lists?.length) return [];

  const targetSlug = trailingSlugKey(url);
  const matched: string[] = [];

  for (const list of lists) {
    if (list.urls.includes(url)) {
      matched.push(list.id);
      continue;
    }
    if (targetSlug && list.urls.some((u) => trailingSlugKey(u) === targetSlug)) {
      matched.push(list.id);
    }
  }

  return matched;
}

/**
 * Return the content_type override for a URL if it belongs to a curated list
 * that declares one (e.g. wahlprogramm-be → 'wahlprogramm'). Matches by exact
 * URL or trailing TYPO3 slug id, same as getCuratedListsForUrl. Returns null
 * when no matched list overrides the type, so the caller keeps the scraper's.
 */
export function getCuratedContentTypeForUrl(url: string): ContentType | null {
  const lists = LANDESVERBAENDE_CONFIG.curatedLists;
  if (!lists?.length) return null;

  const targetSlug = trailingSlugKey(url);
  for (const list of lists) {
    if (!list.contentType) continue;
    if (list.urls.includes(url)) return list.contentType;
    if (targetSlug && list.urls.some((u) => trailingSlugKey(u) === targetSlug)) {
      return list.contentType;
    }
  }
  return null;
}

export default LANDESVERBAENDE_CONFIG;
