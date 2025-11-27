import cron from 'node-cron';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import { WebsiteCrawlerService } from './websiteCrawlerService.js';
import { BundestagContentProcessor } from './bundestagContentProcessor.js';
import { fastEmbedService } from './FastEmbedService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('BundestagSync');

/**
 * Bundestag Content Sync Service
 * Handles scheduled synchronization of gruene-bundestag.de content
 */
class BundestagSyncService {
    constructor(options = {}) {
        this.syncInterval = options.syncInterval || '0 3 * * *'; // Daily at 3 AM
        this.isRunning = false;
        this.lastSyncTime = null;
        this.lastSyncResult = null;
        this.cronJob = null;

        // Crawler config
        this.crawlerConfig = {
            baseUrl: options.baseUrl || 'https://www.gruene-bundestag.de',
            allowedPaths: options.allowedPaths || ['/unsere-politik/', '/presse/'],
            maxDepth: options.maxDepth || 3,
            maxPages: options.maxPages || 500,
            crawlDelay: options.crawlDelay || 1000
        };
    }

    /**
     * Start scheduled synchronization
     */
    startScheduledSync() {
        if (this.cronJob) {
            log.warn('Scheduled sync already running');
            return;
        }

        log.info(`Starting scheduled sync with interval: ${this.syncInterval}`);

        this.cronJob = cron.schedule(this.syncInterval, async () => {
            log.info('Scheduled sync triggered');
            try {
                await this.incrementalSync();
            } catch (error) {
                log.error(`Scheduled sync failed: ${error.message}`);
            }
        });

        log.info('Scheduled sync started');
    }

    /**
     * Stop scheduled synchronization
     */
    stopScheduledSync() {
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            log.info('Scheduled sync stopped');
        }
    }

    /**
     * Perform incremental sync
     * Only processes new or changed content
     */
    async incrementalSync() {
        if (this.isRunning) {
            log.warn('Sync already in progress, skipping');
            return { success: false, reason: 'already_running' };
        }

        this.isRunning = true;
        const startTime = Date.now();

        log.info('Starting incremental sync...');

        const result = {
            success: true,
            startTime: new Date().toISOString(),
            pagesProcessed: 0,
            newPages: 0,
            updatedPages: 0,
            deletedPages: 0,
            totalChunks: 0,
            errors: []
        };

        try {
            // Initialize services
            await fastEmbedService.init();
            const qdrant = getQdrantInstance();
            await qdrant.init();

            // Get existing indexed URLs
            const existingUrls = await qdrant.getAllBundestagUrls();
            const existingUrlMap = new Map(existingUrls.map(u => [u.url, u]));
            log.info(`Found ${existingUrls.length} existing indexed URLs`);

            // Crawl site
            const crawler = new WebsiteCrawlerService(this.crawlerConfig);
            const crawledPages = await crawler.crawlSite();
            log.info(`Crawled ${crawledPages.length} pages`);

            const crawledUrlSet = new Set(crawledPages.map(p => p.url));

            // Process content
            const processor = new BundestagContentProcessor();

            // Find new and updated pages
            for (const page of crawledPages) {
                const existing = existingUrlMap.get(page.url);

                try {
                    if (!existing) {
                        // New page
                        await this.indexPage(qdrant, processor, page);
                        result.newPages++;
                        result.pagesProcessed++;
                        log.debug(`New page indexed: ${page.url}`);

                    } else if (existing.content_hash !== page.content_hash) {
                        // Updated page
                        await qdrant.deleteBundestagContentByUrl(page.url);
                        await this.indexPage(qdrant, processor, page);
                        result.updatedPages++;
                        result.pagesProcessed++;
                        log.debug(`Updated page reindexed: ${page.url}`);
                    }
                    // Unchanged pages are skipped

                } catch (error) {
                    result.errors.push({ url: page.url, error: error.message });
                    log.error(`Error processing ${page.url}: ${error.message}`);
                }
            }

            // Find deleted pages (pages that no longer exist on the site)
            for (const [url] of existingUrlMap) {
                if (!crawledUrlSet.has(url)) {
                    try {
                        await qdrant.deleteBundestagContentByUrl(url);
                        result.deletedPages++;
                        log.debug(`Deleted page removed: ${url}`);
                    } catch (error) {
                        result.errors.push({ url, error: `Delete failed: ${error.message}` });
                    }
                }
            }

            result.duration = (Date.now() - startTime) / 1000;
            result.endTime = new Date().toISOString();

            log.info(`Sync completed: ${result.newPages} new, ${result.updatedPages} updated, ${result.deletedPages} deleted`);

        } catch (error) {
            result.success = false;
            result.error = error.message;
            log.error(`Sync failed: ${error.message}`);

        } finally {
            this.isRunning = false;
            this.lastSyncTime = new Date();
            this.lastSyncResult = result;
        }

        return result;
    }

    /**
     * Index a single page
     * @private
     */
    async indexPage(qdrant, processor, page) {
        const chunks = await processor.processPage(page);

        if (chunks.length === 0) {
            return 0;
        }

        const metadata = {
            title: page.title,
            section: page.section,
            published_at: page.published_at,
            content_hash: page.content_hash
        };

        await qdrant.indexBundestagContent(page.url, chunks, metadata);

        return chunks.length;
    }

    /**
     * Perform full sync (reindex everything)
     */
    async fullSync() {
        log.info('Starting full sync (reindexing all content)...');

        // Delete all existing content
        const qdrant = getQdrantInstance();
        await qdrant.init();

        const existingUrls = await qdrant.getAllBundestagUrls();
        log.info(`Deleting ${existingUrls.length} existing entries...`);

        for (const { url } of existingUrls) {
            try {
                await qdrant.deleteBundestagContentByUrl(url);
            } catch (error) {
                log.error(`Failed to delete ${url}: ${error.message}`);
            }
        }

        // Run incremental sync (which will now index everything)
        return await this.incrementalSync();
    }

    /**
     * Get sync status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isScheduled: !!this.cronJob,
            syncInterval: this.syncInterval,
            lastSyncTime: this.lastSyncTime?.toISOString() || null,
            lastSyncResult: this.lastSyncResult
        };
    }

    /**
     * Get last sync time from indexed content
     */
    async getLastSyncTime() {
        try {
            const qdrant = getQdrantInstance();
            await qdrant.init();

            const urls = await qdrant.getAllBundestagUrls();

            if (urls.length === 0) {
                return null;
            }

            // Find most recent last_synced timestamp
            let maxTime = null;
            for (const { last_synced } of urls) {
                if (last_synced) {
                    const time = new Date(last_synced);
                    if (!maxTime || time > maxTime) {
                        maxTime = time;
                    }
                }
            }

            return maxTime;

        } catch (error) {
            log.error(`Failed to get last sync time: ${error.message}`);
            return null;
        }
    }
}

// Singleton instance
let syncServiceInstance = null;

export function getBundestagSyncService(options = {}) {
    if (!syncServiceInstance) {
        syncServiceInstance = new BundestagSyncService(options);
    }
    return syncServiceInstance;
}

export { BundestagSyncService };
export default BundestagSyncService;
