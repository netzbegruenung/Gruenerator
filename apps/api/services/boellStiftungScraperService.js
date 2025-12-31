import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { smartChunkDocument } from '../utils/textChunker.js';
import { fastEmbedService } from './FastEmbedService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { BRAND } from '../utils/domainUtils.js';

class BoellStiftungScraperService {
    constructor() {
        this.baseUrl = 'https://www.boell.de';
        this.collectionName = 'boell_stiftung_documents';
        this.qdrant = null;
        this.crawlDelay = 1000;
        this.batchSize = 10;
        this.maxDepth = 2;
        this.timeout = 30000;
        this.maxRetries = 3;
        this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';

        this.topicSlugs = [
            'afrika', 'arbeit', 'asien', 'aussen-sicherheitspolitik',
            'bildung', 'buergerbeteiligung', 'commons', 'digitalisierung',
            'energiewende', 'europaeische-union', 'europapolitik',
            'familienpolitik', 'feminismus', 'finanzen', 'film',
            'geoengineering', 'geschlechterdemokratie', 'gruene-geschichte',
            'heinrich-boell', 'hochschule', 'infrastruktur', 'inklusion',
            'klima', 'kohleausstieg', 'kommunalpolitik',
            'kuenstliche-intelligenz', 'landwirtschaft', 'lateinamerika',
            'literatur', 'lsbtiq', 'medienpolitik', 'menschenrechte',
            'migration', 'mobilitaet', 'naher-osten', 'nordafrika',
            'nordamerika', 'oeffentliche-raeume', 'ost-suedosteuropa',
            'plastik', 'politikforschung', 'populismus', 'ressourcen',
            'schule', 'sozialpolitik', 'stadtentwicklung', 'teilhabe',
            'theater', 'transatlantische-beziehungen', 'verkehrswende',
            'waermewende', 'weltwirtschaft', 'zeitdiagnose', 'zeitgeschichte'
        ];

        this.regionMapping = {
            'afrika': 'afrika',
            'asien': 'asien',
            'europaeische-union': 'europa',
            'europapolitik': 'europa',
            'lateinamerika': 'lateinamerika',
            'naher-osten': 'nahost',
            'nordafrika': 'nahost',
            'nordamerika': 'nordamerika',
            'ost-suedosteuropa': 'europa',
            'transatlantische-beziehungen': 'transatlantisch'
        };

        this.excludePatterns = [
            /\/publikationen(\/)?$/i,
            /\/publikationen\?/i,
            /\/veranstaltungen(\/)?$/i,
            /\/stipendien(\/)?$/i,
            /\/en\//i,
            /\/presse(\/)?$/i,
            /\/podcast(s)?(\/)?$/i,
            /\.(pdf|jpg|jpeg|png|gif|mp3|mp4|zip)$/i,
            /\/person\//i,
            /\/kontakt(\/)?$/i,
            /\/newsletter(\/)?$/i,
            /\/spenden(\/)?$/i,
            /\/service(\/)?$/i,
            /\/ueber-uns(\/)?$/i,
            /\/weltweit(\/)?$/i,
            /\/referate-institute(\/)?$/i,
            /\/themen(\/)?$/i,
            /\/suche(\/)?$/i,
            /\/archiv(\/)?$/i,
            /\/mediathek(\/)?$/i,
            /\/shop(\/)?$/i,
            /\/login(\/)?$/i,
            /\/register(\/)?$/i
        ];

        this.visited = new Set();
    }

    async init() {
        this.qdrant = getQdrantInstance();
        await this.qdrant.init();
        await fastEmbedService.init();
        console.log('[BoellStiftung] Service initialized');
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    generateContentHash(text) {
        return crypto.createHash('sha256')
            .update(text)
            .digest('hex')
            .substring(0, 16);
    }

    generatePointId(url, chunkIndex) {
        const combinedString = `boell_${url}_${chunkIndex}`;
        let hash = 0;
        for (let i = 0; i < combinedString.length; i++) {
            const char = combinedString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    isExcludedUrl(url) {
        return this.excludePatterns.some(pattern => pattern.test(url));
    }

    async fetchPage(url, retries = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'de-DE,de;q=0.9'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html')) {
                return null;
            }

            return await response.text();
        } catch (error) {
            clearTimeout(timeoutId);
            if (retries < this.maxRetries) {
                await this.delay(1000 * (retries + 1));
                return this.fetchPage(url, retries + 1);
            }
            throw error;
        }
    }

    extractContent(html, url) {
        const $ = cheerio.load(html);

        $('script, style, noscript, iframe, nav, header, footer').remove();
        $('.navigation, .sidebar, .cookie-banner, .cookie-notice, .popup, .modal').remove();
        $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
        $('.breadcrumb, .breadcrumb-nav, [aria-label*="Breadcrumb"]').remove();
        $('.social-share, .share-buttons, .related-content').remove();
        $('.author-info, .author-bio').remove();

        const title = $('meta[property="og:title"]').attr('content') ||
                     $('h1.page-title').first().text().trim() ||
                     $('h1').first().text().trim() ||
                     $('title').text().trim();

        const description = $('meta[name="description"]').attr('content') ||
                           $('meta[property="og:description"]').attr('content') || '';

        let publishedAt = null;
        const ogDate = $('meta[property="article:published_time"]').attr('content');
        if (ogDate) {
            publishedAt = ogDate;
        } else {
            const timeEl = $('time[datetime]').first();
            if (timeEl.length) {
                publishedAt = timeEl.attr('datetime');
            }
        }

        const contentSelectors = [
            '.field--name-body',
            '.node__content',
            'article .content',
            '.article-content',
            '.main-content',
            'main article',
            '.text-content',
            '[role="main"]'
        ];

        let contentText = '';
        for (const selector of contentSelectors) {
            const el = $(selector);
            if (el.length && el.text().trim().length > 100) {
                contentText = el.text();
                break;
            }
        }

        if (!contentText || contentText.trim().length < 100) {
            contentText = $('main').text() || $('body').text();
        }

        contentText = contentText
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        const contentType = this.detectContentType(url, $);
        const topics = this.extractTopics($, url);
        const region = this.detectRegion(url, topics);
        const authors = this.extractAuthors($);

        return {
            title: title.substring(0, 500),
            description: description.substring(0, 1000),
            text: contentText,
            publishedAt,
            contentType,
            topics,
            topic: topics[0] || null,
            region,
            authors
        };
    }

    detectContentType(url, $) {
        const urlLower = url.toLowerCase();

        if (urlLower.includes('atlas') || urlLower.includes('grafiken-und-lizenzbestimmungen')) {
            return 'atlas';
        }
        if (urlLower.includes('dossier')) {
            return 'dossier';
        }
        if (urlLower.includes('schwerpunkt')) {
            return 'schwerpunkt';
        }

        const bodyClass = $('body').attr('class') || '';
        if (bodyClass.includes('node-type-atlas')) return 'atlas';
        if (bodyClass.includes('node-type-dossier')) return 'dossier';
        if (bodyClass.includes('node-type-schwerpunkt')) return 'schwerpunkt';

        return 'artikel';
    }

    extractTopics($, url) {
        const topics = [];

        for (const slug of this.topicSlugs) {
            if (url.includes(`/themen/${slug}`) || url.includes(`/${slug}/`)) {
                topics.push(slug);
            }
        }

        $('.field--name-field-tags a, .tags a, .taxonomy a').each((_, el) => {
            const tag = $(el).text().trim().toLowerCase()
                .replace(/[äöü]/g, match => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' }[match]))
                .replace(/\s+/g, '-');
            if (this.topicSlugs.includes(tag) && !topics.includes(tag)) {
                topics.push(tag);
            }
        });

        return topics.slice(0, 5);
    }

    detectRegion(url, topics) {
        for (const topic of topics) {
            if (this.regionMapping[topic]) {
                return this.regionMapping[topic];
            }
        }

        for (const [slug, region] of Object.entries(this.regionMapping)) {
            if (url.includes(slug)) {
                return region;
            }
        }

        return null;
    }

    extractAuthors($) {
        const authors = [];

        $('.field--name-field-author a, .author a, .byline a').each((_, el) => {
            const name = $(el).text().trim();
            if (name && name.length > 2 && name.length < 100) {
                authors.push(name);
            }
        });

        return authors.slice(0, 5);
    }

    extractArticleLinks($, baseUrl) {
        const links = new Set();
        const datePattern = /\/de\/\d{4}\/\d{2}\/\d{2}\//;
        const themenPattern = /\/de\/themen\/[^\/]+\/.+/;

        $('a[href]').each((_, el) => {
            let href = $(el).attr('href');
            if (!href) return;

            if (href.startsWith('/')) {
                href = `${this.baseUrl}${href}`;
            }

            if (!href.startsWith(this.baseUrl)) return;
            if (!href.includes('/de/')) return;
            if (this.isExcludedUrl(href)) return;

            const cleanUrl = href.split('#')[0].split('?')[0];

            if (datePattern.test(cleanUrl) || themenPattern.test(cleanUrl)) {
                links.add(cleanUrl);
            }
        });

        return Array.from(links);
    }

    async articleExists(url) {
        try {
            const result = await this.qdrant.client.scroll(this.collectionName, {
                filter: {
                    must: [{ key: 'source_url', match: { value: url } }]
                },
                limit: 1,
                with_payload: ['content_hash', 'indexed_at'],
                with_vector: false
            });

            if (result.points && result.points.length > 0) {
                return result.points[0].payload;
            }
            return null;
        } catch {
            return null;
        }
    }

    async deleteArticle(url) {
        await this.qdrant.client.delete(this.collectionName, {
            filter: {
                must: [{ key: 'source_url', match: { value: url } }]
            }
        });
    }

    async processAndStoreArticle(url, content) {
        if (!content.text || content.text.length < 100) {
            return { stored: false, reason: 'too_short' };
        }

        const contentHash = this.generateContentHash(content.text);

        const existing = await this.articleExists(url);
        if (existing && existing.content_hash === contentHash) {
            return { stored: false, reason: 'unchanged' };
        }

        if (existing) {
            await this.deleteArticle(url);
        }

        const chunks = await smartChunkDocument(content.text, {
            baseMetadata: {
                title: content.title,
                source: 'boell_stiftung',
                source_url: url
            }
        });

        if (chunks.length === 0) {
            return { stored: false, reason: 'no_chunks' };
        }

        const chunkTexts = chunks.map(c => c.text || c.chunk_text);
        const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

        const subcategories = [...(content.topics || [])];
        if (content.region && !subcategories.includes(content.region)) {
            subcategories.push(content.region);
        }

        const points = chunks.map((chunk, index) => ({
            id: this.generatePointId(url, index),
            vector: embeddings[index],
            payload: {
                article_id: `boell_${contentHash}`,
                source_url: url,
                content_hash: contentHash,
                chunk_index: index,
                chunk_text: chunkTexts[index],
                content_type: content.contentType,
                primary_category: content.topic,
                subcategories: subcategories,
                title: content.title,
                description: content.description,
                authors: content.authors,
                published_at: content.publishedAt,
                source: 'boell_stiftung',
                indexed_at: new Date().toISOString()
            }
        }));

        for (let i = 0; i < points.length; i += 10) {
            const batch = points.slice(i, i + 10);
            await this.qdrant.client.upsert(this.collectionName, { points: batch });
        }

        return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
    }

    async discoverFromTopicPages() {
        const allUrls = new Set();

        console.log(`[BoellStiftung] Discovering URLs from ${this.topicSlugs.length} topic pages...`);

        for (const slug of this.topicSlugs) {
            const topicUrl = `${this.baseUrl}/de/themen/${slug}`;

            try {
                const html = await this.fetchPage(topicUrl);
                if (!html) continue;

                const $ = cheerio.load(html);
                const links = this.extractArticleLinks($, topicUrl);

                links.forEach(link => allUrls.add(link));
                console.log(`[BoellStiftung] Topic "${slug}": found ${links.length} links`);

                await this.delay(this.crawlDelay);
            } catch (error) {
                console.error(`[BoellStiftung] Failed to crawl topic "${slug}": ${error.message}`);
            }
        }

        console.log(`[BoellStiftung] Total unique URLs discovered: ${allUrls.size}`);
        return Array.from(allUrls);
    }

    async fullCrawl(options = {}) {
        const { forceUpdate = false, maxArticles = null } = options;
        const startTime = Date.now();

        console.log('\n[BoellStiftung] ═══════════════════════════════════════');
        console.log('[BoellStiftung] Starting full crawl');
        console.log(`[BoellStiftung] Force update: ${forceUpdate}`);
        if (maxArticles) console.log(`[BoellStiftung] Max articles: ${maxArticles}`);
        console.log('[BoellStiftung] ═══════════════════════════════════════\n');

        const result = {
            totalUrls: 0,
            stored: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            totalVectors: 0,
            duration: 0,
            skipReasons: {
                too_short: { count: 0, examples: [] },
                no_chunks: { count: 0, examples: [] },
                unchanged: { count: 0, examples: [] },
                excluded: { count: 0, examples: [] },
                fetch_error: { count: 0, examples: [] }
            }
        };

        try {
            const urls = await this.discoverFromTopicPages();
            result.totalUrls = urls.length;

            const urlsToProcess = maxArticles ? urls.slice(0, maxArticles) : urls;

            for (let i = 0; i < urlsToProcess.length; i++) {
                const url = urlsToProcess[i];

                if (this.visited.has(url)) {
                    continue;
                }
                this.visited.add(url);

                if (this.isExcludedUrl(url)) {
                    result.skipped++;
                    result.skipReasons.excluded.count++;
                    continue;
                }

                try {
                    const html = await this.fetchPage(url);
                    if (!html) {
                        result.skipped++;
                        continue;
                    }

                    const content = this.extractContent(html, url);

                    if (!forceUpdate) {
                        const existing = await this.articleExists(url);
                        if (existing) {
                            const contentHash = this.generateContentHash(content.text || '');
                            if (existing.content_hash === contentHash) {
                                result.skipped++;
                                result.skipReasons.unchanged.count++;
                                if (result.skipReasons.unchanged.examples.length < 5) {
                                    result.skipReasons.unchanged.examples.push(url);
                                }
                                continue;
                            }
                        }
                    }

                    const processResult = await this.processAndStoreArticle(url, content);

                    if (processResult.stored) {
                        if (processResult.updated) {
                            result.updated++;
                        } else {
                            result.stored++;
                        }
                        result.totalVectors += processResult.vectors;
                        console.log(`[BoellStiftung] ✓ [${i + 1}/${urlsToProcess.length}] "${content.title?.substring(0, 50)}" (${processResult.chunks} chunks)`);
                    } else {
                        result.skipped++;
                        const reason = processResult.reason;
                        if (result.skipReasons[reason]) {
                            result.skipReasons[reason].count++;
                            if (result.skipReasons[reason].examples.length < 5) {
                                result.skipReasons[reason].examples.push(url);
                            }
                        }
                    }

                } catch (error) {
                    console.error(`[BoellStiftung] ✗ Error ${url}: ${error.message}`);
                    result.errors++;
                    result.skipReasons.fetch_error.count++;
                    if (result.skipReasons.fetch_error.examples.length < 5) {
                        result.skipReasons.fetch_error.examples.push(url);
                    }
                }

                if (i % 10 === 0 && i > 0) {
                    console.log(`[BoellStiftung] Progress: ${result.stored} stored, ${result.updated} updated, ${result.skipped} skipped`);
                }

                await this.delay(this.crawlDelay);
            }

        } catch (error) {
            console.error('[BoellStiftung] Crawl failed:', error.message);
            throw error;
        }

        result.duration = Math.round((Date.now() - startTime) / 1000);

        console.log('\n[BoellStiftung] ═══════════════════════════════════════');
        console.log(`[BoellStiftung] COMPLETED: ${result.stored} new, ${result.updated} updated (${result.totalVectors} vectors)`);
        console.log(`[BoellStiftung] Skipped: ${result.skipped}, Errors: ${result.errors}`);
        console.log(`[BoellStiftung] Duration: ${result.duration}s`);

        if (result.skipped > 0) {
            console.log('\n[BoellStiftung] Skip Breakdown:');
            const sr = result.skipReasons;
            if (sr.unchanged.count > 0) console.log(`  • Unchanged: ${sr.unchanged.count}`);
            if (sr.too_short.count > 0) console.log(`  • Too short: ${sr.too_short.count}`);
            if (sr.no_chunks.count > 0) console.log(`  • No chunks: ${sr.no_chunks.count}`);
            if (sr.excluded.count > 0) console.log(`  • Excluded URL: ${sr.excluded.count}`);
            if (sr.fetch_error.count > 0) console.log(`  • Fetch errors: ${sr.fetch_error.count}`);
        }

        console.log('[BoellStiftung] ═══════════════════════════════════════');

        return result;
    }

    async incrementalUpdate() {
        return this.fullCrawl({ forceUpdate: false });
    }

    async searchArticles(query, options = {}) {
        const { contentType = null, topic = null, limit = 10, threshold = 0.35 } = options;

        const queryVector = await fastEmbedService.generateQueryEmbedding(query);

        const filter = { must: [] };
        if (contentType) {
            filter.must.push({ key: 'content_type', match: { value: contentType } });
        }
        if (topic) {
            filter.must.push({ key: 'primary_category', match: { value: topic } });
        }

        const searchResult = await this.qdrant.client.search(this.collectionName, {
            vector: queryVector,
            filter: filter.must.length > 0 ? filter : undefined,
            limit: limit * 3,
            score_threshold: threshold,
            with_payload: true
        });

        const articlesMap = new Map();
        for (const hit of searchResult) {
            const articleId = hit.payload.article_id;
            if (!articlesMap.has(articleId)) {
                articlesMap.set(articleId, {
                    id: articleId,
                    score: hit.score,
                    title: hit.payload.title,
                    content_type: hit.payload.content_type,
                    primary_category: hit.payload.primary_category,
                    subcategories: hit.payload.subcategories,
                    source_url: hit.payload.source_url,
                    matchedChunk: hit.payload.chunk_text
                });
            }

            if (articlesMap.size >= limit) break;
        }

        return {
            results: Array.from(articlesMap.values()),
            total: articlesMap.size
        };
    }

    async getStats() {
        try {
            const info = await this.qdrant.client.getCollection(this.collectionName);
            return {
                collection: this.collectionName,
                vectors_count: info.vectors_count,
                points_count: info.points_count,
                status: info.status
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    async getTopics() {
        try {
            const topics = new Set();
            let offset = null;

            do {
                const result = await this.qdrant.client.scroll(this.collectionName, {
                    limit: 100,
                    offset: offset,
                    with_payload: ['subcategories'],
                    with_vector: false
                });

                for (const point of result.points) {
                    if (point.payload.subcategories) {
                        point.payload.subcategories.forEach(t => topics.add(t));
                    }
                }

                offset = result.next_page_offset;
            } while (offset);

            return Array.from(topics).sort();
        } catch (error) {
            return [];
        }
    }

    async clearCollection() {
        console.log('[BoellStiftung] Clearing all documents...');
        try {
            let offset = null;
            const points = [];

            do {
                const result = await this.qdrant.client.scroll(this.collectionName, {
                    limit: 100,
                    offset: offset,
                    with_payload: false,
                    with_vector: false
                });

                points.push(...result.points.map(p => p.id));
                offset = result.next_page_offset;
            } while (offset);

            if (points.length > 0) {
                for (let i = 0; i < points.length; i += 100) {
                    const batch = points.slice(i, i + 100);
                    await this.qdrant.client.delete(this.collectionName, {
                        points: batch
                    });
                }
            }
        } catch (error) {
            console.error('[BoellStiftung] Clear failed:', error.message);
        }
        console.log('[BoellStiftung] Collection cleared');
    }
}

export const boellStiftungScraperService = new BoellStiftungScraperService();
export default boellStiftungScraperService;
