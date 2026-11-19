/**
 * What the contact sheets say, reduced to what the cut needs. Deterministic:
 * the model already read the frames once; a second model call to turn "the
 * person stands left" into a crop would only add a way to get it wrong.
 */
import { type VideoAiFraming } from '@gruenerator/contracts';

import { type FrameCell } from './describeFrames.js';
import { type TranscriptUnit } from './transcriptUnits.js';

/** Cells this close to a unit still describe it (a shot rarely changes mid-breath). */
const NEAR_SECONDS = 1.5;

/** Where the person stands while the unit is spoken; null when nobody is seen. */
export function framingFor(
  unit: Pick<TranscriptUnit, 'start' | 'end'>,
  cells: readonly FrameCell[]
): VideoAiFraming | null {
  let near = cells.filter(
    (c) => c.t >= unit.start - NEAR_SECONDS && c.t <= unit.end + NEAR_SECONDS
  );
  if (near.length === 0 && cells.length > 0) {
    const mid = (unit.start + unit.end) / 2;
    near = [cells.reduce((a, b) => (Math.abs(b.t - mid) < Math.abs(a.t - mid) ? b : a))];
  }
  const counts = new Map<VideoAiFraming, number>();
  for (const c of near) {
    if (c.position !== 'keine') counts.set(c.position, (counts.get(c.position) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  // Ties go to the middle: the safe crop when the person moves.
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] === 'mitte' ? -1 : b[0] === 'mitte' ? 1 : 0)
  )[0][0];
}

/** Most frames carry burned-in text: the footage is already captioned. */
export function hasBurnedInCaptions(cells: readonly FrameCell[]): boolean {
  if (cells.length === 0) return false;
  const withText = cells.filter((c) => c.text_im_bild.trim().length > 0).length;
  return withText / cells.length > 0.5;
}

/** A b-roll clip in one line for the design stage: distinct frame descriptions. */
export function clipSummary(cells: readonly FrameCell[], maxParts = 4): string {
  const parts: string[] = [];
  for (const c of cells) {
    const d = c.beschreibung.trim();
    if (d && !parts.includes(d)) parts.push(d);
    if (parts.length >= maxParts) break;
  }
  return parts.join('; ');
}
