/**
 * Groups units that are attempts at the same statement, across all clips.
 *
 * These are hints, not decisions: the model gets the groups next to the
 * transcript and decides (spike 2026-11-10: with the groups implicit in the
 * text it already chose right, including a statement the speaker explicitly
 * withdrew). The fallback plan without a model takes `preferred` as is.
 *
 * Two units belong together when most words of the shorter one also occur in
 * the longer one. Overlap against the shorter side, not Jaccard: an aborted
 * attempt ("Wir haben deshalb im Stadtrat beantragt, dass") is a prefix of the
 * full sentence and must match it.
 */
import { normalizeToken, type TranscriptUnit } from './transcriptUnits.js';

export interface TakeGroup {
  /** Unit ids in spoken order (clip, then position). */
  unitIds: string[];
  /** Last attempt that is not aborted; the last one if all look aborted. */
  preferred: string;
}

const MIN_OVERLAP = 0.6;
/** Below this many distinct words, overlap is noise ("Okay, passt."). */
const MIN_WORDS = 3;

export function findTakeGroups(units: readonly TranscriptUnit[]): TakeGroup[] {
  const bags = units.map(
    (u) => new Set(u.words.map((w) => normalizeToken(w.word)).filter(Boolean))
  );
  const parent = units.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));

  for (let a = 0; a < units.length; a++) {
    for (let b = a + 1; b < units.length; b++) {
      if (overlap(bags[a], bags[b]) >= MIN_OVERLAP) parent[root(b)] = root(a);
    }
  }

  const members = new Map<number, number[]>();
  units.forEach((_, i) => {
    const r = root(i);
    members.set(r, [...(members.get(r) ?? []), i]);
  });

  const groups: TakeGroup[] = [];
  for (const idx of members.values()) {
    if (idx.length < 2) continue;
    const complete = idx.filter((i) => !looksAborted(units, i));
    const pick = complete.length > 0 ? complete[complete.length - 1] : idx[idx.length - 1];
    groups.push({ unitIds: idx.map((i) => units[i].id), preferred: units[pick].id });
  }
  return groups;
}

function overlap(a: Set<string>, b: Set<string>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < MIN_WORDS) return 0;
  let shared = 0;
  for (const w of small) if (large.has(w)) shared++;
  return shared / small.size;
}

/**
 * Aborted: no sentence punctuation at the end, or the next unit of the same
 * clip restarts with the same opening words. Punctuation alone misleads —
 * GreenPT sometimes closes an aborted sentence with a full stop.
 */
function looksAborted(units: readonly TranscriptUnit[], i: number): boolean {
  const unit = units[i];
  const lastWord = unit.words[unit.words.length - 1]?.word ?? '';
  if (!/[.?!…]$/.test(lastWord)) return true;
  const next = units[i + 1];
  if (!next || next.clipId !== unit.clipId) return false;
  const opening = (u: TranscriptUnit) =>
    u.words
      .slice(0, 2)
      .map((w) => normalizeToken(w.word))
      .join(' ');
  return unit.words.length >= 2 && opening(unit) === opening(next);
}
