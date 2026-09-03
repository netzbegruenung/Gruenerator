/**
 * Main text chunking orchestration
 * Provides smart chunking with page markers, sentence alignment, and structure awareness
 */

import { cleanTextForEmbedding } from '../../text/index.js';

import { mergeSiblingTextBlocks, segmentBlocks, splitTableBlock } from './blockSegmentation.js';
import { sentenceRepack, enrichChunkWithMetadata } from './chunkPostProcessing.js';
import { splitTextByPageMarkers, buildPageRangesFromRaw } from './pageMarkerProcessing.js';
import { ParagraphChunker } from './paragraphSplitter.js';
import { hierarchicalChunkDocument } from './structureAwareChunking.js';
import { estimateTokens } from './validation.js';

import type { Chunk, ChunkingOptions } from './types.js';

/**
 * Ein Textabschnitt durch den Chunker — struktur-bewusst, wo es Struktur gibt.
 *
 * Zwei Pfade, und die Trennlinie ist die Sprengweite dieses Umbaus:
 *
 * 1. Ergibt die Blockzerlegung genau einen `text`-Block ohne Überschriftenpfad,
 *    läuft der ALTE Weg mit dem ALTEN Eingabetext — byteweise unverändert.
 *    Das ist kein Optimierungstrick: `cleanTextForEmbedding(x, true)` und
 *    danach `(…, false)` ist nicht garantiert dasselbe wie zweimal `false`
 *    (der OCR-Zusammenzieher `cleaning.ts:72` greift bei zwei Leerzeichen
 *    unterschiedlich). Der Schnellpfad umgeht die Frage, statt sie zu
 *    beantworten. Der Riegel dazu ist `chunkingGolden.vitest.ts`.
 * 2. Sonst je `text`-Block derselbe Weg wie bisher (1600/400 unverändert) und
 *    je `table`-Block ein Chunk. Kurze, benachbarte `text`-Blöcke desselben
 *    Abschnitts werden davor zusammengefasst (`mergeSiblingTextBlocks`) —
 *    sonst bekäme ein überschriftendichtes Dokument einen Kleinstchunk je
 *    Abschnitt, weil nichts über eine Blockgrenze hinweg zusammenfasst.
 */
async function chunkStructured(
  chunker: ParagraphChunker,
  text: string,
  meta: Record<string, unknown>,
  options: { pageRanges?: Array<{ start: number; end: number }> | undefined } = {}
): Promise<Chunk[]> {
  // `preserveStructure=true`, sonst sieht die Blockzerlegung den
  // plattgedrückten Text: die Vorgabe ersetzt jedes `\s{2,}` durch ein
  // Leerzeichen (cleaning.ts:74-76) und macht aus einer Pipe-Tabelle eine Zeile.
  const structured = cleanTextForEmbedding(text, true);
  const blocks = segmentBlocks(structured);

  const isPlainProse =
    blocks.length <= 1 &&
    (blocks[0]?.kind ?? 'text') === 'text' &&
    (blocks[0]?.headingPath.length ?? 0) === 0;

  if (isPlainProse) {
    const cleaned = cleanTextForEmbedding(text);
    const chunks = await chunker.chunkDocument(cleaned, meta);
    return sentenceRepack(chunks, {
      baseMetadata: meta,
      originalRawText: text,
      ...(options.pageRanges ? { pageRanges: options.pageRanges } : {}),
    });
  }

  // Erst hier, NICHT vor der Schnellpfad-Frage: ein kurzer Vorspann ohne Pfad
  // und der erste Abschnitt darunter fallen zusammen, das Ergebnis sähe wie
  // reiner Fließtext aus und das ganze Dokument fiele auf den alten Pfad
  // zurück — samt Verlust aller Strukturfelder.
  const out: Chunk[] = [];
  for (const block of mergeSiblingTextBlocks(blocks)) {
    const structure = {
      headingPath: block.headingPath.length > 0 ? block.headingPath : null,
      heading: block.headingPath.at(-1) ?? null,
      sectionIndex: block.sectionIndex > 0 ? block.sectionIndex : null,
      chunkingMethod: 'structure-blocks',
    };

    if (block.kind === 'table') {
      for (const part of splitTableBlock(block.text)) {
        out.push({
          text: part,
          index: out.length,
          tokens: estimateTokens(part),
          metadata: { ...meta, ...structure, chunkType: 'table' },
        });
      }
      continue;
    }

    const cleaned = cleanTextForEmbedding(block.text);
    const chunks = await chunker.chunkDocument(cleaned, meta);
    for (const packed of sentenceRepack(chunks, { baseMetadata: meta })) {
      out.push({
        ...packed,
        index: out.length,
        metadata: { ...packed.metadata, ...structure, chunkType: 'text' },
      });
    }
  }

  return out;
}

/**
 * Chunk a document intelligently based on its structure
 * Main entry point for document chunking
 */
export async function smartChunkDocument(
  text: string,
  options: ChunkingOptions = {}
): Promise<Chunk[]> {
  const { baseMetadata = {} } = options;

  // STEP 1: Detect page markers BEFORE any text cleaning
  // Use raw text to find page markers reliably
  const pages = splitTextByPageMarkers(text);

  try {
    const paragraphChunker = new ParagraphChunker();

    let all: Chunk[] = [];
    if (pages.length === 0) {
      // No pages detected - process entire document
      const pageRanges = buildPageRangesFromRaw(text);
      all = await chunkStructured(paragraphChunker, text, baseMetadata, { pageRanges });
    } else {
      // Process each page separately; die Blockzerlegung läuft innerhalb einer Seite
      for (const p of pages) {
        const pageMeta = { ...baseMetadata, page_number: p.pageNumber };
        const repacked = await chunkStructured(paragraphChunker, p.textWithoutMarker, pageMeta);
        // Ensure page_number is set on every chunk (prefer explicit over detection)
        all.push(
          ...repacked.map((c) => ({
            ...c,
            metadata: { ...c.metadata, page_number: p.pageNumber },
          }))
        );
      }
    }

    // Reindex chunks globally and enrich metadata
    return all.map((c, i) => enrichChunkWithMetadata({ ...c, index: i }, baseMetadata));
  } catch (_e) {
    // Minimal safety fallback; heute unerreichbar (die LangChain-Sonde, deren
    // Fehler er auffangen sollte, ist mit #3135 weg). Ihn zusammen mit
    // structureAwareChunking.ts abzuräumen ist ein eigener Aufräum-PR.
    const cleaned = cleanTextForEmbedding(text);
    const chunks = hierarchicalChunkDocument(cleaned, { maxTokens: 600, overlapTokens: 150 });
    return chunks.map((c) => enrichChunkWithMetadata(c, baseMetadata));
  }
}

/**
 * Async version of smartChunkDocument (for backward compatibility)
 * Delegates to the main smartChunkDocument function
 */
export async function smartChunkDocumentAsync(
  text: string,
  options: ChunkingOptions = {}
): Promise<Chunk[]> {
  return smartChunkDocument(text, options);
}
