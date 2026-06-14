/**
 * Subtitle block parse/format for the web subtitler.
 *
 * Thin wrappers over @gruenerator/shared/subtitle-editor — the single
 * source of truth for the wire format "MM:SS.F - MM:SS.F\nText\n\n…".
 * Keeping the web-local names avoids churn at the call sites
 * (SubtitlerPage, SubtitlerBetaPage, SubtitleEditor, segmentsToTranscript).
 */

import { parseStoredSubtitles, formatSubtitlesToText } from '@gruenerator/shared';

import type { SubtitleSegment } from '../types';

export function parseSubtitleBlocks(subtitles: string): SubtitleSegment[] {
  // Tolerant parse: the subtitles column holds either the text wire format
  // or a JSON segment array (auto-saved projects, incl. chat uploads).
  // parseSubtitlesText alone returned [] for JSON projects, so the studio
  // opened them with an empty transcript.
  return parseStoredSubtitles(subtitles).segments;
}

export function formatSubtitleBlocks(segments: SubtitleSegment[]): string {
  return formatSubtitlesToText(segments);
}
