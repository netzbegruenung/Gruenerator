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

export const LANDESVERBAENDE_CONFIG = {
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
                    maxPages: 50
                },
                {
                    type: 'beschluss',
                    path: '/category/beschluesse/',
                    listSelector: 'article a[href], .entry-title a, h2 a, h3 a',
                    paginationPattern: '/page/{page}/',
                    maxPages: 20
                }
            ],
            contentSelectors: {
                title: ['h1.entry-title', 'h1.wp-block-heading', 'h1'],
                date: ['time[datetime]', '.entry-date', 'meta[property="article:published_time"]'],
                content: ['.entry-content', '.wp-block-post-content', 'article .content', 'main article'],
                categories: ['a[rel="category tag"]', '.category-links a', '.post-categories a'],
                author: ['.author-name', '.byline', '.entry-author']
            },
            excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:']
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
                    maxPages: 70
                }
            ],
            contentSelectors: {
                title: ['h1', 'h2.headline', '.page-title', 'meta[property="og:title"]'],
                date: ['time', '.date', '.publication-date'],
                content: ['article', '.content-main', '.text-content', 'main'],
                categories: ['a[href*="/themen/"]', '.tags a'],
                author: ['.author', '.written-by']
            },
            excludePatterns: ['/_Resources/', '/assets/', '#', 'javascript:', '.pdf', '.jpg', '.png']
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
            contentPaths: [
                {
                    type: 'presse',
                    path: '/presse/',
                    listSelector: 'article a[href], h3 a, .elementor-post__title a',
                    paginationPattern: '/page/{page}/',
                    maxPages: 30
                },
                {
                    type: 'beschluss',
                    path: '/parteitags-beschluesse/',
                    listSelector: 'a[href*="/download/"], a[href$=".pdf"], article a[href]',
                    isPdfArchive: true,
                    maxPages: 1
                }
            ],
            contentSelectors: {
                title: ['h1', 'h1.elementor-heading-title', '.elementor-widget-heading h1'],
                date: ['.elementor-post-date', 'time[datetime]', '.post-date', 'meta[property="article:published_time"]'],
                content: ['.elementor-widget-container', '.entry-content', 'article', 'main'],
                categories: ['.elementor-post-taxonomy a', 'a[rel="category tag"]', '.post-categories a'],
                author: ['.author-name', '.elementor-author-name']
            },
            excludePatterns: ['/tag/', '/author/', '/wp-content/uploads/', '/wp-admin/', '#', 'javascript:']
        },
        {
            id: 'mecklenburg-vorpommern-fraktion',
            name: 'Grüne Fraktion Mecklenburg-Vorpommern',
            shortName: 'MV-F',
            type: 'fraktion',
            baseUrl: 'https://gruene-fraktion-mv.de',
            cms: 'wordpress',
            contentPaths: [
                {
                    type: 'presse',
                    path: '/presse/',
                    listSelector: 'article a[href], h2 a, h3 a, .wp-block-heading a',
                    paginationPattern: '/page/{page}/',
                    maxPages: 50
                },
                {
                    type: 'antrag',
                    path: '/category/antrag/',
                    listSelector: 'article a[href], h2 a, h3 a',
                    paginationPattern: '/page/{page}/',
                    maxPages: 30
                }
            ],
            contentSelectors: {
                title: ['h1.entry-title', 'h1.wp-block-heading', 'h1'],
                date: ['time[datetime]', '.entry-date', '.post-date', 'meta[property="article:published_time"]'],
                content: ['.entry-content', '.wp-block-paragraph', 'article .content', 'main article'],
                categories: ['a[rel="category tag"]', '.post-categories a', 'a[href*="/category/"]'],
                author: ['.author-name', '.byline']
            },
            excludePatterns: ['/tag/', '/author/', '/wp-content/', '/wp-admin/', '#', 'javascript:']
        }
    ]
};

export const CONTENT_TYPE_LABELS = {
    presse: 'Pressemitteilung',
    beschluss: 'Beschluss/Resolution',
    antrag: 'Antrag/Motion',
    blog: 'Blog/News'
};

export const CMS_TYPES = {
    wordpress: 'wordpress',
    neos: 'neos',
    typo3: 'typo3',
    custom: 'custom'
};

export function getSourceById(id) {
    return LANDESVERBAENDE_CONFIG.sources.find(s => s.id === id);
}

export function getSourcesByType(type) {
    return LANDESVERBAENDE_CONFIG.sources.filter(s => s.type === type);
}

export function getSourcesByLandesverband(shortName) {
    return LANDESVERBAENDE_CONFIG.sources.filter(s => s.shortName === shortName || s.shortName.startsWith(shortName));
}

export function getAllSourceIds() {
    return LANDESVERBAENDE_CONFIG.sources.map(s => s.id);
}

export default LANDESVERBAENDE_CONFIG;
