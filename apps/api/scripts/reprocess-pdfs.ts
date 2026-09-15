#!/usr/bin/env npx tsx
/**
 * Reprocess PDF Documents in Qdrant
 *
 * Selectively re-extracts and re-indexes only PDF-sourced documents in a
 * Qdrant collection. Identifies PDFs by source_url ending in .pdf.
 *
 * Uses the improved pipeline: skip-OCR for text-native PDFs, text post-processing,
 * quality scoring per chunk.
 *
 * Usage:
 *   npx tsx scripts/reprocess-pdfs.ts [options]
 *
 * Options:
 *   --collection NAME   Target collection (default: landesverbaende_documents)
 *   --dry-run           Show PDF count and stats without reprocessing
 *   --limit N           Max PDFs to reprocess (default: unlimited)
 *   --concurrency N     Parallel PDF downloads (default: 3)
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';

dotenv.config();

import { env } from '../config/env.js';

// ============================================================================
// Configuration
// ============================================================================

const QDRANT_URL = env.QDRANT_URL ?? 'http://localhost:6333';
const QDRANT_API_KEY = env.QDRANT_API_KEY;
const QDRANT_BASIC_AUTH_USERNAME = env.QDRANT_BASIC_AUTH_USERNAME;
const QDRANT_BASIC_AUTH_PASSWORD = env.QDRANT_BASIC_AUTH_PASSWORD;

const SCROLL_BATCH_SIZE = 100;
const DEFAULT_COLLECTION = 'landesverbaende_documents';

interface CliArgs {
  collection: string;
  dryRun: boolean;
  limit: number;
  concurrency: number;
}

interface PdfDocument {
  sourceUrl: string;
  title: string;
  contentHash: string;
  chunkCount: number;
  originalPayload: Record<string, unknown>;
}

interface ReprocessStats {
  totalPdfs: number;
  reprocessed: number;
  skippedUnchanged: number;
  skippedDirectExtract: number;
  failed: number;
  errors: string[];
}

// ============================================================================
// Qdrant Client
// ============================================================================

function createClient(): QdrantClient {
  if (!QDRANT_API_KEY) {
    throw new Error('QDRANT_API_KEY environment variable is required');
  }

  const headers: Record<string, string> = {};
  if (QDRANT_BASIC_AUTH_USERNAME && QDRANT_BASIC_AUTH_PASSWORD) {
    headers['Authorization'] = `Basic ${Buffer.from(
      `${QDRANT_BASIC_AUTH_USERNAME}:${QDRANT_BASIC_AUTH_PASSWORD}`
    ).toString('base64')}`;
  }

  if (QDRANT_URL.startsWith('https://')) {
    const url = new URL(QDRANT_URL);
    const port = url.port ? parseInt(url.port) : 443;
    const basePath = url.pathname && url.pathname !== '/' ? url.pathname : undefined;

    return new QdrantClient({
      host: url.hostname,
      port,
      https: true,
      apiKey: QDRANT_API_KEY,
      timeout: 120000,
      checkCompatibility: false,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      ...(basePath ? { prefix: basePath } : {}),
    });
  }

  return new QdrantClient({
    url: QDRANT_URL,
    apiKey: QDRANT_API_KEY,
    timeout: 120000,
    checkCompatibility: false,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });
}

// ============================================================================
// PDF Discovery
// ============================================================================

async function discoverPdfs(client: QdrantClient, collection: string): Promise<PdfDocument[]> {
  const pdfs: PdfDocument[] = [];
  let offset: string | number | null = null;
  let batch = 0;

  console.log(`Scanning ${collection} for PDF documents (chunk_index=0)...`);

  while (true) {
    const scrollParams: Record<string, unknown> = {
      filter: {
        must: [{ key: 'chunk_index', match: { value: 0 } }],
      },
      limit: SCROLL_BATCH_SIZE,
      with_payload: true,
      with_vector: false,
    };
    if (offset !== null) scrollParams.offset = offset;

    const result = await client.scroll(collection, scrollParams);
    const points = result.points || [];

    if (points.length === 0) break;

    for (const point of points) {
      const payload = point.payload as Record<string, unknown>;
      const sourceUrl = payload.source_url as string;
      if (sourceUrl && sourceUrl.toLowerCase().endsWith('.pdf')) {
        pdfs.push({
          sourceUrl,
          title: (payload.title as string) || 'Untitled',
          contentHash: (payload.content_hash as string) || '',
          chunkCount: 0,
          originalPayload: payload,
        });
      }
    }

    batch++;
    if (batch % 5 === 0) {
      console.log(
        `  Scanned ${batch * SCROLL_BATCH_SIZE} documents, found ${pdfs.length} PDFs so far...`
      );
    }

    offset = result.next_page_offset ?? null;
    if (offset === null) break;
  }

  console.log(`Found ${pdfs.length} PDF documents in ${collection}`);
  return pdfs;
}

// ============================================================================
// PDF Reprocessing
// ============================================================================

async function reprocessPdf(
  client: QdrantClient,
  collection: string,
  pdf: PdfDocument,
  stats: ReprocessStats,
  dryRun: boolean
): Promise<void> {
  const { smartChunkDocument } =
    await import('../services/document-services/TextChunker/TextChunker.js');
  const { buildEmbeddingTextsForChunks } =
    await import('../services/document-services/embeddingText.js');
  const { structurePayload } = await import('../services/document-services/structurePayload.js');
  const { chunkQualityService } =
    await import('../services/ChunkQualityService/ChunkQualityService.js');
  const { batchDelete, batchUpsert } =
    await import('../database/services/QdrantService/operations/batchOperations.js');
  const { mistralEmbeddingService } = await import('../services/mistral/index.js');
  const { extractTextWithMistralOCR } =
    await import('../services/OcrService/mistralIntegration.js');
  const { getPdfJs, openPdfDocument, canExtractTextDirectly, extractTextDirectlyFromPDF } =
    await import('../services/OcrService/pdfOperations.js');
  const { applyMarkdownFormatting } = await import('../services/OcrService/textFormatting.js');
  const { getMediaType } = await import('../services/OcrService/validation.js');
  let tempPath: string | null = null;

  try {
    // Download PDF to temp file
    const response = await fetch(pdf.sourceUrl, {
      headers: { 'User-Agent': 'Gruenerator-Bot/1.0 (PDF Reprocessor)' },
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${pdf.sourceUrl}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    tempPath = path.join(os.tmpdir(), `reprocess_${crypto.randomBytes(8).toString('hex')}.pdf`);
    fs.writeFileSync(tempPath, buffer);

    // Skip-OCR: check if PDF has extractable text before calling Mistral
    let extraction: {
      text: string;
      method: string;
      pageCount: number;
      confidence: number;
      stats: Record<string, unknown>;
    };
    let usedMethod = 'mistral-ocr';

    const pdfjsLib = await getPdfJs();
    const openDoc = (p: string) => openPdfDocument(p, pdfjsLib);

    try {
      const parseCheck = await canExtractTextDirectly(tempPath, openDoc);

      if (parseCheck.isParseable && parseCheck.confidence >= 0.8) {
        // Text-native PDF — extract directly with PDF.js (free, no API cost)
        const directResult = await extractTextDirectlyFromPDF(
          tempPath,
          openDoc,
          applyMarkdownFormatting
        );

        if (directResult.text && directResult.text.length >= 50) {
          extraction = directResult;
          usedMethod = 'pdfjs-direct';
        } else {
          // Direct extraction insufficient — fall back to Mistral
          extraction = await extractTextWithMistralOCR(tempPath, getMediaType);
        }
      } else {
        // Scanned PDF or low confidence — use Mistral OCR
        extraction = await extractTextWithMistralOCR(tempPath, getMediaType);
      }
    } catch {
      // Parseability check failed — use Mistral OCR
      extraction = await extractTextWithMistralOCR(tempPath, getMediaType);
    }

    const text = extraction.text;

    if (!text || text.length < 100) {
      console.log(`  ⊘ ${pdf.title}: too short (${text?.length ?? 0} chars)`);
      stats.skippedUnchanged++;
      return;
    }

    // Check content hash — skip if text unchanged
    const newHash = crypto.createHash('md5').update(text).digest('hex');
    if (newHash === pdf.contentHash) {
      stats.skippedUnchanged++;
      return;
    }

    if (dryRun) {
      console.log(
        `  → ${pdf.title}: would reprocess (method=${usedMethod}, old_hash=${pdf.contentHash?.slice(0, 8)}..., new_hash=${newHash.slice(0, 8)}...)`
      );
      stats.reprocessed++;
      return;
    }

    // Chunk with improved pipeline
    const chunks = await smartChunkDocument(text, {
      baseMetadata: {
        title: pdf.title,
        source: 'landesverbaende_gruene',
        source_url: pdf.sourceUrl,
      },
    });

    if (chunks.length === 0) {
      console.log(`  ⊘ ${pdf.title}: no chunks generated`);
      stats.skippedUnchanged++;
      return;
    }

    // Generate embeddings — Titel und Überschriftenpfad vor dem Chunk, wie in
    // jedem anderen Ingest-Pfad. Der gespeicherte `chunk_text` bleibt roh.
    const chunkTexts = chunks.map((c) => c.text);
    await mistralEmbeddingService.init();
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
      buildEmbeddingTextsForChunks(chunks, pdf.title)
    );

    // Delete old chunks
    await batchDelete(client, collection, {
      must: [{ key: 'source_url', match: { value: pdf.sourceUrl } }],
    });

    // Build new points — preserve original metadata, update text/quality fields
    const generatePointId = (url: string, idx: number) => {
      const hash = crypto.createHash('md5').update(`${url}:${idx}`).digest();
      return parseInt(hash.toString('hex').slice(0, 15), 16);
    };

    // Carry over original metadata (landesverband, source_type, content_type, etc.)
    const {
      chunk_text: _ct,
      chunk_index: _ci,
      full_text: _ft,
      content_hash: _ch,
      indexed_at: _ia,
      quality_score: _qs,
      ...preservedPayload
    } = pdf.originalPayload;

    const points = chunks.map((chunk, index: number) => ({
      id: generatePointId(pdf.sourceUrl, index),
      vector: embeddings[index],
      payload: {
        ...preservedPayload,
        content_hash: newHash,
        chunk_index: index,
        chunk_text: chunkTexts[index],
        ...structurePayload(chunk),
        quality_score: chunkQualityService.calculateQualityScore(chunkTexts[index]),
        indexed_at: new Date().toISOString(),
        reprocessed: true,
        extraction_method: usedMethod,
        ...(index === 0 ? { full_text: text } : {}),
      },
    }));

    // Upsert in batches
    for (let i = 0; i < points.length; i += 10) {
      await batchUpsert(client, collection, points.slice(i, i + 10));
    }

    console.log(`  ✓ ${pdf.title}: ${chunks.length} chunks (method=${usedMethod})`);
    stats.reprocessed++;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ ${pdf.title}: ${msg}`);
    stats.failed++;
    stats.errors.push(`${pdf.sourceUrl}: ${msg}`);
  } finally {
    if (tempPath && fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {
    collection: DEFAULT_COLLECTION,
    dryRun: false,
    limit: Infinity,
    concurrency: 3,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--collection':
        result.collection = args[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--limit':
        result.limit = parseInt(args[++i], 10) || Infinity;
        break;
      case '--concurrency':
        result.concurrency = Math.max(1, parseInt(args[++i], 10) || 3);
        break;
    }
  }
  return result;
}

async function main() {
  const args = parseArgs();
  console.log(`\n=== PDF Reprocessor ===`);
  console.log(`Collection: ${args.collection}`);
  console.log(`Mode: ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (args.limit < Infinity) console.log(`Limit: ${args.limit}`);
  console.log();

  const client = createClient();
  const pdfs = await discoverPdfs(client, args.collection);

  if (pdfs.length === 0) {
    console.log('No PDF documents found. Nothing to do.');
    return;
  }

  const toProcess = args.limit < Infinity ? pdfs.slice(0, args.limit) : pdfs;
  console.log(`\nProcessing ${toProcess.length} PDFs...\n`);

  const stats: ReprocessStats = {
    totalPdfs: toProcess.length,
    reprocessed: 0,
    skippedUnchanged: 0,
    skippedDirectExtract: 0,
    failed: 0,
    errors: [],
  };

  // Process with concurrency limit
  const queue = [...toProcess];
  const workers = Array.from({ length: args.concurrency }, async () => {
    while (queue.length > 0) {
      const pdf = queue.shift();
      if (!pdf) break;
      await reprocessPdf(client, args.collection, pdf, stats, args.dryRun);
    }
  });

  await Promise.all(workers);

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Total PDFs:          ${stats.totalPdfs}`);
  console.log(`Reprocessed:         ${stats.reprocessed}`);
  console.log(`Skipped (unchanged): ${stats.skippedUnchanged}`);
  console.log(`Failed:              ${stats.failed}`);

  if (stats.errors.length > 0) {
    console.log(`\nErrors:`);
    for (const err of stats.errors) {
      console.log(`  - ${err}`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
