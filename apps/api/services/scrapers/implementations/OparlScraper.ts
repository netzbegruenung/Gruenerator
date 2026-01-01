/**
 * OParl Scraper
 * Scrapes municipal parliament papers via OParl API endpoints
 * Uses Mistral OCR for PDF text extraction
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { BaseScraper } from '../base/BaseScraper.js';
import type { ScraperResult, OparlPaper, OparlFile, OparlEndpoint } from '../types.js';
import { smartChunkDocument } from '../../../utils/textChunker.js';
import { fastEmbedService } from '../../FastEmbedService.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import oparlApiClient from '../../oparlApiClient.js';
import { ocrService } from '../../ocrService.js';

/**
 * City scraping result
 */
export interface CityScrapeResult {
  city: string;
  url: string;
  stored: number;
  skipped: number;
  errors: number;
  totalPapers: number;
  totalVectors: number;
  duration: number;
}

/**
 * Scraping options
 */
export interface OparlScraperOptions {
  /** Number of PDFs to process concurrently */
  pdfConcurrency?: number;
}

/**
 * Search options
 */
export interface OparlSearchOptions {
  /** Filter by city */
  city?: string;
  /** Maximum results */
  limit?: number;
  /** Minimum similarity threshold */
  threshold?: number;
}

/**
 * Search result for a paper
 */
export interface PaperSearchResult {
  id: string;
  score: number;
  title: string;
  city: string;
  date: string | null;
  paperType: string | null;
  reference: string | null;
  sourceUrl: string;
  mainFileUrl: string | null;
  fullText: string | null;
  matchedChunk: string;
}

/**
 * Collection statistics
 */
export interface OparlStats {
  collection: string;
  vectors_count?: number;
  points_count?: number;
  status?: string;
  error?: string;
}

/**
 * Qdrant point for OParl paper chunk
 */
interface OparlPoint {
  id: number;
  vector: number[];
  payload: {
    paper_id: string;
    oparl_id: string;
    chunk_index: number;
    chunk_text: string;
    full_text: string | null;
    city: string;
    title: string;
    paper_type: string | null;
    reference: string | null;
    date: string | null;
    source_url: string;
    main_file_url: string | null;
    detection_method: string | null;
    created_at: string;
  };
}

/**
 * OParl API scraper for municipal parliament papers
 */
export class OparlScraper extends BaseScraper {
  private qdrant: any;

  constructor() {
    super({
      collectionName: 'oparl_papers',
      verbose: true,
    });
    this.qdrant = null;
  }

  /**
   * Initialize services
   */
  async init(): Promise<void> {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await fastEmbedService.init();
    this.log('Service initialized');
  }

  /**
   * Main scraping method (implements abstract method from BaseScraper)
   * Note: This scraper is typically used via scrapeCity() instead
   */
  async scrape(): Promise<ScraperResult> {
    throw new Error('OparlScraper requires scrapeCity() with specific endpoint. Use scrapeCity() instead.');
  }

  /**
   * Scrape papers from a specific city endpoint
   */
  async scrapeCity(endpoint: OparlEndpoint, options: OparlScraperOptions = {}): Promise<CityScrapeResult> {
    const { pdfConcurrency = 5 } = options;
    const startTime = Date.now();

    this.log('═══════════════════════════════════════');
    this.log(`Scraping: ${endpoint.city}`);
    this.log(`URL: ${endpoint.url}`);
    this.log(`PDF Concurrency: ${pdfConcurrency}`);
    this.log('═══════════════════════════════════════');

    const result: CityScrapeResult = {
      city: endpoint.city,
      url: endpoint.url,
      stored: 0,
      skipped: 0,
      errors: 0,
      totalPapers: 0,
      totalVectors: 0,
      duration: 0,
    };

    try {
      // Fetch all green papers from OParl API
      const data = await oparlApiClient.getAllGreenPapers(endpoint.url);
      result.totalPapers = data.papers.length;

      this.log(`Found ${data.papers.length} green papers`);

      // Filter out papers that already exist in Qdrant
      const newPapers: OparlPaper[] = [];
      for (const paper of data.papers) {
        const exists = await this.#paperExists(paper.id);
        if (exists) {
          result.skipped++;
        } else {
          newPapers.push(paper);
        }
      }
      this.log(`${newPapers.length} new papers to process (${result.skipped} already exist)`);

      // Process in batches: PDF extract -> chunk -> embed -> store (IMMEDIATELY)
      // This ensures we never lose work if something fails
      for (let i = 0; i < newPapers.length; i += pdfConcurrency) {
        const batch = newPapers.slice(i, i + pdfConcurrency);
        const batchNum = Math.floor(i / pdfConcurrency) + 1;
        const totalBatches = Math.ceil(newPapers.length / pdfConcurrency);
        this.log(`\n─── Batch ${batchNum}/${totalBatches} (papers ${i + 1}-${Math.min(i + pdfConcurrency, newPapers.length)}) ───`);

        // Step 1: Extract PDFs in parallel
        const extractionResults = await Promise.allSettled(
          batch.map(async (paper) => {
            const fullText = await this.#extractPaperText(paper);
            return { paper, fullText };
          })
        );

        // Step 2-4: For each successful extraction, chunk -> embed -> store immediately
        for (const res of extractionResults) {
          if (res.status !== 'fulfilled') {
            result.errors++;
            continue;
          }

          const { paper, fullText } = res.value;
          if (!fullText || fullText.length < 50) {
            result.skipped++;
            continue;
          }

          try {
            // Chunk
            const chunks = await smartChunkDocument(fullText, {
              baseMetadata: { city: endpoint.city, title: paper.name },
            });

            if (chunks.length === 0) {
              result.skipped++;
              continue;
            }

            // Embed
            const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
            const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

            // Store immediately (in small batches of 5 points)
            const points = this.#createPoints(endpoint.city, paper, fullText, chunks, embeddings);
            for (let j = 0; j < points.length; j += 5) {
              const pointBatch = points.slice(j, j + 5);
              await this.qdrant.client.upsert(this.config.collectionName, { points: pointBatch });
            }

            result.stored++;
            result.totalVectors += points.length;
            this.log(`✓ Stored "${paper.name?.substring(0, 40)}..." (${chunks.length} chunks)`);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[OparlScraper] ✗ Error processing ${paper.id}: ${errorMessage}`);
            result.errors++;
          }
        }

        // Progress summary after each batch
        this.log(`Progress: ${result.stored} stored, ${result.skipped} skipped, ${result.errors} errors`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[OparlScraper] City scrape failed:`, errorMessage);
      throw error;
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);
    this.log('\n═══════════════════════════════════════');
    this.log(`COMPLETED: ${result.stored} papers (${result.totalVectors} vectors)`);
    this.log(`Skipped: ${result.skipped}, Errors: ${result.errors}`);
    this.log(`Duration: ${result.duration}s`);
    this.log('═══════════════════════════════════════');

    return result;
  }

  /**
   * Create Qdrant points from chunks
   */
  #createPoints(city: string, paper: OparlPaper, fullText: string, chunks: any[], embeddings: number[][]): OparlPoint[] {
    const paperId = uuidv4();
    const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);

    // Get the best available PDF URL
    let pdfUrl: string | null = paper.mainFile?.accessUrl || null;
    if (!pdfUrl && paper.auxiliaryFile && paper.auxiliaryFile.length > 0) {
      const pdfFile = paper.auxiliaryFile.find((f) => f.mimeType === 'application/pdf');
      if (pdfFile) {
        pdfUrl = pdfFile.accessUrl || pdfFile.downloadUrl || null;
      }
    }

    return chunks.map((chunk, index) => ({
      id: this.#generatePointId(paper.id, index),
      vector: embeddings[index],
      payload: {
        paper_id: paperId,
        oparl_id: paper.id,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        full_text: index === 0 ? fullText : null,
        city: city,
        title: paper.name || 'Untitled',
        paper_type: paper.paperType || null,
        reference: paper.reference || null,
        date: paper.date || null,
        source_url: paper.id,
        main_file_url: pdfUrl,
        detection_method: (paper as any)._detectionMethod || null,
        created_at: new Date().toISOString(),
      },
    }));
  }

  /**
   * Extract text from paper PDFs using Mistral OCR
   */
  async #extractPaperText(paper: OparlPaper): Promise<string> {
    // Collect all PDF URLs to try
    const pdfUrls: Array<{ url: string; source: string }> = [];

    if (paper.mainFile?.accessUrl) {
      pdfUrls.push({ url: paper.mainFile.accessUrl, source: 'mainFile' });
    }

    if (paper.auxiliaryFile && Array.isArray(paper.auxiliaryFile)) {
      for (const file of paper.auxiliaryFile) {
        if (file.accessUrl && file.mimeType === 'application/pdf') {
          pdfUrls.push({ url: file.accessUrl, source: 'auxiliaryFile' });
        }
      }
    }

    // Try each PDF URL with Mistral OCR
    for (const { url, source } of pdfUrls) {
      try {
        this.log(`Downloading ${source} PDF: ${url}`);

        // Download PDF to temp file
        const response = await fetch(url);
        if (!response.ok) continue;

        const buffer = Buffer.from(await response.arrayBuffer());
        const tempPath = path.join(os.tmpdir(), `oparl_${Date.now()}.pdf`);
        await fs.writeFile(tempPath, buffer);

        try {
          // Use Mistral OCR for markdown extraction
          this.log(`Running Mistral OCR on ${source}...`);
          const result = await ocrService.extractTextWithMistralOCR(tempPath);

          if (result.text && result.text.length > 100) {
            this.log(`✓ Mistral OCR extracted ${result.text.length} chars (${result.pageCount} pages)`);
            return result.text;
          }
        } finally {
          // Clean up temp file
          await fs.unlink(tempPath).catch(() => {});
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        this.log(`${source} PDF extraction failed: ${errorMessage}`);
      }
    }

    // Fallback: use metadata (but this won't have actual content)
    const fallbackParts = [paper.name, paper.reference, paper.paperType].filter(Boolean);

    this.log(`Warning: No PDF content extracted for ${paper.id}, using metadata only`);
    return fallbackParts.join('\n\n');
  }

  /**
   * Generate deterministic point ID from OParl ID and chunk index
   */
  #generatePointId(oparlId: string, chunkIndex: number): number {
    const combinedString = `${oparlId}_${chunkIndex}`;
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Check if paper already exists in Qdrant
   */
  async #paperExists(oparlId: string): Promise<boolean> {
    try {
      const result = await this.qdrant.client.scroll(this.config.collectionName, {
        filter: {
          must: [{ key: 'oparl_id', match: { value: oparlId } }],
        },
        limit: 1,
        with_payload: false,
        with_vector: false,
      });
      return result.points && result.points.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Search papers by semantic query
   */
  async searchPapers(query: string, options: OparlSearchOptions = {}): Promise<{ results: PaperSearchResult[]; total: number }> {
    const { city, limit = 10, threshold = 0.35 } = options;

    const queryVector = await fastEmbedService.generateQueryEmbedding(query);

    const filter = city
      ? {
          must: [{ key: 'city', match: { value: city } }],
        }
      : undefined;

    const searchResult = await this.qdrant.client.search(this.config.collectionName, {
      vector: queryVector,
      filter: filter,
      limit: limit * 3,
      score_threshold: threshold,
      with_payload: true,
    });

    const papersMap = new Map<string, PaperSearchResult>();
    for (const hit of searchResult) {
      const paperId = hit.payload.paper_id;
      if (!papersMap.has(paperId)) {
        let fullText = hit.payload.full_text;

        // If this chunk doesn't have full_text, fetch it from chunk 0
        if (!fullText && hit.payload.chunk_index !== 0) {
          const fullTextResult = await this.qdrant.client.scroll(this.config.collectionName, {
            filter: {
              must: [
                { key: 'paper_id', match: { value: paperId } },
                { key: 'chunk_index', match: { value: 0 } },
              ],
            },
            limit: 1,
            with_payload: ['full_text'],
          });
          fullText = fullTextResult.points?.[0]?.payload?.full_text;
        }

        papersMap.set(paperId, {
          id: paperId,
          score: hit.score,
          title: hit.payload.title,
          city: hit.payload.city,
          date: hit.payload.date,
          paperType: hit.payload.paper_type,
          reference: hit.payload.reference,
          sourceUrl: hit.payload.source_url,
          mainFileUrl: hit.payload.main_file_url,
          fullText: fullText,
          matchedChunk: hit.payload.chunk_text,
        });
      }

      if (papersMap.size >= limit) break;
    }

    return {
      results: Array.from(papersMap.values()),
      total: papersMap.size,
    };
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<OparlStats> {
    try {
      const info = await this.qdrant.client.getCollection(this.config.collectionName);
      return {
        collection: this.config.collectionName,
        vectors_count: info.vectors_count,
        points_count: info.points_count,
        status: info.status,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { collection: this.config.collectionName, error: errorMessage };
    }
  }

  /**
   * Get list of all cities with papers
   */
  async getCities(): Promise<string[]> {
    try {
      const cities = new Set<string>();
      let offset: string | number | null = null;

      do {
        const result = await this.qdrant.client.scroll(this.config.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: ['city'],
          with_vector: false,
        });

        for (const point of result.points) {
          if (point.payload.city) {
            cities.add(point.payload.city);
          }
        }

        offset = result.next_page_offset;
      } while (offset);

      return Array.from(cities).sort();
    } catch (error) {
      return [];
    }
  }

  /**
   * Delete all papers for a specific city
   */
  async deleteCityPapers(city: string): Promise<void> {
    this.log(`Deleting papers for city: ${city}`);
    await this.qdrant.client.delete(this.config.collectionName, {
      filter: {
        must: [{ key: 'city', match: { value: city } }],
      },
    });
    this.log(`Deleted papers for ${city}`);
  }
}

// Singleton instance for backward compatibility
export const oparlScraperService = new OparlScraper();
export default oparlScraperService;
