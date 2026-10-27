import { NOTEBOOK_SOURCE_REFS_MAX } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const { NO_NOTEBOOK_SOURCES, mergeThreadNotebookSources, sameThreadNotebookSources } =
  await import('./threadNotebookSources.js');
const { getThreadNotebookSources, setThreadNotebookSources } =
  await import('./threadPersistenceService.js');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const userDoc = (n: number, notebookId: string | null = null) => ({
  documentId: uuid(n),
  notebookId,
});
const sysDoc = (url: string) => ({ collectionId: 'bundestag-notebook', sourceUrl: url });

describe('mergeThreadNotebookSources', () => {
  it('carries earlier refs into a turn that hands over nothing', () => {
    const stored = [userDoc(1), sysDoc('https://a')];
    expect(mergeThreadNotebookSources(stored, NO_NOTEBOOK_SOURCES)).toEqual(stored);
  });

  it('puts this turn first and collapses a re-pick (newest access path wins)', () => {
    const stored = [sysDoc('https://a'), userDoc(1, 'nb-old')];
    const merged = mergeThreadNotebookSources(stored, [userDoc(1, 'nb-new')]);
    expect(merged).toEqual([userDoc(1, 'nb-new'), sysDoc('https://a')]);
  });

  it('drops the oldest refs past the cap', () => {
    const stored = Array.from({ length: NOTEBOOK_SOURCE_REFS_MAX }, (_, i) => userDoc(i + 1));
    const merged = mergeThreadNotebookSources(stored, [sysDoc('https://new')]);
    expect(merged).toHaveLength(NOTEBOOK_SOURCE_REFS_MAX);
    expect(merged[0]).toEqual(sysDoc('https://new'));
    expect(merged.at(-1)).toEqual(userDoc(NOTEBOOK_SOURCE_REFS_MAX - 1));
  });
});

describe('sameThreadNotebookSources', () => {
  it('compares identity, access path and order', () => {
    const a = [userDoc(1, 'nb'), sysDoc('https://a')];
    expect(sameThreadNotebookSources(a, [userDoc(1, 'nb'), sysDoc('https://a')])).toBe(true);
    expect(sameThreadNotebookSources(a, [userDoc(1, 'other'), sysDoc('https://a')])).toBe(false);
    expect(sameThreadNotebookSources(a, [sysDoc('https://a'), userDoc(1, 'nb')])).toBe(false);
  });
});

describe('thread storage', () => {
  beforeEach(() => query.mockReset());

  it('reads only the owner’s live thread', async () => {
    query.mockResolvedValue([{ notebook_source_refs: [userDoc(1)] }]);
    expect(await getThreadNotebookSources('t1', 'u1')).toEqual([userDoc(1)]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/user_id = \$2/);
    expect(sql).toMatch(/deleted_at IS NULL/);
    expect(params).toEqual(['t1', 'u1']);
  });

  it('treats an empty or malformed column as no refs', async () => {
    query.mockResolvedValueOnce([{ notebook_source_refs: null }]);
    expect(await getThreadNotebookSources('t1', 'u1')).toEqual(NO_NOTEBOOK_SOURCES);
    query.mockResolvedValueOnce([{ notebook_source_refs: [{ documentId: 'not-a-uuid' }] }]);
    expect(await getThreadNotebookSources('t1', 'u1')).toEqual(NO_NOTEBOOK_SOURCES);
    query.mockResolvedValueOnce([{ notebook_source_refs: '{not json' }]);
    expect(await getThreadNotebookSources('t1', 'u1')).toEqual(NO_NOTEBOOK_SOURCES);
  });

  it('stores refs owner-scoped and clears the column when nothing is left', async () => {
    query.mockResolvedValue([]);
    await setThreadNotebookSources('t1', 'u1', [userDoc(1)]);
    expect(query.mock.calls[0][1]).toEqual([JSON.stringify([userDoc(1)]), 't1', 'u1']);
    expect(query.mock.calls[0][0]).toMatch(/user_id = \$3/);

    await setThreadNotebookSources('t1', 'u1', NO_NOTEBOOK_SOURCES);
    expect(query.mock.calls[1][1]).toEqual([null, 't1', 'u1']);
  });
});
