/**
 * Manual Subtitle Generator Service
 *
 * Generates 2-second intelligent subtitle segments from word timestamps
 * using punctuation detection and timing rules for optimal readability.
 * Does not use AI - purely algorithmic approach.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('manualSubtitle');

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface ManualSegmentCandidate {
  start: number;
  end: number;
  text: string;
  duration: number;
  reason: string;
}

interface WordPosition {
  wordIndex: number;
  textStart: number;
  textEnd: number;
  actualText: string;
}

interface CurrentSegment {
  words: string[];
  wordIndices: number[];
  start: number;
  end: number;
}

interface SmartBreakResult {
  shouldBreak: boolean;
  reason: string;
}

interface PunctuationResult {
  hasStrong: boolean;
  hasWeak: boolean;
  cleanWord: string;
}

const BREAK_WORDS = new Set([
  'der',
  'die',
  'das',
  'den',
  'dem',
  'des',
  'ein',
  'eine',
  'einen',
  'einem',
  'einer',
  'eines',
  'von',
  'zu',
  'mit',
  'bei',
  'nach',
  'vor',
  'über',
  'unter',
  'durch',
  'für',
  'ohne',
  'gegen',
  'und',
  'oder',
  'aber',
  'doch',
  'jedoch',
  'sowie',
  'als',
  'wie',
  'wenn',
  'weil',
  'dass',
  'da',
]);

const CONFIG = {
  targetDuration: 1.8,
  maxDuration: 2.5,
  minDuration: 1.0,
  minDurationPunctuation: 1.0,
  strongPunctuation: ['.', '!', '?'],
  weakPunctuation: [',', ';', ':'],
  maxWordsPerSegment: 4,
  longWordThreshold: 15,
} as const;

function detectPunctuation(word: string): PunctuationResult {
  const cleanWord = word.trim();
  const lastChar = cleanWord.slice(-1);

  return {
    hasStrong: (CONFIG.strongPunctuation as readonly string[]).includes(lastChar),
    hasWeak: (CONFIG.weakPunctuation as readonly string[]).includes(lastChar),
    cleanWord,
  };
}

function formatTime(timeInSeconds: number): string {
  const minutes = Math.floor(timeInSeconds / 60);
  const wholeSeconds = Math.floor(timeInSeconds % 60);
  const fractionalSecond = Math.floor((timeInSeconds % 1) * 10);
  return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}.${fractionalSecond}`;
}

const MIN_CUE_DURATION = 0.05;

/**
 * Repair degenerate word timings from transcription providers instead of
 * aborting. faster-whisper / Voxtral routinely emit a leading cue with
 * start=0,end=0 (a zero-duration token at audio onset), which the old strict
 * validation rejected — killing the whole job even though the grouping below
 * already clamps each cue to minDuration and to the next word's start.
 *
 * Drops only structurally unusable entries (non-string word, non-finite
 * timing); throws only when nothing usable remains (genuinely silent/empty
 * audio).
 */
function sanitizeWordTimestamps(words: WordTimestamp[]): WordTimestamp[] {
  if (!Array.isArray(words)) {
    throw new Error('Word timestamps must be an array');
  }

  const cleaned: WordTimestamp[] = [];
  let prevStart = 0;

  for (const word of words) {
    if (
      !word ||
      typeof word.word !== 'string' ||
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end)
    ) {
      continue;
    }

    // Clamp negatives and keep starts monotonically non-decreasing.
    const start = Math.max(0, word.start, prevStart);
    // Repair zero/negative-duration cues with a small floor; the grouping step
    // re-clamps the end to the next word's start, so the exact value is moot.
    const end = word.end > start ? word.end : start + MIN_CUE_DURATION;

    cleaned.push({ word: word.word, start, end });
    prevStart = start;
  }

  if (cleaned.length === 0) {
    throw new Error('No usable word timestamps after sanitization (empty or silent audio?)');
  }

  return cleaned;
}

function findSmartBreakPoint(
  currentSegment: CurrentSegment,
  currentWordIndex: number,
  words: WordTimestamp[],
  currentDuration: number
): SmartBreakResult {
  const lookaheadWords = 3;
  const currentWord = words[currentWordIndex];

  const currentWordClean = currentWord.word.toLowerCase().replace(/[.!?,:;""''()[\]{}]/g, '');
  if (BREAK_WORDS.has(currentWordClean)) {
    return {
      shouldBreak: true,
      reason: `smart break (after "${currentWordClean}")`,
    };
  }

  for (let i = 1; i <= lookaheadWords && currentWordIndex + i < words.length; i++) {
    const futureWord = words[currentWordIndex + i];
    const futureWordClean = futureWord.word.toLowerCase().replace(/[.!?,:;""''()[\]{}]/g, '');
    const futureDuration = futureWord.end - currentSegment.start;

    if (BREAK_WORDS.has(futureWordClean) && futureDuration <= CONFIG.maxDuration) {
      return {
        shouldBreak: false,
        reason: `continuing to break word "${futureWordClean}"`,
      };
    }

    if (futureDuration > CONFIG.maxDuration) {
      break;
    }
  }

  if (currentWordIndex > 0) {
    const prevWord = words[currentWordIndex - 1];
    const wordGap = currentWord.start - prevWord.end;

    if (wordGap > 0.1) {
      return {
        shouldBreak: true,
        reason: `smart break (natural pause: ${wordGap.toFixed(1)}s)`,
      };
    }
  }

  if (currentDuration >= CONFIG.targetDuration * 0.85) {
    return {
      shouldBreak: true,
      reason: 'smart break (target duration reached)',
    };
  }

  return {
    shouldBreak: false,
    reason: 'continuing (no natural break found yet)',
  };
}

function applyElasticTiming(segments: ManualSegmentCandidate[]): ManualSegmentCandidate[] {
  if (segments.length === 0) return segments;

  const elasticSegments = [...segments];
  const maxGapToFill = 0.6;

  for (let i = 0; i < elasticSegments.length - 1; i++) {
    const currentSegment = elasticSegments[i];
    const nextSegment = elasticSegments[i + 1];

    const gap = nextSegment.start - currentSegment.end;

    if (gap > 0 && gap < maxGapToFill) {
      const originalEnd = currentSegment.end;
      currentSegment.end = Math.max(nextSegment.start - 0.1, originalEnd);
      currentSegment.duration = currentSegment.end - currentSegment.start;
    }
  }

  return elasticSegments;
}

function groupWordsIntoSegments(
  rawWords: WordTimestamp[],
  fullText: string
): ManualSegmentCandidate[] {
  const words = sanitizeWordTimestamps(rawWords);

  const segments: ManualSegmentCandidate[] = [];
  let currentSegment: CurrentSegment = {
    words: [],
    wordIndices: [],
    start: words[0].start,
    end: words[0].start,
  };

  log.debug(`Processing ${words.length} words`);

  let textPosition = 0;
  const wordPositions: WordPosition[] = words
    .map((word, index) => {
      const cleanWord = word.word.replace(/[.!?,:;""''()[\]{}]/g, '');

      const wordStart = fullText.toLowerCase().indexOf(cleanWord.toLowerCase(), textPosition);
      if (wordStart !== -1) {
        let wordEnd = wordStart + cleanWord.length;
        while (wordEnd < fullText.length && /[.!?,:;""''()[\]{}]/.test(fullText[wordEnd])) {
          wordEnd++;
        }
        textPosition = wordEnd;
        while (textPosition < fullText.length && /\s/.test(fullText[textPosition])) {
          textPosition++;
        }

        return {
          wordIndex: index,
          textStart: wordStart,
          textEnd: wordEnd,
          actualText: fullText.slice(wordStart, wordEnd),
        };
      }
      return null;
    })
    .filter((pos): pos is WordPosition => pos !== null);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWordLength = word.word.replace(/[.!?,:;""''()[\]{}]/g, '').length;
    const isLongWord = cleanWordLength >= CONFIG.longWordThreshold;

    if (isLongWord && currentSegment.words.length > 0) {
      const firstWordIndex = currentSegment.wordIndices[0];
      const lastWordIndex = currentSegment.wordIndices[currentSegment.wordIndices.length - 1];
      const firstWordPos = wordPositions.find((pos) => pos.wordIndex === firstWordIndex);
      const lastWordPos = wordPositions.find((pos) => pos.wordIndex === lastWordIndex);

      let segmentText = '';
      if (firstWordPos && lastWordPos) {
        segmentText = fullText.slice(firstWordPos.textStart, lastWordPos.textEnd).trim();
      } else {
        segmentText = currentSegment.words.join(' ').trim();
      }

      segments.push({
        start: currentSegment.start,
        end: words[i - 1].end,
        text: segmentText,
        duration: words[i - 1].end - currentSegment.start,
        reason: 'before long word',
      });

      currentSegment = {
        words: [],
        wordIndices: [],
        start: word.start,
        end: word.start,
      };
    }

    currentSegment.words.push(word.word);
    currentSegment.wordIndices.push(i);

    const nextWord = i + 1 < words.length ? words[i + 1] : null;
    const maxAllowedEnd = nextWord ? nextWord.start : word.end + 5.0;

    let potentialEnd = word.end;

    if (potentialEnd - currentSegment.start < CONFIG.minDuration) {
      potentialEnd = currentSegment.start + CONFIG.minDuration;
    }

    currentSegment.end = Math.min(potentialEnd, maxAllowedEnd);

    const potentialDuration = currentSegment.end - currentSegment.start;

    let hasPunctuationAfter = false;
    let punctuationType = '';

    const wordPos = wordPositions.find((pos) => pos.wordIndex === i);
    if (wordPos) {
      if (/[.!?]$/.test(wordPos.actualText)) {
        hasPunctuationAfter = true;
        punctuationType = 'strong';
      } else if (/[,;:]$/.test(wordPos.actualText)) {
        hasPunctuationAfter = true;
        punctuationType = 'weak';
      }
    }

    if (!hasPunctuationAfter) {
      const wordPunctuation = detectPunctuation(word.word);
      if (wordPunctuation.hasStrong || wordPunctuation.hasWeak) {
        hasPunctuationAfter = true;
        punctuationType = wordPunctuation.hasStrong ? 'strong' : 'weak';
      }
    }

    let shouldEndSegment = false;
    let reason = '';

    if (isLongWord) {
      shouldEndSegment = true;
      reason = 'long word';
    } else if (currentSegment.words.length >= CONFIG.maxWordsPerSegment) {
      shouldEndSegment = true;
      reason = 'max words';
    } else if (hasPunctuationAfter && punctuationType === 'strong') {
      shouldEndSegment = true;
      reason = 'strong punctuation';
    } else if (
      hasPunctuationAfter &&
      punctuationType === 'weak' &&
      potentialDuration >= CONFIG.minDurationPunctuation
    ) {
      shouldEndSegment = true;
      reason = 'weak punctuation';
    } else if (potentialDuration >= CONFIG.targetDuration) {
      const smartBreakResult = findSmartBreakPoint(currentSegment, i, words, potentialDuration);
      if (smartBreakResult.shouldBreak) {
        shouldEndSegment = true;
        reason = smartBreakResult.reason;
      }
    } else if (potentialDuration >= CONFIG.maxDuration) {
      shouldEndSegment = true;
      reason = 'max duration (forced)';
    }

    if (i === words.length - 1) {
      shouldEndSegment = true;
      reason = 'last word';
    }

    if (shouldEndSegment) {
      let segmentText = '';
      if (currentSegment.wordIndices.length > 0) {
        const firstWordIndex = currentSegment.wordIndices[0];
        const lastWordIndex = currentSegment.wordIndices[currentSegment.wordIndices.length - 1];

        const firstWordPos = wordPositions.find((pos) => pos.wordIndex === firstWordIndex);
        const lastWordPos = wordPositions.find((pos) => pos.wordIndex === lastWordIndex);

        if (firstWordPos && lastWordPos) {
          segmentText = fullText.slice(firstWordPos.textStart, lastWordPos.textEnd).trim();
        } else {
          segmentText = currentSegment.words.join(' ').trim();
          log.warn('Position mapping failed, using word join fallback');
        }
      } else {
        segmentText = currentSegment.words.join(' ').trim();
      }

      const duration = currentSegment.end - currentSegment.start;

      segments.push({
        start: currentSegment.start,
        end: currentSegment.end,
        text: segmentText,
        duration,
        reason,
      });

      if (i < words.length - 1) {
        const nextWordObj = words[i + 1];
        currentSegment = {
          words: [],
          wordIndices: [],
          start: nextWordObj.start,
          end: nextWordObj.start,
        };
      }
    }
  }

  const finalSegments = applyElasticTiming(segments);
  return finalSegments;
}

function formatSegmentsToSubtitleText(segments: ManualSegmentCandidate[]): string {
  return segments
    .map((segment) => {
      const startTime = formatTime(segment.start);
      const endTime = formatTime(segment.end);
      return `${startTime} - ${endTime}\n${segment.text}`;
    })
    .join('\n\n');
}

async function generateManualSubtitles(fullText: string, words: WordTimestamp[]): Promise<string> {
  try {
    const segments = groupWordsIntoSegments(words, fullText);
    const subtitleText = formatSegmentsToSubtitleText(segments);

    const avgDuration =
      segments.length > 0
        ? (segments.reduce((sum, s) => sum + s.duration, 0) / segments.length).toFixed(1)
        : '0';
    log.info(`Generated ${segments.length} segments, avg duration: ${avgDuration}s`);

    return subtitleText;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Error generating manual subtitles: ${message}`);
    throw new Error(`Manual subtitle generation failed: ${message}`);
  }
}

export {
  generateManualSubtitles,
  CONFIG,
  detectPunctuation,
  formatTime,
  groupWordsIntoSegments,
  formatSegmentsToSubtitleText,
  sanitizeWordTimestamps,
  findSmartBreakPoint,
  applyElasticTiming,
};

export type { WordTimestamp, ManualSegmentCandidate, PunctuationResult, SmartBreakResult };
