import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { getQdrantInstance } from './database/services/QdrantService/index.js';
import { batchUpsert } from './database/services/QdrantService/operations/batchOperations.js';
import { smartChunkDocument } from './services/document-services/index.js';
import { mistralEmbeddingService } from './services/mistral/index.js';
import { generateContentHash, generatePointId } from './utils/validation/index.js';

const PDF_URL = 'https://www.gruene-bayern.de/dateien/Regierungsprogramm_final_22_06_2023.pdf';
const COLLECTION_NAME = 'landesverbaende_documents';
const BATCH_SIZE = 10;

async function extractPdfText(pdfBuffer: ArrayBuffer): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  console.log(`   PDF has ${numPages} pages`);

  const pageTexts: string[] = [];
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    pageTexts.push(pageText);
  }

  return pageTexts.join('\n\n');
}

async function main() {
  console.log('=== Bayern Regierungsprogramm Ingestion ===\n');

  // Step 1: Download PDF
  console.log('1. Downloading PDF...');
  const response = await fetch(PDF_URL);
  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }
  const pdfBuffer = await response.arrayBuffer();
  console.log(`   Downloaded ${(pdfBuffer.byteLength / 1024 / 1024).toFixed(1)} MB`);

  // Step 2: Extract text via pdfjs-dist
  console.log('2. Extracting text via pdfjs-dist...');
  const text = await extractPdfText(pdfBuffer);
  console.log(`   Extracted ${text.length} characters`);

  if (text.length < 100) {
    throw new Error('Extracted text too short — PDF may be image-only');
  }

  // Step 3: Chunk the document
  console.log('3. Chunking document...');
  const chunks = await smartChunkDocument(text, {
    baseMetadata: {
      title: 'Regierungsprogramm 2023 – Grüne Bayern',
      source: 'landesverbaende_gruene',
      source_url: PDF_URL,
    },
  });
  console.log(`   Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    throw new Error('No chunks generated');
  }

  // Step 4: Generate embeddings
  console.log('4. Generating embeddings...');
  const chunkTexts = chunks.map((c: any) => c.text || c.chunk_text);
  const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(chunkTexts);
  console.log(`   Generated ${embeddings.length} embeddings`);

  // Step 5: Build Qdrant points
  console.log('5. Building Qdrant points...');
  const contentHash = generateContentHash(text);
  const documentTitle = 'Regierungsprogramm 2023 – Grüne Bayern';

  const points = chunks.map((chunk: any, index: number) => ({
    id: generatePointId('by_ltw', PDF_URL, index),
    vector: embeddings[index],
    payload: {
      document_id: `lv_${contentHash}`,
      source_url: PDF_URL,
      source_id: 'bayern-lv',
      source_name: 'Grüne Bayern',
      landesverband: 'BY',
      source_type: 'landesverband',
      content_type: 'beschluss',
      content_type_label: 'Regierungsprogramm',
      content_hash: contentHash,
      chunk_index: index,
      chunk_text: chunkTexts[index],
      title: documentTitle,
      primary_category: 'Regierungsprogramm LTW 2023',
      subcategories: ['Regierungsprogramm', 'Landtagswahl'],
      published_at: '2023-06-22T00:00:00.000Z',
      indexed_at: new Date().toISOString(),
      source: 'landesverbaende_gruene',
    },
  }));

  // Step 6: Store in Qdrant
  console.log('6. Storing in Qdrant...');
  const qdrant = getQdrantInstance();
  if (!qdrant.client) {
    throw new Error('Qdrant client not initialized');
  }
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await batchUpsert(qdrant.client, COLLECTION_NAME, batch);
    console.log(
      `   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(points.length / BATCH_SIZE)} stored`
    );
  }

  console.log('\n=== DONE ===');
  console.log(`Stored ${points.length} vectors in collection '${COLLECTION_NAME}'`);
  console.log(`Landesverband filter: BY`);
  console.log(`Document: ${documentTitle}`);

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
