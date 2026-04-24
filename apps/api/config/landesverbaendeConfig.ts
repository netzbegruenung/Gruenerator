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

export type ContentType = 'presse' | 'beschluss' | 'antrag' | 'blog' | 'wahlprogramm';
export type CMSType = 'wordpress' | 'neos' | 'typo3' | 'custom' | 'drupal';
export type SourceType = 'landesverband' | 'fraktion';

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
  disableOffPathFilter?: boolean; // Optional: when true, skip the post-discovery filter that requires URLs to share the listing-path prefix. Auto-applied when sitemapUrls is set, since sitemap URLs are already canonical and rarely match the human-facing listing path (e.g. TYPO3 sitemaps emit /news/ while listings live under /nachrichten/).
}

export interface ContentSelectors {
  title: string[];
  date: string[];
  content: string[];
  categories: string[];
  author: string[];
}

export interface LandesverbandSource {
  id: string;
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

export interface LandesverbaendeConfig {
  sources: LandesverbandSource[];
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
          type: 'presse',
          path: '/category/pressemitteilung/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          paginationPattern: '/page/{page}/',
          maxPages: 50,
        },
        {
          type: 'beschluss',
          path: '/category/beschluesse/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          paginationPattern: '/page/{page}/',
          maxPages: 20,
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
          type: 'presse',
          path: '/presse/',
          listSelector: 'article a[href], h3 a, .elementor-post__title a',
          paginationPattern: '/page/{page}/',
          maxPages: 30,
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
          type: 'presse',
          path: '/presse/',
          listSelector: 'article a[href], h2 a, h3 a, .wp-block-heading a',
          paginationPattern: '/page/{page}/',
          maxPages: 50,
        },
        {
          type: 'antrag',
          path: '/category/antrag/',
          listSelector: 'article a[href], h2 a, h3 a',
          paginationPattern: '/page/{page}/',
          maxPages: 30,
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
          type: 'presse',
          path: '/nachrichten',
          listSelector: 'h2 a[href], h3 a[href]',
          // Same TYPO3 pagination defect as berlin-lv-beschluesse: tx_xblog_pi1[pointer]
          // is silently ignored upstream, so the listing only ever yields the rolling-10
          // newest. Cross-checked against the news sub-sitemap (1000 entries) and found 2
          // of the latest 5 articles missing from Qdrant — the rolling window doesn't keep
          // up with publish cadence between hourly runs. Switch to typed sub-sitemap
          // discovery; #normalizeUrl rewrites the canonical /news/ URLs back to the
          // /nachrichten/ alias so URL-based dedup matches the 190 existing Qdrant points.
          sitemapUrls: ['https://gruene.berlin/sitemap.xml'],
          sitemapFilter: '/nachrichten/',
        },
      ],
      contentSelectors: {
        title: ['h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.tx_xblog_pi1 .date', 'meta[property="article:published_time"]'],
        content: ['.tx_xblog_pi1', '.bodytext', 'article', 'main .content'],
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
        content: ['.tx_xblog_pi1', '.bodytext', 'article', 'main .content'],
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
    {
      id: 'berlin-lv-wahlprogramm',
      name: 'Grüne Berlin Wahlprogramm',
      shortName: 'BE',
      type: 'landesverband',
      baseUrl: 'https://gruene.berlin',
      cms: 'typo3',
      maxAgeYears: 5,
      contentPaths: [
        {
          type: 'wahlprogramm',
          path: '/news',
          listSelector: 'h2 a[href], h3 a[href]',
          staticUrls: [
            'https://gruene.berlin/news/unser-wahlprogramm_3762',
            'https://gruene.berlin/news/unser-wahlprogramm-1_3763',
            'https://gruene.berlin/news/unser-wahlprogramm-kapitel-2_3764',
            'https://gruene.berlin/news/unser-wahlprogramm-kapitel-3_3765',
            'https://gruene.berlin/news/unser-wahlprogramm-kapitel-4_3766',
            'https://gruene.berlin/news/unser-wahlprogramm-kapitel-5_3767',
            'https://gruene.berlin/news/unser-wahlprogramm-kapitel-6_3768',
          ],
        },
      ],
      contentSelectors: {
        title: ['h1', 'meta[property="og:title"]'],
        date: ['time[datetime]', '.tx_xblog_pi1 .date', 'meta[property="article:published_time"]'],
        content: ['.tx_xblog_pi1', '.bodytext', 'article', 'main .content'],
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
          type: 'presse',
          path: '/category/service/pressemitteilungen/',
          listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
          paginationPattern: '/page/{page}/',
          maxPages: 50,
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

export default LANDESVERBAENDE_CONFIG;
