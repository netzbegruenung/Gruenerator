import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { smartChunkDocument } from '../utils/textChunker.js';
import { fastEmbedService } from './FastEmbedService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { BRAND } from '../utils/domainUtils.js';
import {
    LANDESVERBAENDE_CONFIG,
    CONTENT_TYPE_LABELS,
    getSourceById,
    getSourcesByType,
    getSourcesByLandesverband,
    getAllSourceIds
} from '../config/landesverbaendeConfig.js';

class LandesverbandScraperService {
    constructor() {
        this.collectionName = 'landesverbaende_documents';
        this.qdrant = null;
        this.mistralClient = null;
        this.crawlDelay = 2000;
        this.batchSize = 10;
        this.timeout = 60000;
        this.maxRetries = 3;
        this.userAgent = BRAND?.botUserAgent || 'Gruenerator-Bot/1.0';
    }

    async init() {
        this.qdrant = getQdrantInstance();
        await this.qdrant.init();
        await fastEmbedService.init();

        const mod = await import('../workers/mistralClient.js');
        this.mistralClient = mod.default || mod;

        console.log('[Landesverbaende] Service initialized');
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
        const combinedString = `lv_${url}_${chunkIndex}`;
        let hash = 0;
        for (let i = 0; i < combinedString.length; i++) {
            const char = combinedString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }

    extractDateFromPdfInfo(url, title, context) {
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
        const currentYear = new Date().getFullYear();

        const patterns = [
            /(\d{4})-(\d{1,2})-(\d{1,2})/,
            /(\d{1,2})-(\d{1,2})-(\d{4})/,
            /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
            /(\d{1,2})_(\d{1,2})_(\d{4})/,
            /(\d{4})_(\d{1,2})_(\d{1,2})/,
            /\b(20[0-2]\d)\b/,
            /\b(199\d)\b/,
        ];

        const texts = [url, title, context].filter(Boolean);

        for (const text of texts) {
            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    let year, month, day;

                    if (match.length === 4) {
                        if (match[1].length === 4) {
                            year = parseInt(match[1]);
                            month = parseInt(match[2]) || 1;
                            day = parseInt(match[3]) || 1;
                        } else if (match[3].length === 4) {
                            year = parseInt(match[3]);
                            month = parseInt(match[2]) || 1;
                            day = parseInt(match[1]) || 1;
                        }
                    } else if (match.length === 2) {
                        year = parseInt(match[1]);
                        month = 6;
                        day = 15;
                    }

                    if (year && year >= 1990 && year <= currentYear) {
                        const date = new Date(year, (month || 1) - 1, day || 1);
                        return {
                            date,
                            dateString: date.toISOString().split('T')[0],
                            isTooOld: date < tenYearsAgo
                        };
                    }
                }
            }
        }

        return { date: null, dateString: null, isTooOld: null };
    }

    async fetchUrl(url, retries = 0) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (retries < this.maxRetries) {
                await this.delay(1000 * (retries + 1));
                return this.fetchUrl(url, retries + 1);
            }
            throw error;
        }
    }

    normalizeUrl(url, baseUrl) {
        if (!url) return null;
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        if (url.startsWith('//')) {
            return 'https:' + url;
        }
        if (url.startsWith('/')) {
            return baseUrl + url;
        }
        return baseUrl + '/' + url;
    }

    shouldExcludeUrl(url, excludePatterns) {
        if (!url || !excludePatterns) return false;
        return excludePatterns.some(pattern => url.includes(pattern));
    }

    async extractArticleLinks(source, contentPath) {
        const links = new Set();
        let currentPage = 1;
        const maxPages = contentPath.maxPages || 10;

        while (currentPage <= maxPages) {
            let pageUrl;
            if (currentPage === 1) {
                pageUrl = source.baseUrl + contentPath.path;
            } else {
                const paginationPath = contentPath.paginationPattern
                    .replace('{page}', currentPage.toString());
                pageUrl = source.baseUrl + contentPath.path + paginationPath;
            }

            try {
                const response = await this.fetchUrl(pageUrl);
                const html = await response.text();
                const $ = cheerio.load(html);

                const beforeCount = links.size;

                $(contentPath.listSelector).each((_, el) => {
                    let href = $(el).attr('href');
                    if (!href) return;

                    href = this.normalizeUrl(href, source.baseUrl);
                    if (!href) return;

                    if (this.shouldExcludeUrl(href, source.excludePatterns)) return;

                    if (!href.startsWith(source.baseUrl)) return;

                    if (href !== source.baseUrl + contentPath.path &&
                        href !== source.baseUrl + contentPath.path + '/') {
                        links.add(href);
                    }
                });

                const newLinksFound = links.size - beforeCount;
                console.log(`[Landesverbaende] Page ${currentPage}: found ${newLinksFound} new links (total: ${links.size})`);

                if (newLinksFound === 0 && currentPage > 1) {
                    break;
                }

                currentPage++;
                await this.delay(500);

            } catch (error) {
                console.warn(`[Landesverbaende] Failed to fetch page ${currentPage}: ${error.message}`);
                break;
            }
        }

        return Array.from(links);
    }

    extractContentWordPress($, selectors) {
        $('script, style, noscript, iframe, nav, header, footer').remove();
        $('.navigation, .sidebar, .cookie-banner, .cookie-notice, .popup, .modal').remove();
        $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
        $('.breadcrumb, .breadcrumb-nav, [aria-label*="Breadcrumb"]').remove();
        $('.social-share, .share-buttons, .related-content, .comments').remove();
        $('.elementor-location-header, .elementor-location-footer').remove();

        let title = '';
        for (const sel of selectors.title) {
            if (sel.startsWith('meta')) {
                title = $(sel).attr('content') || '';
            } else {
                title = $(sel).first().text().trim();
            }
            if (title) break;
        }

        let publishedAt = null;
        for (const sel of selectors.date) {
            const el = $(sel).first();
            if (el.length) {
                publishedAt = el.attr('datetime') || el.attr('content') || el.text().trim();
                if (publishedAt) break;
            }
        }

        let contentText = '';
        for (const sel of selectors.content) {
            const el = $(sel);
            if (el.length && el.text().trim().length > 200) {
                contentText = el.text();
                break;
            }
        }

        if (!contentText || contentText.trim().length < 200) {
            contentText = $('main').text() || $('body').text();
        }

        const categories = [];
        const catSelector = selectors.categories?.join(', ') || 'a[rel="category tag"]';
        $(catSelector).each((_, el) => {
            const cat = $(el).text().trim();
            if (cat && !categories.includes(cat)) {
                categories.push(cat);
            }
        });

        contentText = contentText
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return { title, publishedAt, text: contentText, categories };
    }

    extractContentNeos($, selectors) {
        $('script, style, noscript, iframe, nav, header, footer').remove();
        $('.navigation, .cookie-consent, .breadcrumb, .social-share').remove();

        let title = '';
        for (const sel of selectors.title) {
            if (sel.startsWith('meta')) {
                title = $(sel).attr('content') || '';
            } else {
                title = $(sel).first().text().trim();
            }
            if (title) break;
        }

        let publishedAt = null;
        for (const sel of selectors.date) {
            const el = $(sel).first();
            if (el.length) {
                publishedAt = el.attr('datetime') || el.text().trim();
                if (publishedAt) break;
            }
        }

        let contentText = '';
        for (const sel of selectors.content) {
            const el = $(sel);
            if (el.length && el.text().trim().length > 200) {
                contentText = el.text();
                break;
            }
        }

        if (!contentText || contentText.trim().length < 200) {
            contentText = $('main').text() || $('body').text();
        }

        const categories = [];
        const catSelector = selectors.categories?.join(', ') || 'a[href*="/themen/"]';
        $(catSelector).each((_, el) => {
            const cat = $(el).text().trim();
            if (cat && !categories.includes(cat)) {
                categories.push(cat);
            }
        });

        contentText = contentText
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return { title, publishedAt, text: contentText, categories };
    }

    async extractPageContent(url, source) {
        const response = await this.fetchUrl(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        let extracted;
        switch (source.cms) {
            case 'neos':
                extracted = this.extractContentNeos($, source.contentSelectors);
                break;
            case 'wordpress':
            default:
                extracted = this.extractContentWordPress($, source.contentSelectors);
                break;
        }

        return extracted;
    }

    async extractTextFromPdfWithMistral(pdfBuffer, filename) {
        console.log(`[Landesverbaende] Extracting text from PDF with Mistral OCR: ${filename}`);

        const base64 = pdfBuffer.toString('base64');
        const dataUrl = `data:application/pdf;base64,${base64}`;

        try {
            const ocrResponse = await this.mistralClient.ocr.process({
                model: 'mistral-ocr-latest',
                document: { type: 'document_url', documentUrl: dataUrl },
                include_image_base64: false
            });

            const pages = ocrResponse?.pages || [];
            if (pages.length > 0) {
                const text = pages.map(p => (p.markdown || p.text || '').trim()).filter(Boolean).join('\n\n');
                console.log(`[Landesverbaende] Mistral OCR extracted ${text.length} chars from ${pages.length} pages`);
                return { text, pageCount: pages.length };
            }
        } catch (e) {
            console.warn('[Landesverbaende] Mistral OCR data-url attempt failed:', e.message);
        }

        let fileId;
        try {
            const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
            let res;
            if (this.mistralClient.files?.upload) {
                res = await this.mistralClient.files.upload({ file: { fileName: filename, content: blob } });
            } else if (this.mistralClient.files?.create) {
                res = await this.mistralClient.files.create({ file: { fileName: filename, content: blob } });
            } else {
                throw new Error('Mistral client does not expose a files upload method');
            }
            fileId = res?.id || res?.file?.id || res?.data?.id;
        } catch (e) {
            throw new Error(`Mistral file upload failed: ${e.message}`);
        }

        const ocrResponse = await this.mistralClient.ocr.process({
            model: 'mistral-ocr-latest',
            document: { type: 'file', fileId },
            include_image_base64: false
        });

        const pages = ocrResponse?.pages || [];
        const text = pages.map(p => (p.markdown || p.text || '').trim()).filter(Boolean).join('\n\n');
        console.log(`[Landesverbaende] Mistral OCR (file upload) extracted ${text.length} chars from ${pages.length} pages`);
        return { text, pageCount: pages.length };
    }

    async processPdfArchivePage(source, contentPath) {
        const pageUrl = source.baseUrl + contentPath.path;
        const response = await this.fetchUrl(pageUrl);
        const html = await response.text();
        const $ = cheerio.load(html);

        const pdfLinks = [];
        $(contentPath.listSelector).each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('.pdf') || href.includes('/download/'))) {
                pdfLinks.push({
                    url: this.normalizeUrl(href, source.baseUrl),
                    title: $(el).text().trim() || $(el).attr('title') || 'Dokument',
                    context: $(el).parent().text().trim().substring(0, 200)
                });
            }
        });

        return pdfLinks;
    }

    async documentExists(url) {
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

    async deleteDocument(url) {
        await this.qdrant.client.delete(this.collectionName, {
            filter: {
                must: [{ key: 'source_url', match: { value: url } }]
            }
        });
    }

    async processAndStoreDocument(source, contentType, url, content) {
        const { title, text, publishedAt, categories } = content;

        if (!text || text.length < 100) {
            return { stored: false, reason: 'too_short' };
        }

        if (publishedAt) {
            const pubDate = new Date(publishedAt);
            const tenYearsAgo = new Date();
            tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
            if (pubDate < tenYearsAgo) {
                return { stored: false, reason: 'too_old' };
            }
        }

        const contentHash = this.generateContentHash(text);

        const existing = await this.documentExists(url);
        if (existing && existing.content_hash === contentHash) {
            return { stored: false, reason: 'unchanged' };
        }

        if (existing) {
            await this.deleteDocument(url);
        }

        const documentTitle = title || `${source.name} - ${CONTENT_TYPE_LABELS[contentType] || contentType}`;

        const chunks = await smartChunkDocument(text, {
            baseMetadata: {
                title: documentTitle,
                source: 'landesverbaende_gruene',
                source_url: url
            }
        });

        if (chunks.length === 0) {
            return { stored: false, reason: 'no_chunks' };
        }

        const chunkTexts = chunks.map(c => c.text || c.chunk_text);
        const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

        const points = chunks.map((chunk, index) => ({
            id: this.generatePointId(url, index),
            vector: embeddings[index],
            payload: {
                document_id: `lv_${contentHash}`,
                source_url: url,
                source_id: source.id,
                source_name: source.name,
                landesverband: source.shortName,
                source_type: source.type,
                content_type: contentType,
                content_type_label: CONTENT_TYPE_LABELS[contentType] || contentType,
                content_hash: contentHash,
                chunk_index: index,
                chunk_text: chunkTexts[index],
                title: documentTitle,
                primary_category: categories?.[0] || null,
                subcategories: categories || [],
                published_at: publishedAt || null,
                indexed_at: new Date().toISOString(),
                source: 'landesverbaende_gruene'
            }
        }));

        for (let i = 0; i < points.length; i += this.batchSize) {
            const batch = points.slice(i, i + this.batchSize);
            await this.qdrant.client.upsert(this.collectionName, { points: batch });
        }

        return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
    }

    async scrapeContentPath(source, contentPath, options = {}) {
        const { forceUpdate = false, maxDocuments = null } = options;
        const result = {
            contentType: contentPath.type,
            stored: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            totalVectors: 0,
            skipReasons: {}
        };

        console.log(`\n[Landesverbaende] Scraping ${source.name} - ${contentPath.type} from ${contentPath.path}`);

        if (contentPath.isPdfArchive) {
            const pdfLinks = await this.processPdfArchivePage(source, contentPath);
            console.log(`[Landesverbaende] Found ${pdfLinks.length} PDF links`);

            // PDF Date Filtering (Cost Optimization)
            // Mistral OCR is expensive (~$0.01/page). We filter PDFs BEFORE OCR:
            // - Extract dates from URL, title, context (e.g., "24-5-2025", "2019")
            // - Skip PDFs older than 10 years (too_old)
            // - Skip PDFs without detectable dates (no_date) - conservative approach
            // This saved ~96% OCR costs on MV beschluss (828/862 skipped)
            const pdfLinksWithDates = pdfLinks.map(pdf => {
                const dateInfo = this.extractDateFromPdfInfo(pdf.url, pdf.title, pdf.context);
                return { ...pdf, dateInfo };
            });

            const recentPdfs = pdfLinksWithDates.filter(pdf => pdf.dateInfo.isTooOld === false);
            const oldPdfs = pdfLinksWithDates.filter(pdf => pdf.dateInfo.isTooOld === true);
            const undatedPdfs = pdfLinksWithDates.filter(pdf => pdf.dateInfo.isTooOld === null);

            if (oldPdfs.length > 0) {
                console.log(`[Landesverbaende] Skipping ${oldPdfs.length} PDFs older than 10 years`);
                result.skipped += oldPdfs.length;
                result.skipReasons['too_old'] = (result.skipReasons['too_old'] || 0) + oldPdfs.length;
            }

            if (undatedPdfs.length > 0) {
                console.log(`[Landesverbaende] Skipping ${undatedPdfs.length} PDFs without detectable dates (expensive OCR)`);
                result.skipped += undatedPdfs.length;
                result.skipReasons['no_date'] = (result.skipReasons['no_date'] || 0) + undatedPdfs.length;
            }

            const toProcess = maxDocuments ? recentPdfs.slice(0, maxDocuments) : recentPdfs;
            console.log(`[Landesverbaende] Processing ${toProcess.length} recent PDFs`);

            for (let i = 0; i < toProcess.length; i++) {
                const pdf = toProcess[i];
                try {
                    if (!forceUpdate) {
                        const existing = await this.documentExists(pdf.url);
                        if (existing) {
                            result.skipped++;
                            continue;
                        }
                    }

                    const response = await this.fetchUrl(pdf.url);
                    const arrayBuffer = await response.arrayBuffer();
                    const pdfBuffer = Buffer.from(arrayBuffer);

                    const filename = pdf.url.split('/').pop() || 'document.pdf';
                    const { text } = await this.extractTextFromPdfWithMistral(pdfBuffer, filename);

                    const storeResult = await this.processAndStoreDocument(source, contentPath.type, pdf.url, {
                        title: pdf.title,
                        text,
                        publishedAt: pdf.dateInfo.dateString,
                        categories: []
                    });

                    if (storeResult.stored) {
                        if (storeResult.updated) result.updated++;
                        else result.stored++;
                        result.totalVectors += storeResult.vectors;
                        console.log(`[Landesverbaende] ✓ PDF [${i + 1}/${toProcess.length}] ${pdf.title} (${pdf.dateInfo.dateString || 'no date'})`);
                    } else {
                        result.skipped++;
                        result.skipReasons[storeResult.reason] = (result.skipReasons[storeResult.reason] || 0) + 1;
                    }

                    await this.delay(this.crawlDelay);
                } catch (error) {
                    console.error(`[Landesverbaende] ✗ PDF error: ${error.message}`);
                    result.errors++;
                }
            }
        } else {
            const articleLinks = await this.extractArticleLinks(source, contentPath);
            console.log(`[Landesverbaende] Found ${articleLinks.length} article links`);

            const toProcess = maxDocuments ? articleLinks.slice(0, maxDocuments) : articleLinks;

            for (let i = 0; i < toProcess.length; i++) {
                const url = toProcess[i];
                try {
                    if (!forceUpdate) {
                        const existing = await this.documentExists(url);
                        if (existing) {
                            result.skipped++;
                            continue;
                        }
                    }

                    const content = await this.extractPageContent(url, source);
                    const storeResult = await this.processAndStoreDocument(source, contentPath.type, url, content);

                    if (storeResult.stored) {
                        if (storeResult.updated) result.updated++;
                        else result.stored++;
                        result.totalVectors += storeResult.vectors;
                        console.log(`[Landesverbaende] ✓ [${i + 1}/${toProcess.length}] ${content.title?.substring(0, 60) || url}`);
                    } else {
                        result.skipped++;
                        result.skipReasons[storeResult.reason] = (result.skipReasons[storeResult.reason] || 0) + 1;
                    }

                    await this.delay(this.crawlDelay);
                } catch (error) {
                    console.error(`[Landesverbaende] ✗ Error: ${error.message}`);
                    result.errors++;
                }
            }
        }

        return result;
    }

    async scrapeSource(sourceId, options = {}) {
        const source = getSourceById(sourceId);
        if (!source) {
            throw new Error(`Source not found: ${sourceId}`);
        }

        console.log(`\n[Landesverbaende] ═══════════════════════════════════════`);
        console.log(`[Landesverbaende] Scraping: ${source.name}`);
        console.log(`[Landesverbaende] Type: ${source.type}`);
        console.log(`[Landesverbaende] CMS: ${source.cms}`);
        console.log(`[Landesverbaende] Content paths: ${source.contentPaths.length}`);
        console.log(`[Landesverbaende] ═══════════════════════════════════════\n`);

        const result = {
            sourceId: source.id,
            sourceName: source.name,
            stored: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            totalVectors: 0,
            contentTypes: {}
        };

        for (const contentPath of source.contentPaths) {
            if (options.contentType && contentPath.type !== options.contentType) {
                continue;
            }

            const pathResult = await this.scrapeContentPath(source, contentPath, options);
            result.stored += pathResult.stored;
            result.updated += pathResult.updated;
            result.skipped += pathResult.skipped;
            result.errors += pathResult.errors;
            result.totalVectors += pathResult.totalVectors;
            result.contentTypes[contentPath.type] = pathResult;
        }

        return result;
    }

    async scrapeAllSources(options = {}) {
        const startTime = Date.now();
        const { sourceType = null, landesverband = null, contentType = null } = options;

        let sources = LANDESVERBAENDE_CONFIG.sources;

        if (sourceType) {
            sources = getSourcesByType(sourceType);
        }

        if (landesverband) {
            sources = getSourcesByLandesverband(landesverband);
        }

        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║       Landesverbaende Scraper - Full Crawl                ║');
        console.log('╚═══════════════════════════════════════════════════════════╝\n');
        console.log(`[Landesverbaende] Sources to process: ${sources.length}`);
        if (sourceType) console.log(`[Landesverbaende] Filter by type: ${sourceType}`);
        if (landesverband) console.log(`[Landesverbaende] Filter by LV: ${landesverband}`);
        if (contentType) console.log(`[Landesverbaende] Filter by content: ${contentType}`);

        const totalResult = {
            sourcesProcessed: 0,
            stored: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            totalVectors: 0,
            bySource: {},
            duration: 0
        };

        for (const source of sources) {
            try {
                const sourceResult = await this.scrapeSource(source.id, { ...options, contentType });
                totalResult.sourcesProcessed++;
                totalResult.stored += sourceResult.stored;
                totalResult.updated += sourceResult.updated;
                totalResult.skipped += sourceResult.skipped;
                totalResult.errors += sourceResult.errors;
                totalResult.totalVectors += sourceResult.totalVectors;
                totalResult.bySource[source.id] = sourceResult;
            } catch (error) {
                console.error(`[Landesverbaende] Failed to scrape ${source.id}: ${error.message}`);
                totalResult.errors++;
            }
        }

        totalResult.duration = Math.round((Date.now() - startTime) / 1000);

        console.log('\n╔═══════════════════════════════════════════════════════════╗');
        console.log('║                    CRAWL COMPLETE                         ║');
        console.log('╚═══════════════════════════════════════════════════════════╝');
        console.log(`[Landesverbaende] Sources processed: ${totalResult.sourcesProcessed}`);
        console.log(`[Landesverbaende] New documents: ${totalResult.stored}`);
        console.log(`[Landesverbaende] Updated: ${totalResult.updated}`);
        console.log(`[Landesverbaende] Skipped: ${totalResult.skipped}`);
        console.log(`[Landesverbaende] Errors: ${totalResult.errors}`);
        console.log(`[Landesverbaende] Total vectors: ${totalResult.totalVectors}`);
        console.log(`[Landesverbaende] Duration: ${totalResult.duration}s`);

        return totalResult;
    }

    async searchDocuments(query, options = {}) {
        const {
            sourceId = null,
            landesverband = null,
            sourceType = null,
            contentType = null,
            limit = 10,
            threshold = 0.35
        } = options;

        const queryVector = await fastEmbedService.generateQueryEmbedding(query);

        const filter = { must: [] };
        if (sourceId) filter.must.push({ key: 'source_id', match: { value: sourceId } });
        if (landesverband) filter.must.push({ key: 'landesverband', match: { value: landesverband } });
        if (sourceType) filter.must.push({ key: 'source_type', match: { value: sourceType } });
        if (contentType) filter.must.push({ key: 'content_type', match: { value: contentType } });

        const searchResult = await this.qdrant.client.search(this.collectionName, {
            vector: queryVector,
            filter: filter.must.length > 0 ? filter : undefined,
            limit: limit * 3,
            score_threshold: threshold,
            with_payload: true
        });

        const documentsMap = new Map();
        for (const hit of searchResult) {
            const docId = hit.payload.document_id;
            if (!documentsMap.has(docId)) {
                documentsMap.set(docId, {
                    id: docId,
                    score: hit.score,
                    title: hit.payload.title,
                    sourceId: hit.payload.source_id,
                    sourceName: hit.payload.source_name,
                    landesverband: hit.payload.landesverband,
                    sourceType: hit.payload.source_type,
                    contentType: hit.payload.content_type,
                    contentTypeLabel: hit.payload.content_type_label,
                    source_url: hit.payload.source_url,
                    publishedAt: hit.payload.published_at,
                    matchedChunk: hit.payload.chunk_text
                });
            }

            if (documentsMap.size >= limit) break;
        }

        return {
            results: Array.from(documentsMap.values()),
            total: documentsMap.size
        };
    }

    async getStats() {
        try {
            const info = await this.qdrant.client.getCollection(this.collectionName);

            const sourceStats = {};
            for (const source of LANDESVERBAENDE_CONFIG.sources) {
                try {
                    const result = await this.qdrant.client.count(this.collectionName, {
                        filter: {
                            must: [{ key: 'source_id', match: { value: source.id } }]
                        }
                    });
                    sourceStats[source.id] = {
                        name: source.name,
                        type: source.type,
                        vectors: result.count || 0
                    };
                } catch {
                    sourceStats[source.id] = { name: source.name, type: source.type, vectors: 0 };
                }
            }

            return {
                collection: this.collectionName,
                vectors_count: info.vectors_count,
                points_count: info.points_count,
                status: info.status,
                sources: sourceStats
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    async clearSource(sourceId) {
        console.log(`[Landesverbaende] Clearing source: ${sourceId}`);
        await this.qdrant.client.delete(this.collectionName, {
            filter: {
                must: [{ key: 'source_id', match: { value: sourceId } }]
            }
        });
        console.log(`[Landesverbaende] Source ${sourceId} cleared`);
    }

    async clearCollection() {
        console.log('[Landesverbaende] Clearing entire collection...');
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
            console.error('[Landesverbaende] Clear failed:', error.message);
        }
        console.log('[Landesverbaende] Collection cleared');
    }

    getSources() {
        return LANDESVERBAENDE_CONFIG.sources.map(s => ({
            id: s.id,
            name: s.name,
            shortName: s.shortName,
            type: s.type,
            baseUrl: s.baseUrl,
            cms: s.cms,
            contentTypes: s.contentPaths.map(cp => cp.type)
        }));
    }
}

export const landesverbandScraperService = new LandesverbandScraperService();
export default landesverbandScraperService;
