/**
 * Chunk post-processing utilities
 * Handles sentence repacking, metadata enrichment, and overlap creation
 */

import { vectorConfig } from '../../../config/vectorConfig.js';
import { chunkQualityService } from '../../ChunkQualityService/index.js';
import {
  detectContentType,
  detectMarkdownStructure,
  extractPageNumber,
} from '../../content/index.js';

import {
  sentenceSegments,
  findPageMarkers,
  createSentenceOverlap,
  resolvePageNumberForOffset,
} from './sentenceSegmentation.js';
import { estimateTokens } from './validation.js';

import type { Chunk, SentenceSegment } from './types.js';

/** Intermediate result with position info before final mapping to Chunk */
interface PositionedChunk {
  text: string;
  start: number;
  end: number;
  page_number: number | null;
}

/**
 * Repack chunks into sentence-aligned chunks with proper overlap
 */
export function sentenceRepack(
  chunks: Chunk[],
  options: {
    baseMetadata?: Record<string, unknown>;
    targetChars?: number;
    overlapChars?: number;
    originalRawText?: string;
    pageRanges?: Array<{ start: number; end: number }>;
  } = {}
): Chunk[] {
  const {
    baseMetadata = {},
    targetChars = 1600,
    overlapChars = 400,
    originalRawText: _originalRawText,
    pageRanges: _pageRanges,
  } = options;

  if (!Array.isArray(chunks) || chunks.length === 0) return [];

  // Concatenate texts in order; prefer page-aware metadata from first chunk
  const rawPageNum = chunks[0]?.metadata?.page_number ?? baseMetadata.page_number ?? null;
  const pageNum = typeof rawPageNum === 'number' ? rawPageNum : null;
  const text = chunks
    .map((c) => c.text)
    .join(' ')
    .trim();
  const sentences = sentenceSegments(text);
  const markers = findPageMarkers(text);
  const results: PositionedChunk[] = [];

  // Helper: split oversized text into targetChars-sized sub-chunks at word boundaries
  const splitOversizedText = (
    longText: string,
    startOffset: number
  ): Array<{ text: string; start: number; end: number }> => {
    const subChunks: Array<{ text: string; start: number; end: number }> = [];
    const words = longText.split(/\s+/);
    let buf = '';
    let bufStart = startOffset;

    const flush = (): void => {
      if (!buf) return;
      subChunks.push({ text: buf, start: bufStart, end: bufStart + buf.length });
      bufStart += buf.length + 1;
      buf = '';
    };

    for (const word of words) {
      // Ein einzelnes „Wort" über der Zielgröße hat keine Wortgrenze, an der
      // man es teilen könnte — bei Tabellendaten ist eine ganze Zeile ohne
      // Leerzeichen genau das. Ohne diesen Zweig läuft es unzerteilt durch und
      // die Obergrenze unten wäre wirkungslos.
      if (word.length > targetChars) {
        flush();
        for (let offset = 0; offset < word.length; offset += targetChars) {
          const slice = word.slice(offset, offset + targetChars);
          subChunks.push({ text: slice, start: bufStart, end: bufStart + slice.length });
          bufStart += slice.length;
        }
        bufStart += 1;
        continue;
      }

      if (buf.length + 1 + word.length > targetChars && buf) {
        flush();
        buf = word;
      } else {
        buf = buf ? `${buf} ${word}` : word;
      }
    }
    flush();
    return subChunks;
  };

  /**
   * Die Zusicherung, die vorher fehlte: kein Chunk verlässt diese Funktion
   * über `targetChars`.
   *
   * Die beiden Übergroß-Zweige unten sind Sonderfälle (einzelner langer Satz,
   * Schlusschunk) und greifen jeweils nur unter einer Zusatzbedingung — ein
   * langer Satz, der bei nicht-leerem Puffer eintrifft, kam an beiden vorbei.
   * Eine Nachbedingung an genau einer Stelle ist billiger zu prüfen als drei
   * Zweige, die sich einig sein müssen.
   */
  const enforceCeiling = (entries: PositionedChunk[]): PositionedChunk[] => {
    const capped: PositionedChunk[] = [];
    for (const entry of entries) {
      if (entry.text.length <= targetChars) {
        capped.push(entry);
        continue;
      }
      // Die Seitenzahl je Teilstück neu auflösen statt die des Ausgangschunks
      // durchzureichen: ein übergroßer Chunk kann eine `## Seite N`-Grenze
      // überspannen, und dann gehört jedes Teilstück auf die Seite, auf der es
      // beginnt. Die beiden Übergroß-Zweige unten machen es genauso.
      for (const sub of splitOversizedText(entry.text, entry.start)) {
        capped.push({
          ...sub,
          page_number: resolvePageNumberForOffset(markers, pageNum, sub.start),
        });
      }
    }
    return capped;
  };

  let currentSentences: SentenceSegment[] = [];
  let currentLength = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceText = sentence.s;

    // Handle oversized single sentences: split at word boundaries
    if (sentenceText.length > targetChars && currentSentences.length === 0) {
      const subChunks = splitOversizedText(sentenceText, sentence.start);
      for (const sub of subChunks) {
        const pn = resolvePageNumberForOffset(markers, pageNum, sub.start);
        results.push({ text: sub.text, start: sub.start, end: sub.end, page_number: pn });
      }
      continue;
    }

    // Check if adding this sentence would exceed target
    const tentativeLength =
      currentLength + (currentSentences.length > 0 ? 1 : 0) + sentenceText.length;

    if (tentativeLength <= targetChars || currentSentences.length === 0) {
      // Add sentence to current chunk
      currentSentences.push(sentence);
      currentLength = tentativeLength;
    } else {
      // Finalize current chunk
      if (currentSentences.length > 0) {
        const chunkText = currentSentences
          .map((s) => s.s)
          .join(' ')
          .trim();
        const chunkStart = currentSentences[0].start;
        const chunkEnd = currentSentences[currentSentences.length - 1].end;
        const pn = resolvePageNumberForOffset(markers, pageNum, chunkStart);
        results.push({ text: chunkText, start: chunkStart, end: chunkEnd, page_number: pn });

        // Create overlap using complete sentences from the end.
        //
        // `numSentences === 0` heißt: schon der letzte Satz allein passt nicht
        // mehr in das Überlappungsbudget, es gibt also keine Überlappung.
        // `slice(-0)` ist in JS aber `slice(0)` und liefert den GANZEN Puffer —
        // der Chunk wuchs dadurch mit jedem weiteren Satz an, statt neu
        // anzufangen, solange ein langer Satz am Ende stand. So entstanden am
        // 17.08.2026 aus einer CSV Chunks von 20.000–22.000 Zeichen, die die
        // Einbettungs-Batches auf je einen Text schrumpfen ließen.
        const overlapResult = createSentenceOverlap(currentSentences, overlapChars);
        const overlapSentences =
          overlapResult.numSentences > 0 ? currentSentences.slice(-overlapResult.numSentences) : [];
        currentSentences = [...overlapSentences, sentence];
        currentLength = currentSentences.map((s) => s.s).join(' ').length;
      } else {
        // Single sentence chunk
        currentSentences = [sentence];
        currentLength = sentenceText.length;
      }
    }
  }

  // Handle final chunk (may also be oversized if last sentence is huge)
  if (currentSentences.length > 0) {
    const chunkText = currentSentences
      .map((s) => s.s)
      .join(' ')
      .trim();
    const chunkStart = currentSentences[0].start;
    const chunkEnd = currentSentences[currentSentences.length - 1].end;

    if (chunkText.length > targetChars * 2) {
      const subChunks = splitOversizedText(chunkText, chunkStart);
      for (const sub of subChunks) {
        const pn = resolvePageNumberForOffset(markers, pageNum, sub.start);
        results.push({ text: sub.text, start: sub.start, end: sub.end, page_number: pn });
      }
    } else {
      const pn = resolvePageNumberForOffset(markers, pageNum, chunkStart);
      results.push({ text: chunkText, start: chunkStart, end: chunkEnd, page_number: pn });
    }
  }

  // Map to chunk objects
  return enforceCeiling(results).map((r, i) => ({
    text: r.text,
    index: i,
    tokens: estimateTokens(r.text),
    metadata: {
      ...baseMetadata,
      chunkingMethod: 'sentences',
      page_number: r.page_number,
    },
  }));
}

/**
 * Enrich chunk with content metadata
 */
export function enrichChunkWithMetadata(
  chunk: Chunk,
  baseMetadata: Record<string, unknown> = {}
): Chunk {
  const contentType = detectContentType(chunk.text);
  const md = detectMarkdownStructure(chunk.text);
  const pageNumberDetected = extractPageNumber(chunk.text);
  const qualityCfg = vectorConfig.get('quality');
  const quality = qualityCfg.enabled
    ? chunkQualityService.calculateQualityScore(chunk.text, { contentType })
    : 1.0;

  return {
    ...chunk,
    metadata: {
      ...chunk.metadata,
      ...baseMetadata,
      content_type: contentType,
      markdown: {
        headers: md.headers?.length || 0,
        lists: md.lists || 0,
        tables: md.tables || 0,
        code_blocks: md.codeBlocks || 0,
      },
      // Prefer pre-set page_number (e.g., from page-splitting) over detection
      page_number:
        chunk.metadata && chunk.metadata.page_number != null
          ? chunk.metadata.page_number
          : pageNumberDetected,
      quality_score: Number.isFinite(quality) ? quality : 0,
    },
  };
}

/**
 * Create sliding windows for better context preservation
 */
export function createSlidingWindows(
  text: string,
  windowSize: number = 400,
  stepSize: number = 300
): Array<{ text: string; start: number; end: number }> {
  const words = text.split(/\s+/);
  const windows: Array<{ text: string; start: number; end: number }> = [];

  // Approximate tokens per word (rough estimate)
  const tokensPerWord = 1.3;
  const wordsPerWindow = Math.floor(windowSize / tokensPerWord);
  const wordsPerStep = Math.floor(stepSize / tokensPerWord);

  for (let i = 0; i < words.length; i += wordsPerStep) {
    const windowWords = words.slice(i, i + wordsPerWindow);

    if (windowWords.length > 10) {
      // Minimum meaningful window
      windows.push({
        text: windowWords.join(' '),
        start: i,
        end: Math.min(i + wordsPerWindow, words.length),
      });
    }

    // Stop if we've reached the end
    if (i + wordsPerWindow >= words.length) {
      break;
    }
  }

  return windows;
}
