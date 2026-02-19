/**
 * Sentence segmentation for German text
 * Handles German-specific sentence boundary detection with abbreviation awareness
 */

import { GERMAN_ABBREVIATIONS, isNewSentenceStart } from './germanLanguageRules.js';

import type { SentenceSegment, PageMarker, SentenceOverlap } from './types.js';

/**
 * Segment text into sentences with German language awareness
 */
export function sentenceSegments(text: string): SentenceSegment[] {
  const segments: SentenceSegment[] = [];
  if (!text) return segments;

  // Normalize line breaks but preserve paragraph structure
  const normalized = text.replace(/\n+/g, ' ').trim();

  // Split into potential sentences using multiple delimiters
  const potentialSentences = normalized.split(/([.!?]+)(?=\s|$)/);

  let currentSentence = '';
  let currentStart = 0;

  for (let i = 0; i < potentialSentences.length; i++) {
    const part = potentialSentences[i];

    if (!part) continue;

    if (/^[.!?]+$/.test(part)) {
      // This is punctuation - check if it's a real sentence end
      currentSentence += part;

      // Look ahead to see what follows
      const nextPart = potentialSentences[i + 1];
      const afterPunctuation = nextPart ? nextPart.trim() : '';

      // Check if this might be an abbreviation
      const beforePunctuation = currentSentence.slice(0, -part.length).trim();
      const lastWord = beforePunctuation.split(/\s+/).pop() || '';

      // Decide if this is a real sentence boundary
      const isAbbreviation =
        GERMAN_ABBREVIATIONS.has(lastWord) || GERMAN_ABBREVIATIONS.has(lastWord.replace(/\./g, ''));
      const nextStartsWithLower = afterPunctuation && /^[a-zäöüß]/.test(afterPunctuation);
      const isRealSentenceEnd = !isAbbreviation && isNewSentenceStart(afterPunctuation);

      if (isRealSentenceEnd || i === potentialSentences.length - 1) {
        // End current sentence
        const sentence = currentSentence.trim();
        if (sentence) {
          segments.push({
            s: sentence,
            start: currentStart,
            end: currentStart + sentence.length,
          });
        }

        // Start new sentence
        currentStart += currentSentence.length;
        if (nextPart) {
          currentStart += nextPart.match(/^\s*/)?.[0]?.length || 0;
        }
        currentSentence = '';
      }
    } else {
      // Regular text part
      if (currentSentence === '') {
        currentStart = normalized.indexOf(part, currentStart);
      }
      currentSentence += part;
    }
  }

  // Handle any remaining text
  if (currentSentence.trim()) {
    segments.push({
      s: currentSentence.trim(),
      start: currentStart,
      end: currentStart + currentSentence.length,
    });
  }

  return segments;
}

/**
 * Find page markers in text
 */
export function findPageMarkers(text: string): PageMarker[] {
  const markers: PageMarker[] = [];
  if (!text) return markers;

  const re = /##\s*Seite\s+(\d+)/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const page = parseInt(m[1], 10);
    markers.push({ page, index: m.index });
  }

  return markers;
}

/**
 * Create overlap between sentence chunks
 * Returns the last N sentences that fit within targetOverlapChars
 */
export function createSentenceOverlap(
  sentences: SentenceSegment[],
  targetOverlapChars: number
): SentenceOverlap {
  if (!sentences || sentences.length === 0) {
    return { overlapText: '', numSentences: 0 };
  }

  let overlapText = '';
  let numSentences = 0;

  // Work backwards from the end
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].s;
    const potentialOverlap = sentence + (overlapText ? ' ' + overlapText : '');

    if (potentialOverlap.length <= targetOverlapChars) {
      overlapText = potentialOverlap;
      numSentences++;
    } else {
      break;
    }
  }

  return { overlapText, numSentences };
}

/**
 * Resolve page number for a given offset in text
 */
export function resolvePageNumberForOffset(
  markers: PageMarker[],
  defaultPage: number | null,
  offset: number
): number | null {
  if (!markers || markers.length === 0) return defaultPage;

  // Find the last marker before or at this offset
  for (let i = markers.length - 1; i >= 0; i--) {
    if (markers[i].index <= offset) {
      return markers[i].page;
    }
  }

  return defaultPage;
}
