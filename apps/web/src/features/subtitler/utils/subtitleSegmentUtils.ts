/**
 * Subtitle block parse/format for the web subtitler.
 *
 * Thin wrappers over @gruenerator/shared/subtitle-editor — the single
 * source of truth for the wire format "MM:SS.F - MM:SS.F\nText\n\n…".
 * Keeping the web-local names avoids churn at the call sites
 * (SubtitlerPage, SubtitlerBetaPage, SubtitleEditor, segmentsToTranscript).
 */

import { parseSubtitlesText, formatSubtitlesToText } from '@gruenerator/shared';

import type { SubtitleSegment } from '../types';

export function parseSubtitleBlocks(subtitles: string): SubtitleSegment[] {
  return parseSubtitlesText(subtitles);
}

export function formatSubtitleBlocks(segments: SubtitleSegment[]): string {
  return formatSubtitlesToText(segments);
}
