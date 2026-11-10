/**
 * Turns a cut (ordered units) into the output timeline: the source ranges to
 * play, back to back, and every kept word in output time.
 *
 * Inside a unit the cut tightens on its own: stutter repeats go (stutter.ts),
 * and a pause longer than MAX_KEPT_PAUSE splits the unit into two pieces with
 * the silence removed. Each piece gets PADDING of air around its words, but
 * never more than half the gap to a neighbouring word, so two pieces of the
 * same clip cannot overlap in the source.
 *
 * The editor compiles exactly these pieces; the feedback round maps a time in
 * the preview back through them (`outputToSource`).
 */
import { findStutterWords } from './stutter.js';
import { type TranscriptUnit, type TranscriptWord } from './transcriptUnits.js';

export const PADDING_SECONDS = 0.08;
export const MAX_KEPT_PAUSE_SECONDS = 0.35;

export interface TimelinePiece {
  /** Index into the EDL's `segments`. */
  segmentIndex: number;
  unitId: string;
  clipId: string;
  sourceStart: number;
  sourceEnd: number;
  outStart: number;
  outEnd: number;
}

export interface TimelineWord extends TranscriptWord {
  /** Output time; `start`/`end` stay in source time. */
  outStart: number;
  outEnd: number;
  segmentIndex: number;
}

export interface Timeline {
  pieces: TimelinePiece[];
  words: TimelineWord[];
  duration: number;
}

export interface TimelineInput {
  unitIds: readonly string[];
  units: ReadonlyMap<string, TranscriptUnit>;
  /** Source duration per clip, to clamp padding at the clip edges. */
  clipDurations: ReadonlyMap<string, number>;
}

export function buildTimeline({ unitIds, units, clipDurations }: TimelineInput): Timeline {
  const pieces: TimelinePiece[] = [];
  const words: TimelineWord[] = [];
  const clipWords = wordsByClip(units);
  let cursor = 0;

  unitIds.forEach((unitId, segmentIndex) => {
    const unit = units.get(unitId);
    if (!unit) throw new Error(`Unknown unit ${unitId}`);
    const clipEnd = clipDurations.get(unit.clipId) ?? Number.POSITIVE_INFINITY;

    for (const run of keptRuns(unit, clipWords.get(unit.clipId) ?? [])) {
      const before = run.prevEnd === null ? PADDING_SECONDS : (run.first.start - run.prevEnd) / 2;
      const after = run.nextStart === null ? PADDING_SECONDS : (run.nextStart - run.last.end) / 2;
      const sourceStart = Math.max(0, run.first.start - Math.min(PADDING_SECONDS, before));
      const sourceEnd = Math.min(clipEnd, run.last.end + Math.min(PADDING_SECONDS, after));
      const length = sourceEnd - sourceStart;

      pieces.push({
        segmentIndex,
        unitId,
        clipId: unit.clipId,
        sourceStart,
        sourceEnd,
        outStart: cursor,
        outEnd: cursor + length,
      });
      for (const w of run.words) {
        words.push({
          ...w,
          outStart: cursor + (w.start - sourceStart),
          outEnd: cursor + (w.end - sourceStart),
          segmentIndex,
        });
      }
      cursor += length;
    }
  });

  return { pieces, words, duration: cursor };
}

interface Run {
  words: TranscriptWord[];
  first: TranscriptWord;
  last: TranscriptWord;
  /** End of the word before in the clip (kept or not); null at the clip start. */
  prevEnd: number | null;
  nextStart: number | null;
}

/**
 * Every word of a clip in source order. Padding looks at the neighbour in the
 * clip, not in the unit: two adjacent sentences of one clip, cut back to back,
 * would otherwise both pad into the same gap and play a sliver twice.
 */
function wordsByClip(units: ReadonlyMap<string, TranscriptUnit>): Map<string, TranscriptWord[]> {
  const byClip = new Map<string, TranscriptWord[]>();
  for (const unit of units.values()) {
    byClip.set(unit.clipId, [...(byClip.get(unit.clipId) ?? []), ...unit.words]);
  }
  for (const list of byClip.values()) list.sort((a, b) => a.start - b.start);
  return byClip;
}

/** Contiguous kept words of a unit, split at drops and at long pauses. */
function keptRuns(unit: TranscriptUnit, clipWords: readonly TranscriptWord[]): Run[] {
  const drop = findStutterWords(unit.words);
  const runs: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];

  unit.words.forEach((w, i) => {
    if (drop.has(i)) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    const prev = current[current.length - 1];
    if (prev && w.start - prev.end > MAX_KEPT_PAUSE_SECONDS) {
      runs.push(current);
      current = [];
    }
    current.push(w);
  });
  if (current.length > 0) runs.push(current);

  return runs.map((run) => {
    const first = run[0];
    const last = run[run.length - 1];
    const firstIdx = clipWords.indexOf(first);
    const lastIdx = clipWords.indexOf(last);
    return {
      words: run,
      first,
      last,
      prevEnd: firstIdx > 0 ? clipWords[firstIdx - 1].end : null,
      nextStart:
        lastIdx >= 0 && lastIdx < clipWords.length - 1 ? clipWords[lastIdx + 1].start : null,
    };
  });
}

/** Maps a preview time back to the piece (and source time) under it. */
export function outputToSource(
  timeline: Timeline,
  t: number
): { piece: TimelinePiece; sourceTime: number } | null {
  const piece = timeline.pieces.find((p) => t >= p.outStart && t < p.outEnd);
  if (!piece) return null;
  return { piece, sourceTime: piece.sourceStart + (t - piece.outStart) };
}
