import { v4 as uuidv4 } from 'uuid';
import { smartChunkDocument } from '../utils/textChunker.js';
import { fastEmbedService } from './FastEmbedService.js';
import { getQdrantInstance } from '../database/services/QdrantService.js';
import oparlApiClient from './oparlApiClient.js';
import { ocrService } from './ocrService.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class OparlScraperService {
  constructor() {
    this.collectionName = 'oparl_papers';
    this.qdrant = null;
  }

  async init() {
    this.qdrant = getQdrantInstance();
    await this.qdrant.init();
    await fastEmbedService.init();
    console.log('[OparlScraper] Service initialized');
  }

  async scrapeCity(endpoint, options = {}) {
    const { pdfConcurrency = 5 } = options;
    const startTime = Date.now();
    console.log(`\n[OparlScraper] ═══════════════════════════════════════`);
    console.log(`[OparlScraper] Scraping: ${endpoint.city}`);
    console.log(`[OparlScraper] URL: ${endpoint.url}`);
    console.log(`[OparlScraper] PDF Concurrency: ${pdfConcurrency}`);
    console.log(`[OparlScraper] ═══════════════════════════════════════`);

    const result = {
      city: endpoint.city,
      url: endpoint.url,
      stored: 0,
      skipped: 0,
      errors: 0,
      totalPapers: 0,
      totalVectors: 0,
      duration: 0
    };

    try {
      const data = await oparlApiClient.getAllGreenPapers(endpoint.url);
      result.totalPapers = data.papers.length;

      console.log(`[OparlScraper] Found ${data.papers.length} green papers`);

      // Filter out existing papers first
      const newPapers = [];
      for (const paper of data.papers) {
        const exists = await this.paperExists(paper.id);
        if (exists) {
          result.skipped++;
        } else {
          newPapers.push(paper);
        }
      }
      console.log(`[OparlScraper] ${newPapers.length} new papers to process (${result.skipped} already exist)`);

      // Process in batches: PDF extract -> chunk -> embed -> store (IMMEDIATELY)
      // This way we never lose work if something fails
      for (let i = 0; i < newPapers.length; i += pdfConcurrency) {
        const batch = newPapers.slice(i, i + pdfConcurrency);
        const batchNum = Math.floor(i / pdfConcurrency) + 1;
        const totalBatches = Math.ceil(newPapers.length / pdfConcurrency);
        console.log(`\n[OparlScraper] ─── Batch ${batchNum}/${totalBatches} (papers ${i + 1}-${Math.min(i + pdfConcurrency, newPapers.length)}) ───`);

        // Step 1: Extract PDFs in parallel
        const extractionResults = await Promise.allSettled(
          batch.map(async (paper) => {
            const fullText = await this.extractPaperText(paper);
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
              baseMetadata: { city: endpoint.city, title: paper.name }
            });

            if (chunks.length === 0) {
              result.skipped++;
              continue;
            }

            // Embed
            const chunkTexts = chunks.map(c => c.text || c.chunk_text);
            const embeddings = await fastEmbedService.generateBatchEmbeddings(chunkTexts);

            // Store immediately (small batches)
            const points = this.createPoints(endpoint.city, paper, fullText, chunks, embeddings);
            for (let j = 0; j < points.length; j += 5) {
              const pointBatch = points.slice(j, j + 5);
              await this.qdrant.client.upsert(this.collectionName, { points: pointBatch });
            }

            result.stored++;
            result.totalVectors += points.length;
            console.log(`[OparlScraper] ✓ Stored "${paper.name?.substring(0, 40)}..." (${chunks.length} chunks)`);

          } catch (err) {
            console.error(`[OparlScraper] ✗ Error processing ${paper.id}: ${err.message}`);
            result.errors++;
          }
        }

        // Progress summary after each batch
        console.log(`[OparlScraper] Progress: ${result.stored} stored, ${result.skipped} skipped, ${result.errors} errors`);
      }

    } catch (error) {
      console.error(`[OparlScraper] City scrape failed:`, error.message);
      throw error;
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`\n[OparlScraper] ═══════════════════════════════════════`);
    console.log(`[OparlScraper] COMPLETED: ${result.stored} papers (${result.totalVectors} vectors)`);
    console.log(`[OparlScraper] Skipped: ${result.skipped}, Errors: ${result.errors}`);
    console.log(`[OparlScraper] Duration: ${result.duration}s`);
    console.log(`[OparlScraper] ═══════════════════════════════════════`);

    return result;
  }

  createPoints(city, paper, fullText, chunks, embeddings) {
    const paperId = uuidv4();
    const chunkTexts = chunks.map(c => c.text || c.chunk_text);

    // Get the best available PDF URL
    let pdfUrl = paper.mainFile?.accessUrl || null;
    if (!pdfUrl && paper.auxiliaryFile && paper.auxiliaryFile.length > 0) {
      const pdfFile = paper.auxiliaryFile.find(f => f.mimeType === 'application/pdf');
      if (pdfFile) {
        pdfUrl = pdfFile.accessUrl || pdfFile.downloadUrl;
      }
    }

    return chunks.map((chunk, index) => ({
      id: this.generatePointId(paper.id, index),
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
        detection_method: paper._detectionMethod || null,
        created_at: new Date().toISOString()
      }
    }));
  }

  async extractPaperText(paper) {
    // Collect all PDF URLs to try
    const pdfUrls = [];

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
        console.log(`[OparlScraper] Downloading ${source} PDF: ${url}`);

        // Download PDF to temp file
        const response = await fetch(url);
        if (!response.ok) continue;

        const buffer = Buffer.from(await response.arrayBuffer());
        const tempPath = path.join(os.tmpdir(), `oparl_${Date.now()}.pdf`);
        await fs.writeFile(tempPath, buffer);

        try {
          // Use Mistral OCR for markdown extraction
          console.log(`[OparlScraper] Running Mistral OCR on ${source}...`);
          const result = await ocrService.extractTextWithMistralOCR(tempPath);

          if (result.text && result.text.length > 100) {
            console.log(`[OparlScraper] ✓ Mistral OCR extracted ${result.text.length} chars (${result.pageCount} pages)`);
            return result.text;
          }
        } finally {
          // Clean up temp file
          await fs.unlink(tempPath).catch(() => {});
        }
      } catch (err) {
        console.log(`[OparlScraper] ${source} PDF extraction failed: ${err.message}`);
      }
    }

    // Fallback: use metadata (but this won't have actual content)
    const fallbackParts = [
      paper.name,
      paper.reference,
      paper.paperType
    ].filter(Boolean);

    console.log(`[OparlScraper] Warning: No PDF content extracted for ${paper.id}, using metadata only`);
    return fallbackParts.join('\n\n');
  }

  generatePointId(oparlId, chunkIndex) {
    const combinedString = `${oparlId}_${chunkIndex}`;
    let hash = 0;
    for (let i = 0; i < combinedString.length; i++) {
      const char = combinedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async paperExists(oparlId) {
    try {
      const result = await this.qdrant.client.scroll(this.collectionName, {
        filter: {
          must: [{ key: 'oparl_id', match: { value: oparlId } }]
        },
        limit: 1,
        with_payload: false,
        with_vector: false
      });
      return result.points && result.points.length > 0;
    } catch (error) {
      return false;
    }
  }

  async searchPapers(query, options = {}) {
    const { city, limit = 10, threshold = 0.35 } = options;

    const queryVector = await fastEmbedService.generateQueryEmbedding(query);

    const filter = city ? {
      must: [{ key: 'city', match: { value: city } }]
    } : undefined;

    const searchResult = await this.qdrant.client.search(this.collectionName, {
      vector: queryVector,
      filter: filter,
      limit: limit * 3,
      score_threshold: threshold,
      with_payload: true
    });

    const papersMap = new Map();
    for (const hit of searchResult) {
      const paperId = hit.payload.paper_id;
      if (!papersMap.has(paperId)) {
        let fullText = hit.payload.full_text;

        if (!fullText && hit.payload.chunk_index !== 0) {
          const fullTextResult = await this.qdrant.client.scroll(this.collectionName, {
            filter: {
              must: [
                { key: 'paper_id', match: { value: paperId } },
                { key: 'chunk_index', match: { value: 0 } }
              ]
            },
            limit: 1,
            with_payload: ['full_text']
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
          matchedChunk: hit.payload.chunk_text
        });
      }

      if (papersMap.size >= limit) break;
    }

    return {
      results: Array.from(papersMap.values()),
      total: papersMap.size
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

  async getCities() {
    try {
      const cities = new Set();
      let offset = null;

      do {
        const result = await this.qdrant.client.scroll(this.collectionName, {
          limit: 100,
          offset: offset,
          with_payload: ['city'],
          with_vector: false
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

  async deleteCityPapers(city) {
    console.log(`[OparlScraper] Deleting papers for city: ${city}`);
    await this.qdrant.client.delete(this.collectionName, {
      filter: {
        must: [{ key: 'city', match: { value: city } }]
      }
    });
    console.log(`[OparlScraper] Deleted papers for ${city}`);
  }
}

export const oparlScraperService = new OparlScraperService();
export default oparlScraperService;
