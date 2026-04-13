import { parseSubtitleBlocks } from '../../subtitler/utils/subtitleSegmentUtils';

import type { SubtitleChunk, SubtitleTranscript } from '../types/subtitle';

export function segmentsToTranscript(subtitlesText: string, language = 'de'): SubtitleTranscript {
  const segments = parseSubtitleBlocks(subtitlesText);
  const chunks: SubtitleChunk[] = segments.map((s) => ({
    id: String(s.id),
    text: s.text,
    timestamp: [s.startTime, s.endTime] as [number, number],
  }));
  const totalDuration = chunks.length > 0 ? chunks[chunks.length - 1].timestamp[1] : 0;
  return { text: chunks.map((c) => c.text).join(' '), chunks, language, duration: totalDuration };
}
