#!/usr/bin/env npx tsx
/**
 * Training Data Transformer
 *
 * Reads raw documents from exportNotebookData.ts output and transforms them
 * into gpt-oss chat-format training pairs (OpenAI Harmony-compatible JSONL).
 *
 * Usage:
 *   npx tsx scripts/transformTrainingData.ts [options]
 *
 * Options:
 *   --input FILE        Input file (default: data/raw-documents.jsonl)
 *   --output-dir DIR    Output directory (default: data/)
 *   --min-length N      Minimum document length in chars (default: 200)
 *   --max-length N      Maximum document length in chars (default: 16000)
 *   --split RATIO       Train/validation split ratio (default: 0.9)
 *   --window-size N     Chunks per window for large docs (default: 4)
 *   --max-per-type N    Cap examples per content_type (random sample)
 *   --dry-run           Show stats without writing output
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { resolve, join } from 'path';

// ============================================================================
// Configuration
// ============================================================================

const SYSTEM_PROMPT_DE = `Du bist ein erfahrener Kommunikationsexperte von Bündnis 90/Die Grünen. Du schreibst authentische Texte im Stil der Grünen Partei — klar, sachlich, lösungsorientiert und in gendergerechter Sprache mit Genderstern (*). Du kennst die politischen Positionen, die Beschlusskultur und den Kommunikationsstil der Partei.`;

const SYSTEM_PROMPT_AT = `Du bist ein erfahrener Kommunikationsexperte von Die Grünen – Die Grüne Alternative (Österreich). Du schreibst authentische Texte im Stil der Grünen Partei Österreichs — klar, sachlich, lösungsorientiert. Du kennst die politischen Positionen und den Kommunikationsstil der Partei.`;

/**
 * Prompt templates by content_type.
 * {title} and {category} are replaced with document metadata.
 */
const PROMPT_TEMPLATES: Record<string, string[]> = {
  presse: [
    'Schreibe eine Pressemitteilung zum Thema: {title}',
    'Verfasse eine Presseaussendung zu: {title}',
    'Erstelle eine Pressemeldung über: {title}',
  ],
  beschluss: [
    'Verfasse einen Parteitagsbeschluss zum Thema: {title}',
    'Schreibe einen Beschlusstext zu: {title}',
    'Formuliere einen Beschluss der Grünen zu: {title}',
  ],
  wahlprogramm: [
    'Schreibe einen Abschnitt für ein Wahlprogramm zu: {category}',
    'Verfasse einen Wahlprogramm-Abschnitt zum Thema: {category}',
  ],
  blog: [
    'Schreibe einen Blogbeitrag über: {title}',
    'Verfasse einen Blog-Artikel zum Thema: {title}',
  ],
  antrag: [
    'Formuliere einen Antrag zum Thema: {title}',
    'Schreibe einen Parteitagsantrag zu: {title}',
  ],
  grundsatz: [
    'Erkläre die Position der Grünen zu: {category}',
    'Beschreibe die Grundsatzposition der Grünen zum Thema: {category}',
  ],
  fachtext: [
    'Schreibe einen Fachtext zum Thema: {title}',
    'Verfasse eine politische Analyse zu: {title}',
  ],
  instagram: [
    'Schreibe einen Instagram-Post über: {title}',
    'Erstelle einen Instagram-Beitrag zum Thema: {title}',
  ],
  facebook: [
    'Schreibe einen Facebook-Post über: {title}',
    'Erstelle einen Facebook-Beitrag zum Thema: {title}',
  ],
};

const DEFAULT_TEMPLATES = [
  'Schreibe einen Text zum Thema: {title}',
  'Verfasse einen Beitrag über: {title}',
];

// ============================================================================
// Types
// ============================================================================

interface RawDocument {
  collection: string;
  document_id: string;
  title: string | null;
  content: string;
  content_type: string | null;
  primary_category: string | null;
  subcategories: string[];
  source_url: string | null;
  published_at: string | null;
  landesverband: string | null;
  country: string | null;
  platform: string | null;
  chunk_count: number;
}

interface TrainingExample {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  _contentType?: string;
}

interface TransformStats {
  inputDocuments: number;
  outputExamples: number;
  trainExamples: number;
  validationExamples: number;
  skipped: {
    tooShort: number;
    noTitle: number;
    duplicate: number;
    genericTitle: number;
  };
  byCollection: Record<string, number>;
  byContentType: Record<string, number>;
  lengthStats: {
    min: number;
    max: number;
    avg: number;
  };
}

// ============================================================================
// Transform Logic
// ============================================================================

const GENERIC_TITLES = new Set([
  'untitled',
  'ohne titel',
  'no title',
  'startseite',
  'home',
  'index',
  '',
]);

function isGenericTitle(title: string): boolean {
  return GENERIC_TITLES.has(title.toLowerCase().trim());
}

function getSystemPrompt(doc: RawDocument): string {
  if (doc.country === 'AT') return SYSTEM_PROMPT_AT;
  if (
    doc.collection === 'oesterreich_gruene_documents' ||
    doc.collection === 'gruene_at_documents'
  ) {
    return SYSTEM_PROMPT_AT;
  }
  return SYSTEM_PROMPT_DE;
}

function selectPromptTemplate(doc: RawDocument): string {
  const contentType = doc.content_type || doc.platform || '';
  const templates = PROMPT_TEMPLATES[contentType.toLowerCase()] || DEFAULT_TEMPLATES;

  // Deterministic selection based on document_id for reproducibility
  const hash = createHash('md5').update(doc.document_id).digest();
  const index = hash[0] % templates.length;
  const template = templates[index];

  const title = doc.title || doc.primary_category || 'Politik';
  const category = doc.primary_category || doc.title || 'Politik';

  return template.replace('{title}', title).replace('{category}', category);
}

function createTrainingExample(
  doc: RawDocument,
  content: string,
  promptOverride?: string
): TrainingExample {
  return {
    messages: [
      { role: 'system', content: getSystemPrompt(doc) },
      { role: 'user', content: promptOverride || selectPromptTemplate(doc) },
      { role: 'assistant', content },
    ],
  };
}

/**
 * For very large documents (100+ chunks), create multiple training examples
 * using a sliding window over the content.
 */
function createSlidingWindowExamples(
  doc: RawDocument,
  windowSize: number,
  maxLength: number
): TrainingExample[] {
  // Split content back into rough chunks (~500 chars each, by paragraph)
  const paragraphs = doc.content.split(/\n{2,}/);
  if (paragraphs.length <= windowSize) {
    return [createTrainingExample(doc, doc.content.slice(0, maxLength))];
  }

  const examples: TrainingExample[] = [];
  const step = Math.max(1, Math.floor(windowSize / 2)); // 50% overlap

  for (let i = 0; i < paragraphs.length - windowSize + 1; i += step) {
    const windowParagraphs = paragraphs.slice(i, i + windowSize);
    const windowText = windowParagraphs.join('\n\n').trim();

    if (windowText.length < 200) continue;
    if (windowText.length > maxLength) continue;

    // Use section-specific prompt if we can extract a heading
    const firstLine = windowParagraphs[0].trim();
    const isHeading =
      firstLine.length < 120 && !firstLine.endsWith('.') && !firstLine.endsWith(',');

    const prompt = isHeading
      ? selectPromptTemplate({
          ...doc,
          title: firstLine,
          primary_category: firstLine,
        })
      : selectPromptTemplate(doc);

    examples.push(createTrainingExample(doc, windowText, prompt));

    if (examples.length >= 20) break; // Cap per document
  }

  return examples;
}

function transformDocuments(
  documents: RawDocument[],
  options: {
    minLength: number;
    maxLength: number;
    windowSize: number;
  }
): { examples: TrainingExample[]; stats: TransformStats } {
  const { minLength, maxLength, windowSize } = options;
  const examples: TrainingExample[] = [];
  const contentHashes = new Set<string>();

  const stats: TransformStats = {
    inputDocuments: documents.length,
    outputExamples: 0,
    trainExamples: 0,
    validationExamples: 0,
    skipped: { tooShort: 0, noTitle: 0, duplicate: 0, genericTitle: 0 },
    byCollection: {},
    byContentType: {},
    lengthStats: { min: Infinity, max: 0, avg: 0 },
  };

  const lengths: number[] = [];

  for (const doc of documents) {
    // Skip documents without usable title
    if (!doc.title && !doc.primary_category) {
      stats.skipped.noTitle++;
      continue;
    }

    // Skip generic titles
    if (doc.title && isGenericTitle(doc.title)) {
      stats.skipped.genericTitle++;
      continue;
    }

    // Skip too-short documents
    if (doc.content.length < minLength) {
      stats.skipped.tooShort++;
      continue;
    }

    // Deduplicate by content hash
    const hash = createHash('md5').update(doc.content).digest('hex');
    if (contentHashes.has(hash)) {
      stats.skipped.duplicate++;
      continue;
    }
    contentHashes.add(hash);

    // Large documents get sliding window treatment
    let docExamples: TrainingExample[];

    if (doc.chunk_count > 20 && doc.content.length > maxLength) {
      docExamples = createSlidingWindowExamples(doc, windowSize, maxLength);
    } else {
      const content = doc.content.slice(0, maxLength);
      docExamples = [createTrainingExample(doc, content)];
    }

    const ct = doc.content_type || doc.platform || 'unknown';

    for (const example of docExamples) {
      example._contentType = ct;
      examples.push(example);

      const responseLength = example.messages[2].content.length;
      lengths.push(responseLength);
      stats.lengthStats.min = Math.min(stats.lengthStats.min, responseLength);
      stats.lengthStats.max = Math.max(stats.lengthStats.max, responseLength);
    }

    const collection = doc.collection;
    stats.byCollection[collection] = (stats.byCollection[collection] || 0) + docExamples.length;
    stats.byContentType[ct] = (stats.byContentType[ct] || 0) + docExamples.length;
  }

  stats.outputExamples = examples.length;
  stats.lengthStats.avg =
    lengths.length > 0 ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;

  if (stats.lengthStats.min === Infinity) stats.lengthStats.min = 0;

  return { examples, stats };
}

/**
 * Cap examples per content_type via deterministic sampling.
 * Types with fewer than maxPerType examples are kept unchanged.
 */
function sampleByContentType(
  examples: TrainingExample[],
  maxPerType: number
): { sampled: TrainingExample[]; droppedByType: Record<string, number> } {
  const byType = new Map<string, TrainingExample[]>();
  for (const ex of examples) {
    const ct = ex._contentType || 'unknown';
    if (!byType.has(ct)) byType.set(ct, []);
    byType.get(ct)!.push(ex);
  }

  const sampled: TrainingExample[] = [];
  const droppedByType: Record<string, number> = {};

  for (const [ct, typeExamples] of byType) {
    if (typeExamples.length <= maxPerType) {
      sampled.push(...typeExamples);
    } else {
      // Deterministic shuffle using hash
      const shuffled = [...typeExamples];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const hash = createHash('md5').update(`sample-${ct}-${i}`).digest();
        const j = (hash[0] * 256 + hash[1]) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      sampled.push(...shuffled.slice(0, maxPerType));
      droppedByType[ct] = typeExamples.length - maxPerType;
    }
  }

  return { sampled, droppedByType };
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    dryRun: args.includes('--dry-run'),
    input: 'data/raw-documents.jsonl',
    outputDir: 'data',
    minLength: 200,
    maxLength: 16000,
    split: 0.9,
    windowSize: 4,
    maxPerType: undefined as number | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) result.input = args[++i];
    if (args[i] === '--output-dir' && args[i + 1]) result.outputDir = args[++i];
    if (args[i] === '--min-length' && args[i + 1]) result.minLength = parseInt(args[++i], 10);
    if (args[i] === '--max-length' && args[i + 1]) result.maxLength = parseInt(args[++i], 10);
    if (args[i] === '--split' && args[i + 1]) result.split = parseFloat(args[++i]);
    if (args[i] === '--window-size' && args[i + 1]) result.windowSize = parseInt(args[++i], 10);
    if (args[i] === '--max-per-type' && args[i + 1]) result.maxPerType = parseInt(args[++i], 10);
  }

  return result;
}

function printStats(stats: TransformStats): void {
  console.log('\n--- Transform Statistics ---\n');
  console.log(`  Input documents: ${stats.inputDocuments}`);
  console.log(`  Output examples: ${stats.outputExamples}`);
  console.log(`    Train: ${stats.trainExamples}`);
  console.log(`    Validation: ${stats.validationExamples}`);

  console.log('\n  Skipped:');
  console.log(`    Too short (<min chars): ${stats.skipped.tooShort}`);
  console.log(`    No title/category: ${stats.skipped.noTitle}`);
  console.log(`    Duplicate content: ${stats.skipped.duplicate}`);
  console.log(`    Generic title: ${stats.skipped.genericTitle}`);

  console.log('\n  By collection:');
  for (const [col, count] of Object.entries(stats.byCollection).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${col}: ${count}`);
  }

  console.log('\n  By content type:');
  for (const [ct, count] of Object.entries(stats.byContentType).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${ct}: ${count}`);
  }

  console.log('\n  Response length:');
  console.log(`    Min: ${stats.lengthStats.min} chars`);
  console.log(`    Max: ${stats.lengthStats.max} chars`);
  console.log(`    Avg: ${stats.lengthStats.avg} chars`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('Training Data Transformer\n');

  const args = parseArgs();
  const inputPath = resolve(args.input);
  const outputDir = resolve(args.outputDir);

  if (!existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    console.error('Run exportNotebookData.ts first.');
    process.exit(1);
  }

  console.log(`Input: ${inputPath}`);
  console.log(`Min length: ${args.minLength}, Max length: ${args.maxLength}`);
  console.log(`Window size: ${args.windowSize} paragraphs`);
  if (args.maxPerType) console.log(`Max per type: ${args.maxPerType}`);
  console.log(`Train/validation split: ${args.split}/${(1 - args.split).toFixed(2)}\n`);

  // Read raw documents
  const rawLines = readFileSync(inputPath, 'utf-8')
    .split('\n')
    .filter((line) => line.trim());

  console.log(`Read ${rawLines.length} documents from input\n`);

  const documents: RawDocument[] = rawLines.map((line) => JSON.parse(line));

  // Transform
  const { examples, stats } = transformDocuments(documents, {
    minLength: args.minLength,
    maxLength: args.maxLength,
    windowSize: args.windowSize,
  });

  // Apply per-type sampling if requested
  if (args.maxPerType) {
    const { sampled, droppedByType } = sampleByContentType(examples, args.maxPerType);
    const totalDropped = Object.values(droppedByType).reduce((a, b) => a + b, 0);
    console.log(
      `Balanced: ${examples.length} → ${sampled.length} examples (${totalDropped} dropped)`
    );
    for (const [ct, dropped] of Object.entries(droppedByType).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${ct}: capped at ${args.maxPerType} (-${dropped})`);
    }
    console.log();

    examples.length = 0;
    examples.push(...sampled);

    // Update stats to reflect balanced counts
    stats.outputExamples = examples.length;
    stats.byContentType = {};
    for (const ex of examples) {
      const ct = ex._contentType || 'unknown';
      stats.byContentType[ct] = (stats.byContentType[ct] || 0) + 1;
    }
  }

  // Strip internal _contentType before serialization
  for (const ex of examples) {
    delete ex._contentType;
  }

  // Shuffle deterministically (Fisher-Yates with seeded-ish approach)
  for (let i = examples.length - 1; i > 0; i--) {
    const hash = createHash('md5').update(`shuffle-${i}`).digest();
    const j = (hash[0] * 256 + hash[1]) % (i + 1);
    [examples[i], examples[j]] = [examples[j], examples[i]];
  }

  // Split train/validation
  const splitIndex = Math.floor(examples.length * args.split);
  const trainExamples = examples.slice(0, splitIndex);
  const validationExamples = examples.slice(splitIndex);

  stats.trainExamples = trainExamples.length;
  stats.validationExamples = validationExamples.length;

  printStats(stats);

  if (args.dryRun) {
    console.log('\nDry run complete. Run without --dry-run to write output.');
    return;
  }

  // Write output
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const trainPath = join(outputDir, 'training-data.jsonl');
  const valPath = join(outputDir, 'validation-data.jsonl');

  writeFileSync(trainPath, trainExamples.map((ex) => JSON.stringify(ex)).join('\n') + '\n');
  writeFileSync(valPath, validationExamples.map((ex) => JSON.stringify(ex)).join('\n') + '\n');

  console.log(`\nWrote ${trainExamples.length} training examples to ${trainPath}`);
  console.log(`Wrote ${validationExamples.length} validation examples to ${valPath}`);

  const trainSize = (
    Buffer.byteLength(trainExamples.map((ex) => JSON.stringify(ex)).join('\n')) /
    1024 /
    1024
  ).toFixed(1);
  const valSize = (
    Buffer.byteLength(validationExamples.map((ex) => JSON.stringify(ex)).join('\n')) /
    1024 /
    1024
  ).toFixed(1);
  console.log(`File sizes: train ${trainSize} MB, validation ${valSize} MB`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
