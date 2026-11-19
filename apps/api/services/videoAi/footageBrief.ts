/**
 * Renders the analysed footage as the text the model reads: one line per unit
 * with id, time, following pause and quality marks, then the take groups.
 *
 * The format is the one measured in the spike (2026-11-10, section 5); ids are
 * the only handle the model has, so every line starts with one.
 */
import { type QualityRange } from './ffmpegAnalysis.js';
import { type TakeGroup } from './takeGroups.js';
import { type TranscriptUnit } from './transcriptUnits.js';

export interface BriefClip {
  id: string;
  role: 'footage' | 'broll';
  duration: number;
  quality: readonly QualityRange[];
}

/** Pauses shorter than this are not worth a mention. */
const MENTION_PAUSE_SECONDS = 0.5;

export function renderFootageBrief(
  clips: readonly BriefClip[],
  units: readonly TranscriptUnit[],
  takes: readonly TakeGroup[]
): string {
  const lines: string[] = [];
  for (const clip of clips.filter((c) => c.role === 'footage')) {
    lines.push(`## Clip ${clip.id} (${clip.duration.toFixed(0)} s)`);
    for (const unit of units.filter((u) => u.clipId === clip.id)) {
      const marks = qualityMarks(unit, clip.quality);
      const pause =
        unit.pauseAfter !== null && unit.pauseAfter >= MENTION_PAUSE_SECONDS
          ? ` (Pause danach ${unit.pauseAfter.toFixed(1)} s)`
          : '';
      lines.push(
        `${unit.id} [${unit.start.toFixed(1)}–${unit.end.toFixed(1)} s] „${unit.text}“${pause}` +
          (marks.length > 0 ? ` [${marks.join(', ')}]` : '')
      );
    }
    lines.push('');
  }

  if (takes.length > 0) {
    lines.push('## Mögliche Takes (mehrere Anläufe derselben Aussage)');
    for (const t of takes) lines.push(`- ${t.unitIds.join(', ')} → Vorschlag ${t.preferred}`);
  }
  return lines.join('\n').trim();
}

/** A mark when at least half of the unit falls into a flagged range. */
function qualityMarks(unit: TranscriptUnit, ranges: readonly QualityRange[]): string[] {
  const length = Math.max(0.01, unit.end - unit.start);
  const marks = new Set<string>();
  for (const r of ranges) {
    const covered = Math.min(unit.end, r.end) - Math.max(unit.start, r.start);
    if (covered / length >= 0.5) marks.add(r.flag);
  }
  return [...marks];
}
