/**
 * Program PDF Scraper
 *
 * Ingests a fixed list of party program PDFs into a Qdrant collection.
 * Replaces the pre-TS-migration one-off ingest scripts that originally filled
 * `grundsatz_documents` (DE Grundsatzprogramm 2020, EU-Wahlprogramm 2024,
 * Regierungsprogramm 2025) and `oesterreich_gruene_documents` (AT programs) —
 * both collections were lost in the 2026-07-25 Qdrant incident and had no
 * repeatable ingest path since.
 *
 * PDFs are text-native: extraction uses PDF.js directly and falls back to
 * Mistral OCR only when direct extraction is not possible.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { type SyncArticleSourceGroup } from '@gruenerator/contracts';

import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import {
  scrollDocuments,
  batchUpsert,
  batchDelete,
  setPayload,
} from '../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../utils/domainUtils.js';
import { generatePointId } from '../../../utils/validation/index.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import {
  smartChunkDocument,
  buildEmbeddingTextsForChunks,
  structurePayload,
} from '../../document-services/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';
import { BaseScraper } from '../base/BaseScraper.js';
import {
  recordExtraction,
  recordExtractionSkip,
  recordRedundantExtraction,
} from '../extractionRecorder.js';
import { recordSyncEvent, toExcerpt } from '../syncEventRecorder.js';
import {
  conditionalHeaders,
  fingerprintResponse,
  isSameFile,
  type FileFingerprint,
} from '../utils/binaryFingerprint.js';

import type { QdrantService } from '../../../database/services/QdrantService/index.js';
import type { ScraperResult } from '../types.js';

export interface ProgramPdfDocument {
  /** Stable document identifier (also the dedup key within the collection). */
  documentId: string;
  title: string;
  /** Direct PDF download URL. */
  pdfUrl: string;
  /** Human-facing landing page shown as source in citations. */
  sourceUrl: string;
  primaryCategory: string;
  publishedAt: string | null;
}

export interface ProgramPdfSourceConfig {
  sourceGroupId: SyncArticleSourceGroup;
  sourceName: string;
  collectionName: string;
  country: 'DE' | 'AT';
  documents: ProgramPdfDocument[];
}

export const GRUNDSATZ_SOURCE: ProgramPdfSourceConfig = {
  sourceGroupId: 'grundsatz',
  sourceName: 'Grundsatzprogramme',
  collectionName: 'grundsatz_documents',
  country: 'DE',
  documents: [
    {
      documentId: '20200125_Grundsatzprogramm',
      title: 'Grundsatzprogramm 2020 – Veränderung schafft Halt',
      pdfUrl: 'https://cms.gruene.de/uploads/documents/20200125_Grundsatzprogramm.pdf',
      sourceUrl: 'https://www.gruene.de/grundsatzprogramm',
      primaryCategory: 'Grundsatzprogramm',
      publishedAt: '2020-01-25',
    },
    {
      documentId: '20240306_Reader_EU-Wahlprogramm2024_A4',
      title: 'EU-Wahlprogramm 2024 – Was uns schützt',
      pdfUrl: 'https://cms.gruene.de/uploads/documents/20240306_Reader_EU-Wahlprogramm2024_A4.pdf',
      sourceUrl: 'https://www.gruene.de/artikel/unser-gr%C3%BCnes-wahlprogramm-zur-europawahl-2024',
      primaryCategory: 'Wahlprogramm',
      publishedAt: '2024-03-06',
    },
    {
      documentId: '20250318_Regierungsprogramm_DIGITAL_DINA5',
      title: 'Regierungsprogramm 2025 – Zusammen wachsen',
      pdfUrl:
        'https://cms.gruene.de/uploads/documents/20250318_Regierungsprogramm_DIGITAL_DINA5.pdf',
      sourceUrl: 'https://www.gruene.de/regierungsprogramm',
      primaryCategory: 'Regierungsprogramm',
      publishedAt: '2025-03-18',
    },
  ],
};

export const OESTERREICH_SOURCE: ProgramPdfSourceConfig = {
  sourceGroupId: 'oesterreich',
  sourceName: 'Die Grünen Österreich – Programme',
  collectionName: 'oesterreich_gruene_documents',
  country: 'AT',
  documents: [
    {
      documentId: 'gruene_at_grundsatzprogramm_2001',
      title: 'Grundsatzprogramm der Grünen (Österreich)',
      // Official gruene.at hosting is gone; this is the only live copy of the 2001 program.
      pdfUrl: 'https://diesubstanz.at/wp-content/uploads/2019/07/Gruenes_Grundsatzprogramm.pdf',
      sourceUrl: 'https://gruene.at/organisation/partei-alt/programm/',
      primaryCategory: 'Grundsatzprogramm',
      publishedAt: '2001-07-08',
    },
    {
      documentId: 'gruene_at_europawahlprogramm_2024',
      title: 'EU-Wahlprogramm 2024 der Grünen (Österreich)',
      pdfUrl: 'https://gruene.at/app/uploads/sites/1/2024/04/Europawahlprogramm-barrierefrei.pdf',
      sourceUrl: 'https://gruene.at/wahlprogramm-epw24/',
      primaryCategory: 'Wahlprogramm',
      publishedAt: '2024-04-15',
    },
    {
      documentId: 'gruene_at_nrw_wahlprogramm_2024',
      title: 'Wahlprogramm Nationalratswahl 2024 der Grünen (Österreich)',
      pdfUrl: 'https://gruene.at/app/uploads/sites/1/2024/08/NRW-Wahlprogramm-web.pdf',
      sourceUrl: 'https://gruene.at/nrwprogramm24/',
      primaryCategory: 'Wahlprogramm',
      publishedAt: '2024-08-15',
    },
  ],
};

interface ProcessResult {
  stored: boolean;
  reason?: string;
  chunks?: number;
  updated?: boolean;
}

export interface ProgramPdfCrawlResult {
  totalDocuments: number;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  totalVectors: number;
  duration: number;
  errorMessages: string[];
}

export interface ProgramPdfCrawlOptions {
  forceUpdate?: boolean;
}

interface PdfExtraction {
  text: string;
  method: string;
  pageCount: number;
}

export class ProgramPdfScraper extends BaseScraper {
  private sourceConfig: ProgramPdfSourceConfig;
  private qdrantService: QdrantService | null;

  constructor(sourceConfig: ProgramPdfSourceConfig) {
    super({
      collectionName: sourceConfig.collectionName,
      verbose: true,
    });
    this.sourceConfig = sourceConfig;
    this.qdrantService = null;
  }

  private get qdrant(): QdrantService {
    if (!this.qdrantService) {
      throw new Error('ProgramPdfScraper not initialized. Call init() first.');
    }
    return this.qdrantService;
  }

  async init(): Promise<void> {
    this.qdrantService = getQdrantInstance();
    await this.qdrantService.init();
    await mistralEmbeddingService.init();
    this.log(`ProgramPdf scraper initialized (${this.sourceConfig.sourceGroupId})`);
  }

  async scrape(): Promise<ScraperResult> {
    const result = await this.fullCrawl();
    return {
      documentsProcessed: result.stored + result.updated,
      chunksCreated: result.totalVectors,
      vectorsStored: result.totalVectors,
      errors: result.errorMessages,
      duration: result.duration * 1000,
    };
  }

  /**
   * Download the PDF unless the server confirms the stored validators with 304.
   * Returns the temp-file path plus the fingerprint of what was downloaded, so
   * the caller can decide against extraction before paying for it.
   */
  async #downloadPdf(
    url: string,
    storedPayload: Record<string, unknown> | null
  ): Promise<{ tempPath: string; fingerprint: FileFingerprint } | { notModified: true }> {
    const response = await this.fetchWithRetry(url, {
      timeout: 120_000,
      maxRetries: 3,
      userAgent: BRAND?.botUserAgent || 'Gruenerator-Bot/1.0',
      headers: conditionalHeaders(storedPayload),
      acceptStatus: [304],
    });

    if (response.status === 304) {
      return { notModified: true };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1024) {
      throw new Error(`Suspiciously small PDF (${buffer.length} bytes) from ${url}`);
    }

    const tempPath = path.join(
      os.tmpdir(),
      `program_pdf_${crypto.randomBytes(8).toString('hex')}.pdf`
    );
    fs.writeFileSync(tempPath, buffer);
    return { tempPath, fingerprint: fingerprintResponse(buffer, response) };
  }

  /** PDF.js direct extraction with Mistral OCR fallback (same policy as reprocess-pdfs). */
  async #extractText(pdfPath: string): Promise<PdfExtraction> {
    const { extractTextWithMistralOCR } = await import('../../OcrService/mistralIntegration.js');
    const { getPdfJs, openPdfDocument, canExtractTextDirectly, extractTextDirectlyFromPDF } =
      await import('../../OcrService/pdfOperations.js');
    const { applyMarkdownFormatting } = await import('../../OcrService/textFormatting.js');
    const { getMediaType } = await import('../../OcrService/validation.js');

    const pdfjsLib: unknown = await getPdfJs();
    const openDoc = (p: string) => openPdfDocument(p, pdfjsLib);

    try {
      const parseCheck = await canExtractTextDirectly(pdfPath, openDoc);
      if (parseCheck.isParseable && parseCheck.confidence >= 0.8) {
        const direct = await extractTextDirectlyFromPDF(pdfPath, openDoc, applyMarkdownFormatting);
        if (direct.text && direct.text.length >= 1000) {
          return { text: direct.text, method: 'pdfjs-direct', pageCount: direct.pageCount };
        }
      }
    } catch {
      // fall through to OCR
    }

    const ocr = await extractTextWithMistralOCR(pdfPath, getMediaType);
    return { text: ocr.text, method: 'mistral-ocr', pageCount: ocr.pageCount };
  }

  async #existingPayload(documentId: string): Promise<Record<string, unknown> | null> {
    try {
      const points = await scrollDocuments(
        this.qdrant.client!,
        this.config.collectionName,
        { must: [{ key: 'document_id', match: { value: documentId } }] },
        { limit: 1, withPayload: true, withVector: false }
      );
      return points.length > 0 ? points[0].payload : null;
    } catch {
      return null;
    }
  }

  /**
   * Persist the fingerprint on points whose text did not change. Without this
   * the very first run after deploy would extract, find the text identical,
   * write nothing — and re-extract the same PDF on every following run.
   */
  async #persistFingerprint(
    documentId: string,
    fingerprint: FileFingerprint,
    existingPayload: Record<string, unknown>
  ): Promise<void> {
    const patch = Object.fromEntries(
      Object.entries(fingerprint).filter(([key, value]) => existingPayload[key] !== value)
    );
    if (Object.keys(patch).length === 0) return;

    await setPayload(this.qdrant.client!, this.config.collectionName, patch, {
      must: [{ key: 'document_id', match: { value: documentId } }],
    });
  }

  async #processDocument(
    doc: ProgramPdfDocument,
    forceUpdate: boolean
  ): Promise<ProcessResult & { vectors?: number }> {
    let tempPath: string | null = null;

    try {
      // Immer nachschlagen, auch bei forceUpdate: der Treffer entscheidet unten
      // über das Löschen der alten Chunks. Nur die Spar-Gatter bekommen ihn
      // vorenthalten, damit forceUpdate wirklich neu ausliest.
      const existingPayload = await this.#existingPayload(doc.documentId);
      const gateOn = forceUpdate ? null : existingPayload;

      const download = await this.#downloadPdf(doc.pdfUrl, gateOn);
      if ('notModified' in download) {
        recordExtractionSkip('not_modified');
        return { stored: false, reason: 'unchanged' };
      }
      tempPath = download.tempPath;

      // Byte-gleiche Datei → die Extraktion (PDF.js, bei Bedarf Mistral-OCR pro
      // Seite) und die Einbettung würden dasselbe Ergebnis erneut erzeugen.
      if (gateOn && isSameFile(gateOn, download.fingerprint)) {
        recordExtractionSkip('same_bytes');
        return { stored: false, reason: 'unchanged' };
      }

      const extraction = await this.#extractText(tempPath);
      recordExtraction({ method: extraction.method, pages: extraction.pageCount });

      if (!extraction.text || extraction.text.length < 1000) {
        return { stored: false, reason: 'too_short' };
      }

      const contentHash = this.generateHash(extraction.text);

      if (gateOn && gateOn.content_hash === contentHash) {
        await this.#persistFingerprint(doc.documentId, download.fingerprint, gateOn);
        recordRedundantExtraction();
        return { stored: false, reason: 'unchanged' };
      }

      const existing = existingPayload !== null;
      if (existing) {
        await batchDelete(this.qdrant.client!, this.config.collectionName, {
          must: [{ key: 'document_id', match: { value: doc.documentId } }],
        });
      }

      const chunks = await smartChunkDocument(extraction.text, {
        baseMetadata: {
          title: doc.title,
          source: this.sourceConfig.sourceGroupId,
          source_url: doc.sourceUrl,
        },
      });

      if (chunks.length === 0) {
        return { stored: false, reason: 'no_chunks' };
      }

      const chunkTexts = chunks.map((c) => c.text);
      const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
        buildEmbeddingTextsForChunks(chunks, doc.title)
      );

      const points = chunks.map((chunk, index) => ({
        id: generatePointId(this.sourceConfig.sourceGroupId, doc.documentId, index),
        vector: embeddings[index],
        payload: {
          document_id: doc.documentId,
          source_url: doc.sourceUrl,
          pdf_url: doc.pdfUrl,
          content_hash: contentHash,
          ...download.fingerprint,
          chunk_index: index,
          chunk_text: chunkTexts[index],
          ...structurePayload(chunk),
          quality_score: chunkQualityService.calculateQualityScore(chunkTexts[index]),
          document_type: 'programm',
          content_type: doc.primaryCategory.toLowerCase(),
          extraction_method: extraction.method,
          page_count: extraction.pageCount,
          // Chunks are sequential through the document; the proportional
          // estimate keeps page-level citations usable (the chunker gets no
          // real page markers from either PDF extraction path).
          page_number: Math.max(
            1,
            Math.min(
              extraction.pageCount,
              Math.ceil(((index + 1) / chunks.length) * extraction.pageCount)
            )
          ),
          primary_category: doc.primaryCategory,
          country: this.sourceConfig.country,
          title: doc.title,
          published_at: doc.publishedAt,
          source: this.sourceConfig.sourceGroupId,
          indexed_at: new Date().toISOString(),
        },
      }));

      for (let i = 0; i < points.length; i += 10) {
        await batchUpsert(this.qdrant.client!, this.config.collectionName, points.slice(i, i + 10));
      }

      recordSyncEvent({
        title: doc.title,
        sourceUrl: doc.sourceUrl,
        sourceGroupId: this.sourceConfig.sourceGroupId,
        sourceName: this.sourceConfig.sourceName,
        excerpt: toExcerpt(extraction.text),
        landesverband: null,
        collection: this.config.collectionName,
        eventType: existing ? 'updated' : 'stored',
        publishedAt: doc.publishedAt,
      });

      return { stored: true, chunks: chunks.length, vectors: points.length, updated: !!existing };
    } finally {
      if (tempPath) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  async fullCrawl(options: ProgramPdfCrawlOptions = {}): Promise<ProgramPdfCrawlResult> {
    const { forceUpdate = false } = options;
    const startTime = Date.now();

    this.log('\n===================================');
    this.log(`Starting program PDF ingest: ${this.sourceConfig.sourceGroupId}`);
    this.log(`Documents: ${this.sourceConfig.documents.length}, force: ${forceUpdate}`);
    this.log('===================================\n');

    const result: ProgramPdfCrawlResult = {
      totalDocuments: this.sourceConfig.documents.length,
      stored: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      totalVectors: 0,
      duration: 0,
      errorMessages: [],
    };

    for (const doc of this.sourceConfig.documents) {
      try {
        this.log(`Processing "${doc.title}" (${doc.pdfUrl})`);
        const processResult = await this.#processDocument(doc, forceUpdate);

        if (processResult.stored) {
          if (processResult.updated) {
            result.updated++;
          } else {
            result.stored++;
          }
          result.totalVectors += processResult.vectors || 0;
          this.log(`  → stored ${processResult.chunks} chunks`);
        } else {
          result.skipped++;
          this.log(`  → skipped (${processResult.reason})`);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[ProgramPdf] Error processing ${doc.documentId}: ${msg}`);
        result.errors++;
        result.errorMessages.push(`${doc.documentId}: ${msg}`);
      }
    }

    result.duration = Math.round((Date.now() - startTime) / 1000);

    this.log('\n===================================');
    this.log(
      `COMPLETED: ${result.stored} new, ${result.updated} updated (${result.totalVectors} vectors)`
    );
    this.log(`Skipped: ${result.skipped}, Errors: ${result.errors}`);
    this.log(`Duration: ${result.duration}s`);
    this.log('===================================');

    return result;
  }
}

export const grundsatzPdfScraperService = new ProgramPdfScraper(GRUNDSATZ_SOURCE);
export const oesterreichPdfScraperService = new ProgramPdfScraper(OESTERREICH_SOURCE);
