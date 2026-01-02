/**
 * KommunalwikiScraper - Scrapes Kommunalwiki via MediaWiki API
 * Fetches articles, categories, and metadata from kommunalwiki.boell.de
 */

import { BaseScraper } from '../base/BaseScraper.js';
import type { ScraperConfig, ScraperResult, MediaWikiPage } from '../types.js';
import { smartChunkDocument } from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { getQdrantInstance } from '../../../database/services/QdrantService.js';

interface ArticleTitle {
  title: string;
  pageid: number;
}

interface CrawlOptions {
  forceUpdate?: boolean;
}

interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  vectors?: number;
}

interface SearchOptions {
  category?: string | null;
  articleType?: string | null;
  limit?: number;
  threshold?: number;
}

interface SkipReason {
  count: number;
  examples: string[];
}

interface CrawlResult {
  totalArticles: number;
  stored: number;
  skipped: number;
  updated: number;
  errors: number;
  documentsProcessed: number;
  chunksCreated: number;
  vectorsStored: number;
  totalVectors: number;
  duration: number;
  skipReasons: {
    redirect: SkipReason;
    too_short: SkipReason;
    no_content: SkipReason;
    no_revision: SkipReason;
    no_chunks: SkipReason;
    already_exists: SkipReason;
  };
}

export class KommunalwikiScraper extends BaseScraper {
  private baseUrl: string;
  private apiUrl: string;
  private qdrant: any; // Will be QdrantService instance
  private crawlDelay: number;
  private batchSize: number;

  constructor(config?: Partial<ScraperConfig>) {
    super({
      collectionName: 'kommunalwiki_documents',
      verbose: true,
      ...config,
    });

    this.baseUrl = 'https://kommunalwiki.boell.de';
    this.apiUrl = `${this.baseUrl}/w/api.php`;
    this.qdrant = null;
    this.crawlDelay = 500;
    this.batchSize = 50;
  }

  async scrape(): Promise<ScraperResult> {
    const result = await this.fullCrawl();
    return {
      documentsProcessed: result.documentsProcessed,
      chunksCreated: result.chunksCreated,
      vectorsStored: result.vectorsStored,
      errors: [], // CrawlResult tracks error count, ScraperResult needs error messages
      duration: result.duration * 1000, // Convert seconds to milliseconds
    };
  }

  async init(): Promise<void> {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await mistralEmbeddingService.init();
    this.log('Service initialized');
  }

  /**
   * Fetch all article titles from MediaWiki API
   */
  private async getAllArticleTitles(): Promise<ArticleTitle[]> {
    const articles: ArticleTitle[] = [];
    let apcontinue: string | null = null;

    this.log('Fetching all article titles...');

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
        articles.push(...data.query.allpages.map((p: any) => ({
          title: p.title,
          pageid: p.pageid
        })));
      }

      apcontinue = data.continue?.apcontinue || null;

      if (apcontinue) {
        await this.delay(this.crawlDelay);
      }
    } while (apcontinue);

    this.log(`Found ${articles.length} articles`);
    return articles;
  }

  /**
   * Get article content from MediaWiki API
   */
  private async getArticleContent(pageids: number[]): Promise<any> {
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

  /**
   * Clean wiki markup content
   */
  private cleanWikiContent(wikiText: string): string {
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

  /**
   * Extract categories from page data
   */
  private extractCategories(page: any): string[] {
    const categories = page.categories || [];
    return categories
      .map((c: any) => c.title.replace('Kategorie:', ''))
      .filter((c: string) => !c.startsWith('!'));
  }

  /**
   * Detect article type based on categories
   */
  private detectArticleType(title: string, categories: string[]): string {
    const catSet = new Set(categories.map(c => c.toLowerCase()));

    if (catSet.has('sachgebiet') || catSet.has('sachgebiete')) return 'sachgebiet';
    if (catSet.has('literatur')) return 'literatur';
    if (catSet.has('personalien')) return 'personalien';
    if (catSet.has('praxishilfen') || catSet.has('praxishilfe')) return 'praxishilfe';
    if (catSet.has('faq') || catSet.has('fragen und antworten')) return 'faq';

    return 'artikel';
  }

  /**
   * Generate unique point ID for Qdrant
   */
  private generatePointId(pageid: number, chunkIndex: number): number {
    const combinedString = `kommunalwiki_${pageid}_${chunkIndex}`;
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Check if article already exists in Qdrant
   */
  private async articleExists(pageid: number): Promise<string | null> {
    try {
      const result = await this.qdrant.client.scroll(this.config.collectionName, {
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

  /**
   * Delete article from Qdrant
   */
  private async deleteArticle(pageid: number): Promise<void> {
    await this.qdrant.client.delete(this.config.collectionName, {
      filter: {
        must: [{ key: 'pageid', match: { value: pageid } }]
      }
    });
  }

  /**
   * Process and store article in Qdrant
   */
  private async processAndStoreArticle(
    article: ArticleTitle,
    wikiContent: string,
    categories: string[],
    timestamp: string
  ): Promise<ProcessResult> {
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

    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);

    const articleType = this.detectArticleType(article.title, categories);
    const primaryCategory = categories.length > 0 ? categories[0] : null;

    const points = chunks.map((chunk: any, index: number) => ({
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

    // Store in batches of 10
    for (let i = 0; i < points.length; i += 10) {
      const batch = points.slice(i, i + 10);
      await this.qdrant.client.upsert(this.config.collectionName, { points: batch });
    }

    return { stored: true, chunks: chunks.length, vectors: points.length };
  }

  /**
   * Full crawl of all Kommunalwiki articles
   */
  async fullCrawl(options: CrawlOptions = {}): Promise<CrawlResult> {
    const { forceUpdate = false } = options;
    this.initializeSession();

    console.log('\n[KommunalWiki] ═══════════════════════════════════════');
    console.log('[KommunalWiki] Starting full crawl');
    console.log(`[KommunalWiki] Force update: ${forceUpdate}`);
    console.log('[KommunalWiki] ═══════════════════════════════════════\n');

    const result: CrawlResult = {
      documentsProcessed: 0,
      chunksCreated: 0,
      vectorsStored: 0,
      errors: 0,
      duration: 0,
      totalArticles: 0,
      stored: 0,
      skipped: 0,
      updated: 0,
      totalVectors: 0,
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
                result.totalVectors += processResult.vectors!;
                console.log(`[KommunalWiki] ✓ "${article.title.substring(0, 50)}" (${processResult.chunks} chunks)`);
              } else {
                result.skipped++;
                const reason = processResult.reason!;
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
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.error(`[KommunalWiki] ✗ Error: ${article.title}: ${errorMsg}`);
              result.errors++;
            }
          }

          console.log(`[KommunalWiki] Progress: ${result.stored} stored, ${result.skipped} skipped, ${result.errors} errors`);

        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.error(`[KommunalWiki] Batch error: ${errorMsg}`);
          result.errors++;
        }

        await this.delay(this.crawlDelay);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[KommunalWiki] Crawl failed:', errorMsg);
      throw error;
    }

    result.documentsProcessed = result.stored;
    result.chunksCreated = result.totalVectors;
    result.vectorsStored = result.totalVectors;
    result.duration = Date.now() - this.startTime;

    this.printCrawlSummary(result);

    return result;
  }

  /**
   * Print crawl summary
   */
  private printCrawlSummary(result: CrawlResult): void {
    console.log('\n[KommunalWiki] ═══════════════════════════════════════');
    console.log(`[KommunalWiki] COMPLETED: ${result.stored} articles (${result.totalVectors} vectors)`);
    console.log(`[KommunalWiki] Updated: ${result.updated}, Skipped: ${result.skipped}, Errors: ${result.errors}`);
    console.log(`[KommunalWiki] Duration: ${Math.round(result.duration / 1000)}s`);

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
  }

  /**
   * Incremental update (only new/updated articles)
   */
  async incrementalUpdate(): Promise<CrawlResult> {
    return this.fullCrawl({ forceUpdate: false });
  }

  /**
   * Search articles
   */
  async searchArticles(query: string, options: SearchOptions = {}): Promise<any> {
    const { category = null, articleType = null, limit = 10, threshold = 0.35 } = options;

    const queryVector = await mistralEmbeddingService.generateQueryEmbedding(query);

    const filter: any = { must: [] };
    if (category) {
      filter.must.push({ key: 'primary_category', match: { value: category } });
    }
    if (articleType) {
      filter.must.push({ key: 'content_type', match: { value: articleType } });
    }

    const searchResult = await this.qdrant.client.search(this.config.collectionName, {
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

  /**
   * Get collection statistics
   */
  async getStats(): Promise<any> {
    try {
      const info = await this.qdrant.client.getCollection(this.config.collectionName);
      return {
        collection: this.config.collectionName,
        vectors_count: info.vectors_count,
        points_count: info.points_count,
        status: info.status
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { error: errorMsg };
    }
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<string[]> {
    try {
      const categories = new Set<string>();
      let offset: any = null;

      do {
        const result = await this.qdrant.client.scroll(this.config.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: ['subcategories'],
          with_vector: false
        });

        for (const point of result.points) {
          if (point.payload.subcategories) {
            point.payload.subcategories.forEach((c: string) => categories.add(c));
          }
        }

        offset = result.next_page_offset;
      } while (offset);

      return Array.from(categories).sort();
    } catch (error) {
      return [];
    }
  }

  /**
   * Clear all documents from collection
   */
  async clearCollection(): Promise<void> {
    console.log('[KommunalWiki] Clearing all documents...');
    try {
      await this.qdrant.client.delete(this.config.collectionName, {
        filter: {
          must: [{ key: 'pageid', match: { any: [] } }]
        }
      });
    } catch {
      const points: any[] = [];
      let offset: any = null;

      do {
        const result = await this.qdrant.client.scroll(this.config.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: false,
          with_vector: false
        });

        points.push(...result.points.map((p: any) => p.id));
        offset = result.next_page_offset;
      } while (offset);

      if (points.length > 0) {
        for (let i = 0; i < points.length; i += 100) {
          const batch = points.slice(i, i + 100);
          await this.qdrant.client.delete(this.config.collectionName, {
            points: batch
          });
        }
      }
    }
    console.log('[KommunalWiki] Collection cleared');
  }
}

// Singleton instance for backward compatibility
export const kommunalwikiScraper = new KommunalwikiScraper();
export default kommunalwikiScraper;
