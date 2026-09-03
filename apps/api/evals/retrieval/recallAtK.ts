/**
 * Pure recall arithmetic for the ANN-vs-exact check (`annRecallCheck.ts`):
 * how many of the approximate (HNSW) result IDs also appear in the exact
 * result set, out of the exact set's size. Factored out so it can be unit
 * tested without a live Qdrant instance.
 */
export function recallAtK(
  approxIds: string[],
  exactIds: string[]
): { overlap: number; total: number } {
  const exactSet = new Set(exactIds);
  const overlap = approxIds.filter((id) => exactSet.has(id)).length;
  return { overlap, total: exactSet.size };
}
