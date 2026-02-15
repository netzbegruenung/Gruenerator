/**
 * Thüringen Scraping Script
 *
 * Multi-phase ingestion for Grüne Thüringen content:
 *   --phase wahlprogramme  → 5 Landtagswahlprogramm PDFs via docling OCR
 *   --phase beschluesse    → ~93 LDK Beschlüsse PDFs via docling OCR
 *   --phase web            → LV Presse + Fraktion via LandesverbandScraper
 *   --phase all            → All phases sequentially
 *
 * Additional flags:
 *   --limit <n>        → Process only first N items (PDF phases)
 *   --max-pages <n>    → Override maxPages for web scraping
 *   --dry-run          → Extract text but don't store in Qdrant
 *   --source <id>      → Run only a specific web source (e.g., thueringen-lv)
 */

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  THUERINGEN_WAHLPROGRAMME,
  THUERINGEN_BESCHLUESSE,
  type ThueringenPdfSource,
} from './config/thueringenSources.js';
import { getQdrantInstance } from './database/services/QdrantService/index.js';
import { batchUpsert } from './database/services/QdrantService/operations/batchOperations.js';
import { smartChunkDocument } from './services/document-services/index.js';
import { mistralEmbeddingService } from './services/mistral/index.js';
import {
  extractTextWithDocling,
  isDoclingAvailable,
} from './services/OcrService/doclingIntegration.js';
import { landesverbandScraperService } from './services/scrapers/implementations/LandesverbandScraper/index.js';
import { generateContentHash, generatePointId } from './utils/validation/index.js';

const COLLECTION_NAME = 'landesverbaende_documents';
const BATCH_SIZE = 10;

// ═══════════════════════════════════════════════════════════════════
// CLI Argument Parsing
// ═══════════════════════════════════════════════════════════════════

interface CliArgs {
  phase: 'wahlprogramme' | 'beschluesse' | 'web' | 'all';
  limit?: number;
  maxPages?: number;
  dryRun: boolean;
  source?: string;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = { phase: 'all', dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--phase':
        result.phase = args[++i] as CliArgs['phase'];
        break;
      case '--limit':
        result.limit = parseInt(args[++i], 10);
        break;
      case '--max-pages':
        result.maxPages = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--source':
        result.source = args[++i];
        break;
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// PDF Text Extraction
// ═══════════════════════════════════════════════════════════════════

async function extractPdfText(pdfBuffer: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}

async function extractTextFromPdf(pdfBuffer: ArrayBuffer, useDocling: boolean): Promise<string> {
  if (useDocling) {
    const tmpPath = path.join(tmpdir(), `thueringen-${Date.now()}.pdf`);
    try {
      await fs.writeFile(tmpPath, Buffer.from(pdfBuffer));
      const result = await extractTextWithDocling(tmpPath);
      return result.text;
    } finally {
      await fs.unlink(tmpPath).catch(() => {});
    }
  }

  return extractPdfText(pdfBuffer);
}

// ═══════════════════════════════════════════════════════════════════
// Dedup Check
// ═══════════════════════════════════════════════════════════════════

async function isAlreadyIndexed(url: string): Promise<boolean> {
  try {
    const qdrant = getQdrantInstance();
    if (!qdrant.client) return false;

    const result = await qdrant.client.scroll(COLLECTION_NAME, {
      filter: {
        must: [{ key: 'source_url', match: { value: url } }],
      },
      limit: 1,
    });

    return (result.points?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PDF Ingestion Pipeline
// ═══════════════════════════════════════════════════════════════════

async function ingestPdf(
  pdf: ThueringenPdfSource,
  index: number,
  total: number,
  useDocling: boolean,
  dryRun: boolean,
  landesverband: string
): Promise<{ success: boolean; reason?: string }> {
  const label = `[${index + 1}/${total}]`;
  console.log(`\n${label} Processing: ${pdf.title}`);
  console.log(`   URL: ${pdf.url}`);

  // Dedup check
  if (!dryRun && (await isAlreadyIndexed(pdf.url))) {
    console.log(`   SKIPPED: Already indexed`);
    return { success: true, reason: 'already_indexed' };
  }

  // Download
  console.log(`   Downloading...`);
  const response = await fetch(pdf.url);
  if (!response.ok) {
    console.error(`   FAILED: HTTP ${response.status}`);
    return { success: false, reason: `http_${response.status}` };
  }
  const pdfBuffer = await response.arrayBuffer();
  console.log(`   Downloaded ${(pdfBuffer.byteLength / 1024).toFixed(0)} KB`);

  // Extract text
  console.log(`   Extracting text (${useDocling ? 'docling' : 'pdfjs'})...`);
  const text = await extractTextFromPdf(pdfBuffer, useDocling);
  console.log(`   Extracted ${text.length} characters`);

  if (text.length < 100) {
    console.warn(`   SKIPPED: Text too short (${text.length} chars)`);
    return { success: false, reason: 'too_short' };
  }

  if (dryRun) {
    console.log(`   DRY RUN: Would store ${text.length} chars`);
    console.log(`   Preview: ${text.substring(0, 200)}...`);
    return { success: true, reason: 'dry_run' };
  }

  // Chunk
  console.log(`   Chunking...`);
  const chunks = await smartChunkDocument(text, {
    baseMetadata: {
      title: pdf.title,
      source: 'landesverbaende_gruene',
      source_url: pdf.url,
    },
  });
  console.log(`   Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    console.warn(`   SKIPPED: No chunks generated`);
    return { success: false, reason: 'no_chunks' };
  }

  // Embeddings
  console.log(`   Generating embeddings...`);
  const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
  const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);

  // Build points
  const contentHash = generateContentHash(text);
  const sourceId =
    pdf.contentType === 'wahlprogramm' ? 'thueringen-lv-wahlprogramme' : 'thueringen-lv';

  const points = chunks.map((chunk: any, idx: number) => ({
    id: generatePointId('th_pdf', pdf.url, idx),
    vector: embeddings[idx],
    payload: {
      document_id: `lv_${contentHash}`,
      source_url: pdf.url,
      source_id: sourceId,
      source_name: 'Grüne Thüringen',
      landesverband,
      source_type: 'landesverband',
      content_type: pdf.contentType,
      content_type_label: pdf.contentType === 'wahlprogramm' ? 'Wahlprogramm' : 'Beschluss',
      content_hash: contentHash,
      chunk_index: idx,
      chunk_text: chunkTexts[idx],
      title: pdf.title,
      primary_category: pdf.category || pdf.contentType,
      subcategories: [pdf.contentType === 'wahlprogramm' ? 'Wahlprogramm' : 'Beschluss'],
      published_at: new Date(pdf.date).toISOString(),
      indexed_at: new Date().toISOString(),
      source: 'landesverbaende_gruene',
    },
  }));

  // Store in Qdrant
  console.log(`   Storing ${points.length} vectors...`);
  const qdrant = getQdrantInstance();
  if (!qdrant.client) throw new Error('Qdrant client not initialized');

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await batchUpsert(qdrant.client, COLLECTION_NAME, batch);
  }

  console.log(`   DONE: ${points.length} vectors stored`);
  return { success: true };
}

// ═══════════════════════════════════════════════════════════════════
// Phase Runners
// ═══════════════════════════════════════════════════════════════════

async function runPdfPhase(
  name: string,
  pdfs: ThueringenPdfSource[],
  useDocling: boolean,
  dryRun: boolean,
  limit?: number
) {
  const items = limit ? pdfs.slice(0, limit) : pdfs;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Phase: ${name} (${items.length}/${pdfs.length} items)`);
  console.log(`OCR: ${useDocling ? 'docling-serve' : 'pdfjs-dist'}`);
  console.log(`${'='.repeat(60)}`);

  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await ingestPdf(items[i], i, items.length, useDocling, dryRun, 'TH');

      if (result.success) {
        if (result.reason === 'already_indexed' || result.reason === 'dry_run') {
          skipped++;
        } else {
          success++;
        }
      } else {
        failed++;
      }

      // Rate limiting between downloads
      if (i < items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (err) {
      console.error(`   ERROR: ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\n--- ${name} Summary ---`);
  console.log(`  Success: ${success}, Skipped: ${skipped}, Failed: ${failed}`);
}

async function runWebPhase(
  dryRun: boolean,
  maxPages?: number,
  sourceFilter?: string
) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Phase: Web Scraping`);
  console.log(`${'='.repeat(60)}`);

  if (dryRun) {
    console.log('DRY RUN: Skipping web scraping (requires live Qdrant)');
    return;
  }

  await landesverbandScraperService.init();

  const sources = sourceFilter
    ? [sourceFilter]
    : ['thueringen-lv', 'thueringen-fraktion'];

  for (const sourceId of sources) {
    console.log(`\nScraping source: ${sourceId}`);

    // Override maxPages if specified
    if (maxPages) {
      const { getSourceById } = await import('./config/landesverbaendeConfig.js');
      const source = getSourceById(sourceId);
      if (source) {
        for (const cp of source.contentPaths) {
          cp.maxPages = maxPages;
        }
      }
    }

    try {
      const result = await landesverbandScraperService.scrapeSource(sourceId, {
        forceUpdate: false,
      });
      console.log(`Result for ${sourceId}:`, JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`Error scraping ${sourceId}:`, err instanceof Error ? err.message : err);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════

async function main() {
  const args = parseArgs();
  console.log('=== Thüringen Scraping Script ===');
  console.log(`Phase: ${args.phase}`);
  if (args.limit) console.log(`Limit: ${args.limit}`);
  if (args.maxPages) console.log(`Max pages: ${args.maxPages}`);
  if (args.dryRun) console.log(`Mode: DRY RUN`);
  if (args.source) console.log(`Source filter: ${args.source}`);

  // Check docling availability
  const useDocling = await isDoclingAvailable();
  console.log(`Docling OCR: ${useDocling ? 'available' : 'unavailable (using pdfjs fallback)'}`);

  // Run phases
  if (args.phase === 'wahlprogramme' || args.phase === 'all') {
    await runPdfPhase('Wahlprogramme', THUERINGEN_WAHLPROGRAMME, useDocling, args.dryRun, args.limit);
  }

  if (args.phase === 'beschluesse' || args.phase === 'all') {
    await runPdfPhase('Beschlüsse', THUERINGEN_BESCHLUESSE, useDocling, args.dryRun, args.limit);
  }

  if (args.phase === 'web' || args.phase === 'all') {
    await runWebPhase(args.dryRun, args.maxPages, args.source);
  }

  console.log('\n=== COMPLETE ===');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
