import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({ getPostgresInstance: () => ({}) }));
vi.mock('../../services/explainables/createExplainable.js', () => ({ createExplainable: vi.fn() }));
vi.mock('../../services/explainables/explainableRepository.js', () => ({}));
vi.mock('../../services/explainables/explainableTrash.js', () => ({}));

const { citationsToSources, handleCreateFromMessage, SOURCE_MESSAGE_SQL } =
  await import('./explainablesContractRouter.js');

const MSG = '11111111-1111-4111-8111-111111111111';
const message = {
  id: MSG,
  thread_id: 'thread-1',
  content: 'Die Antwort [1].',
  tool_results: {
    citations: [
      { index: '1', document_title: 'Programm', source_url: 'https://example.org' },
      { index: '1', document_title: 'Programm (Chunk 2)' },
      { id: 2, title: 'Chat-Quelle', url: '' },
    ],
  },
};

function deps(
  found: typeof message | null,
  result: unknown = {
    ok: true,
    id: 'e1',
    slugSuffix: 'abcdef',
    title: 'T',
    url: '/erklaert/t-abcdef',
    imageCount: 1,
  }
) {
  return { loadMessage: vi.fn(async () => found), create: vi.fn(async () => result as never) };
}

describe('handleCreateFromMessage', () => {
  it('404 for a message the requester cannot use (foreign, not notebook, not complete)', async () => {
    const d = deps(null);
    const res = await handleCreateFromMessage('u1', MSG, 'de-DE', d);
    expect(res.status).toBe(404);
    expect(d.loadMessage).toHaveBeenCalledWith(MSG, 'u1');
    expect(d.create).not.toHaveBeenCalled();
  });

  it('404 for a non-uuid id without touching the database', async () => {
    const d = deps(message);
    expect((await handleCreateFromMessage('u1', 'nope', 'de-DE', d)).status).toBe(404);
    expect(d.loadMessage).not.toHaveBeenCalled();
  });

  it('the lookup is scoped to the requester and to complete notebook answers', () => {
    expect(SOURCE_MESSAGE_SQL).toContain('t.user_id = $2');
    expect(SOURCE_MESSAGE_SQL).toContain("t.thread_type = 'notebook'");
    expect(SOURCE_MESSAGE_SQL).toContain("m.status = 'complete'");
    expect(SOURCE_MESSAGE_SQL).toContain("m.role = 'assistant'");
    expect(SOURCE_MESSAGE_SQL).toContain('t.deleted_at IS NULL');
  });

  it('creates from the message content and its citations', async () => {
    const d = deps(message);
    const res = await handleCreateFromMessage('u1', MSG, 'de-AT', d);
    expect(res).toEqual({ status: 201, body: { id: 'e1', slugSuffix: 'abcdef', title: 'T' } });
    expect(d.create).toHaveBeenCalledWith({
      userId: 'u1',
      brief: 'Die Antwort [1].',
      sources: [
        { index: 1, title: 'Programm', url: 'https://example.org' },
        { index: 2, title: 'Chat-Quelle', url: null },
      ],
      threadId: 'thread-1',
      sourceMessageId: MSG,
      locale: 'de-AT',
    });
  });

  it.each([
    ['budget_exhausted', 429],
    ['budget_unavailable', 503],
    ['generation_failed', 500],
  ])('maps %s to %i', async (code, status) => {
    const d = deps(message, { ok: false, code, message: 'msg' });
    const res = await handleCreateFromMessage('u1', MSG, 'de-DE', d);
    expect(res).toEqual({ status, body: { error: 'msg' } });
  });
});

describe('citationsToSources', () => {
  it('tolerates junk', () => {
    expect(citationsToSources(null)).toEqual([]);
    expect(citationsToSources([null, { index: 'x' }, { id: 0 }])).toEqual([]);
  });
});
