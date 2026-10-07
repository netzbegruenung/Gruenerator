import { type CanvasAiSnapshot } from '@gruenerator/contracts';

/** Keep only ids the snapshot exposes, so the planner never sees an unknown target. */
export function knownSelectionIds(
  ids: string[],
  snapshot: Pick<CanvasAiSnapshot, 'elementsSummary' | 'textFields'>
): string[] {
  const known = new Set([
    ...snapshot.elementsSummary.map((e) => e.id),
    ...snapshot.textFields.map((f) => f.field),
  ]);
  return ids.filter((id) => known.has(id));
}
