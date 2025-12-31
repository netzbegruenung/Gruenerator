import { smartChunkDocument } from '../utils/textChunker.js';
import { fastEmbedService } from './FastEmbedService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';

class KommunalwikiScraperService {
    constructor() {
        this.baseUrl = 'https://kommunalwiki.boell.de';
        this.apiUrl = `${this.baseUrl}/w/api.php`;
        this.collectionName = 'kommunalwiki_documents';
        this.qdrant = null;
        this.crawlDelay = 500;
        this.batchSize = 50;
    }

    async init() {
        this.qdrant = getQdrantInstance();
        await this.qdrant.init();
        await fastEmbedService.init();
        console.log('[KommunalWiki] Service initialized');
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getAllArticleTitles() {
        const articles = [];
        let apcontinue = null;

        console.log('[KommunalWiki] Fetching all article titles...');

        do {
            const params = new URLSearchParams({
                action: 'query',
                list: 'allpages',
                aplimit: '500',
                apnamespace: '0',
                format: 'json'
            });
            if (apcontinue) params.set('apcontinue', apcontinue);

            const response = await fetch(`${this.apiUrl}?${params}`);
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.query?.allpages) {
                articles.push(...data.query.allpages.map(p => ({
                    title: p.title,
                    pageid: p.pageid
                })));
            }

            apcontinue = data.continue?.apcontinue;

            if (apcontinue) {
                await this.delay(this.crawlDelay);
            }
        } while (apcontinue);

        console.log(`[KommunalWiki] Found ${articles.length} articles`);
        return articles;
    }

    async getArticleContent(pageids) {
        const params = new URLSearchParams({
            action: 'query',
            pageids: pageids.join('|'),
            prop: 'revisions|categories',
            rvprop: 'content|timestamp',
            rvslots: 'main',
            cllimit: 'max',
            format: 'json'
        });

        const response = await fetch(`${this.apiUrl}?${params}`);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return await response.json();
    }

    cleanWikiContent(wikiText) {
        if (!wikiText) return '';

        return wikiText
            .replace(/\[\[Kategorie:[^\]]+\]\]/gi, '')
            .replace(/\[\[Datei:[^\]]+\]\]/gi, '')
            .replace(/\[\[Bild:[^\]]+\]\]/gi, '')
            .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1')
            .replace(/\[\[([^\]]+)\]\]/g, '$1')
            .replace(/\[https?:[^\s\]]+\s+([^\]]+)\]/g, '$1')
            .replace(/\[https?:[^\s\]]+\]/g, '')
            .replace(/\{\{[^}]+\}\}/g, '')
            .replace(/<ref[^>]*>.*?<\/ref>/gs, '')
            .replace(/<ref[^>]*\/>/g, '')
            .replace(/={2,6}\s*(.+?)\s*={2,6}/gm, (m, h) => `\n## ${h}\n`)
            .replace(/'{5}([^']+)'{5}/g, '$1')
            .replace(/'{3}([^']+)'{3}/g, '$1')
            .replace(/'{2}([^']+)'{2}/g, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\*+\s*/gm, '• ')
            .replace(/^#+\s*/gm, '')
            .trim();
    }

    extractCategories(page) {
        const categories = page.categories || [];
        return categories
            .map(c => c.title.replace('Kategorie:', ''))
            .filter(c => !c.startsWith('!'));
    }

    detectArticleType(title, categories) {
        const catSet = new Set(categories.map(c => c.toLowerCase()));

        if (catSet.has('sachgebiet') || catSet.has('sachgebiete')) return 'sachgebiet';
        if (catSet.has('literatur')) return 'literatur';
        if (catSet.has('personalien')) return 'personalien';
        if (catSet.has('praxishilfen') || catSet.has('praxishilfe')) return 'praxishilfe';
        if (catSet.has('faq') || catSet.has('fragen und antworten')) return 'faq';

        return 'artikel';
    }

    generatePointId(pageid, chunkIndex) {
        const combinedString = `kommunalwiki_${pageid}_${chunkIndex}`;
        let hash = 0;
        for (let i = 0; i < combinedString.length; i++) {
            const char = combinedString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    async articleExists(pageid) {
        try {
            const result = await this.qdrant.client.scroll(this.collectionName, {
                filter: {
                    must: [{ key: 'pageid', match: { value: pageid } }]
                },
                limit: 1,
                with_payload: ['published_at'],
                with_vector: false
            });

            if (result.points && result.points.length > 0) {
                return result.points[0].payload.published_at;
            }
            return null;
        } catch {
            return null;
        }
    }

    async deleteArticle(pageid) {
        await this.qdrant.client.delete(this.collectionName, {
            filter: {
                must: [{ key: 'pageid', match: { value: pageid } }]
            }
        });
    }

    async processAndStoreArticle(article, wikiContent, categories, timestamp) {
        const cleanedContent = this.cleanWikiContent(wikiContent);

        if (cleanedContent.length < 100) {
            return { stored: false, reason: 'too_short' };
        }

        const chunks = await smartChunkDocument(cleanedContent, {
            baseMetadata: {
                title: article.title,
                source: 'kommunalwiki',
                source_url: `${this.baseUrl}/index.php/${encodeURIComponent(article.title.replace(/ /g, '_'))}`
            }
        });

        if (chunks.length === 0) {
            return { stored: false, reason: 'no_chunks' };
        }

        const chunkTexts = chunks.map(c => c.text || c.chunk_text);
        const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

        const articleType = this.detectArticleType(article.title, categories);
        const primaryCategory = categories.length > 0 ? categories[0] : null;

        const points = chunks.map((chunk, index) => ({
            id: this.generatePointId(article.pageid, index),
            vector: embeddings[index],
            payload: {
                article_id: `kommunalwiki_${article.pageid}`,
                pageid: article.pageid,
                chunk_index: index,
                chunk_text: chunkTexts[index],
                title: article.title,
                primary_category: primaryCategory,
                subcategories: categories,
                content_type: articleType,
                source_url: `${this.baseUrl}/index.php/${encodeURIComponent(article.title.replace(/ /g, '_'))}`,
                published_at: timestamp,
                indexed_at: new Date().toISOString()
            }
        }));

        for (let i = 0; i < points.length; i += 10) {
            const batch = points.slice(i, i + 10);
            await this.qdrant.client.upsert(this.collectionName, { points: batch });
        }

        return { stored: true, chunks: chunks.length, vectors: points.length };
    }

    async fullCrawl(options = {}) {
        const { forceUpdate = false } = options;
        const startTime = Date.now();

        console.log('\n[KommunalWiki] ═══════════════════════════════════════');
        console.log('[KommunalWiki] Starting full crawl');
        console.log(`[KommunalWiki] Force update: ${forceUpdate}`);
        console.log('[KommunalWiki] ═══════════════════════════════════════\n');

        const result = {
            totalArticles: 0,
            stored: 0,
            skipped: 0,
            updated: 0,
            errors: 0,
            totalVectors: 0,
            duration: 0,
            skipReasons: {
                redirect: { count: 0, examples: [] },
                too_short: { count: 0, examples: [] },
                no_content: { count: 0, examples: [] },
                no_revision: { count: 0, examples: [] },
                no_chunks: { count: 0, examples: [] },
                already_exists: { count: 0, examples: [] }
            }
        };

        try {
            const articles = await this.getAllArticleTitles();
            result.totalArticles = articles.length;

            for (let i = 0; i < articles.length; i += this.batchSize) {
                const batch = articles.slice(i, i + this.batchSize);
                const batchNum = Math.floor(i / this.batchSize) + 1;
                const totalBatches = Math.ceil(articles.length / this.batchSize);

                console.log(`\n[KommunalWiki] ─── Batch ${batchNum}/${totalBatches} (articles ${i + 1}-${Math.min(i + this.batchSize, articles.length)}) ───`);

                const pageids = batch.map(a => a.pageid);

                try {
                    const contentData = await this.getArticleContent(pageids);
                    const pages = contentData.query?.pages || {};

                    for (const pageid of Object.keys(pages)) {
                        const page = pages[pageid];
                        const article = batch.find(a => a.pageid === parseInt(pageid));

                        if (!article || !page.revisions?.[0]) {
                            result.skipped++;
                            result.skipReasons.no_revision.count++;
                            if (result.skipReasons.no_revision.examples.length < 10) {
                                result.skipReasons.no_revision.examples.push(article?.title || `pageid:${pageid}`);
                            }
                            continue;
                        }

                        const revision = page.revisions[0];
                        const wikiContent = revision.slots?.main?.['*'] || revision['*'];
                        const timestamp = revision.timestamp;
                        const categories = this.extractCategories(page);

                        if (!wikiContent) {
                            result.skipped++;
                            result.skipReasons.no_content.count++;
                            if (result.skipReasons.no_content.examples.length < 10) {
                                result.skipReasons.no_content.examples.push(article.title);
                            }
                            continue;
                        }

                        if (wikiContent.trim().toUpperCase().startsWith('#REDIRECT') ||
                            wikiContent.trim().toUpperCase().startsWith('#WEITERLEITUNG')) {
                            result.skipped++;
                            result.skipReasons.redirect.count++;
                            if (result.skipReasons.redirect.examples.length < 10) {
                                result.skipReasons.redirect.examples.push(article.title);
                            }
                            continue;
                        }

                        if (!forceUpdate) {
                            const existingTimestamp = await this.articleExists(article.pageid);
                            if (existingTimestamp) {
                                if (new Date(timestamp) <= new Date(existingTimestamp)) {
                                    result.skipped++;
                                    result.skipReasons.already_exists.count++;
                                    if (result.skipReasons.already_exists.examples.length < 10) {
                                        result.skipReasons.already_exists.examples.push(article.title);
                                    }
                                    continue;
                                }
                                await this.deleteArticle(article.pageid);
                                result.updated++;
                            }
                        } else {
                            const exists = await this.articleExists(article.pageid);
                            if (exists) {
                                await this.deleteArticle(article.pageid);
                            }
                        }

                        try {
                            const processResult = await this.processAndStoreArticle(
                                article,
                                wikiContent,
                                categories,
                                timestamp
                            );

                            if (processResult.stored) {
                                result.stored++;
                                result.totalVectors += processResult.vectors;
                                console.log(`[KommunalWiki] ✓ "${article.title.substring(0, 50)}" (${processResult.chunks} chunks)`);
                            } else {
                                result.skipped++;
                                const reason = processResult.reason;
                                if (reason === 'too_short') {
                                    result.skipReasons.too_short.count++;
                                    if (result.skipReasons.too_short.examples.length < 10) {
                                        result.skipReasons.too_short.examples.push(article.title);
                                    }
                                } else if (reason === 'no_chunks') {
                                    result.skipReasons.no_chunks.count++;
                                    if (result.skipReasons.no_chunks.examples.length < 10) {
                                        result.skipReasons.no_chunks.examples.push(article.title);
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`[KommunalWiki] ✗ Error: ${article.title}: ${err.message}`);
                            result.errors++;
                        }
                    }

                    console.log(`[KommunalWiki] Progress: ${result.stored} stored, ${result.skipped} skipped, ${result.errors} errors`);

                } catch (err) {
                    console.error(`[KommunalWiki] Batch error: ${err.message}`);
                    result.errors += batch.length;
                }

                await this.delay(this.crawlDelay);
            }

        } catch (error) {
            console.error('[KommunalWiki] Crawl failed:', error.message);
            throw error;
        }

        result.duration = Math.round((Date.now() - startTime) / 1000);

        console.log('\n[KommunalWiki] ═══════════════════════════════════════');
        console.log(`[KommunalWiki] COMPLETED: ${result.stored} articles (${result.totalVectors} vectors)`);
        console.log(`[KommunalWiki] Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
        console.log(`[KommunalWiki] Duration: ${result.duration}s`);

        if (result.skipped > 0) {
            console.log('\n[KommunalWiki] Skip Breakdown:');
            const sr = result.skipReasons;
            if (sr.redirect.count > 0) {
                console.log(`  • Redirects: ${sr.redirect.count}`);
                if (sr.redirect.examples.length > 0) console.log(`    Examples: ${sr.redirect.examples.slice(0, 5).join(', ')}`);
            }
            if (sr.too_short.count > 0) {
                console.log(`  • Too short (<100 chars): ${sr.too_short.count}`);
                if (sr.too_short.examples.length > 0) console.log(`    Examples: ${sr.too_short.examples.slice(0, 5).join(', ')}`);
            }
            if (sr.already_exists.count > 0) {
                console.log(`  • Already indexed: ${sr.already_exists.count}`);
            }
            if (sr.no_content.count > 0) {
                console.log(`  • No content: ${sr.no_content.count}`);
                if (sr.no_content.examples.length > 0) console.log(`    Examples: ${sr.no_content.examples.slice(0, 5).join(', ')}`);
            }
            if (sr.no_revision.count > 0) {
                console.log(`  • No revision data: ${sr.no_revision.count}`);
            }
            if (sr.no_chunks.count > 0) {
                console.log(`  • No chunks generated: ${sr.no_chunks.count}`);
                if (sr.no_chunks.examples.length > 0) console.log(`    Examples: ${sr.no_chunks.examples.slice(0, 5).join(', ')}`);
            }
        }

        console.log('[KommunalWiki] ═══════════════════════════════════════');

        return result;
    }

    async incrementalUpdate() {
        return this.fullCrawl({ forceUpdate: false });
    }

    async searchArticles(query, options = {}) {
        const { category = null, articleType = null, limit = 10, threshold = 0.35 } = options;

        const queryVector = await fastEmbedService.generateQueryEmbedding(query);

        const filter = { must: [] };
        if (category) {
            filter.must.push({ key: 'primary_category', match: { value: category } });
        }
        if (articleType) {
            filter.must.push({ key: 'content_type', match: { value: articleType } });
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
                    primary_category: hit.payload.primary_category,
                    subcategories: hit.payload.subcategories,
                    content_type: hit.payload.content_type,
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

    async getCategories() {
        try {
            const categories = new Set();
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
                        point.payload.subcategories.forEach(c => categories.add(c));
                    }
                }

                offset = result.next_page_offset;
            } while (offset);

            return Array.from(categories).sort();
        } catch (error) {
            return [];
        }
    }

    async clearCollection() {
        console.log('[KommunalWiki] Clearing all documents...');
        try {
            await this.qdrant.client.delete(this.collectionName, {
                filter: {
                    must: [{ key: 'pageid', match: { any: [] } }]
                }
            });
        } catch {
            const points = [];
            let offset = null;

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
        }
        console.log('[KommunalWiki] Collection cleared');
    }
}

export const kommunalwikiScraperService = new KommunalwikiScraperService();
export default kommunalwikiScraperService;
