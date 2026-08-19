/**
 * Jaccard similarity, the one copy.
 *
 * Two places in the chat stack ran their own identical implementation. They
 * stay separate CALLERS on purpose, because what they feed it is not the same
 * thing and neither threshold transfers to the other:
 *
 * - `agenticLoop/loopGuards.ts` compares the **word tokens of a tool input**, to
 *   catch a re-search that asks what the turn already asked. Queries are short,
 *   so a pure narrowing ("Vermögensteuer Grüne" vs. "Vermögensteuer Grüne
 *   Abschaffung") scores low here and needs the separate containment check that
 *   lives next to that call site.
 * - `services/monitor/research/researchOrchestrator.ts` compares **word 3-shingles of a source's
 *   text** (first 4000 chars), to collapse one document returned twice. Its 0.4
 *   threshold was measured against 26 real sources; containment would be wrong
 *   here, since a four-word snippet has three shingles and is trivially
 *   contained in any long article on the same topic.
 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}
