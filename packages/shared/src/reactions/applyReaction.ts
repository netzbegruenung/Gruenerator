import { type ReactionSummary } from '@gruenerator/contracts';

/**
 * Applies the viewer's own reaction change to a summary list. Idempotent: a
 * change towards the state the viewer is already in returns the list unchanged.
 */
export function applyReaction(
  summaries: ReactionSummary[],
  emoji: string,
  on: boolean
): ReactionSummary[] {
  const existing = summaries.find((s) => s.emoji === emoji);
  if ((existing?.reacted ?? false) === on) return summaries;

  if (on) {
    if (!existing) return [...summaries, { emoji, count: 1, reacted: true }];
    return summaries.map((s) => (s === existing ? { ...s, count: s.count + 1, reacted: true } : s));
  }

  return summaries.flatMap((s) => {
    if (s !== existing) return [s];
    return s.count > 1 ? [{ ...s, count: s.count - 1, reacted: false }] : [];
  });
}
