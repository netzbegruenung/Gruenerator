import { describe, it, expect, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => [{ title: 'Antrag Radverkehr' }]));
vi.mock('../../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('./pendingActionStore.js', () => ({ pendingActionStore: { store: vi.fn() } }));

const { buildPendingAction, emitConfirmAction, MIN_MODIFY_DOC_CONTENT_CHARS } =
  await import('./confirmActionService.js');

const base = {
  threadId: 'thread-1',
  userId: 'user-1',
  searchQuery: null,
  boardIds: undefined,
  documentSubtype: null,
};

const document = (chars: number): string => 'Absatz mit echtem Inhalt. '.repeat(chars);

describe('buildPendingAction — modify_doc content floor', () => {
  it('carries a full document through as the new content', () => {
    const fullText = document(40);
    const action = buildPendingAction({
      ...base,
      intent: 'modify_doc',
      fullText,
      docMentionIds: ['doc-1'],
    });

    expect(action?.type).toBe('modify_doc');
    expect(action).toMatchObject({ payload: { docId: 'doc-1', newContent: fullText } });
  });

  it('suppresses the action when the answer is a confirmation sentence', () => {
    // The exact failure mode: with ARTEFACT_CONFIRM_ONLY on this intent the
    // model answers in one line, and that line would replace the document.
    const action = buildPendingAction({
      ...base,
      intent: 'modify_doc',
      fullText: 'Das Ziel wurde auf 100 Teilnehmende angepasst und „Entwurf v2" ergänzt.',
      docMentionIds: ['doc-1'],
    });

    expect(action).toBeNull();
  });

  it('measures the floor on trimmed text', () => {
    const action = buildPendingAction({
      ...base,
      intent: 'modify_doc',
      fullText: `${' '.repeat(500)}Erledigt.${' '.repeat(500)}`,
      docMentionIds: ['doc-1'],
    });

    expect(action).toBeNull();
  });

  it('leaves save_as_doc untouched — its content is regenerated, not the answer', () => {
    const action = buildPendingAction({
      ...base,
      intent: 'save_as_doc',
      fullText: 'Ich lege das als Dokument an.',
      docMentionIds: undefined,
    });

    expect(action?.type).toBe('save_as_doc');
  });

  it('keeps the floor well below any real document', () => {
    expect(MIN_MODIFY_DOC_CONTENT_CHARS).toBeLessThan(1000);
  });
});

describe('emitConfirmAction — card metadata', () => {
  const emit = async () => {
    const send = vi.fn();
    await emitConfirmAction({
      sse: { send } as never,
      actualThreadId: 'thread-1',
      userId: 'user-1',
      fullText: document(40),
      finalState: { intent: 'modify_doc' } as never,
      classifiedState: { searchQuery: null, docMentionIds: ['doc-1'] } as never,
    });
    const payload = send.mock.calls.find(([event]) => event === 'confirm_action')?.[1] as {
      metadata: Array<{ key: string; value: string }>;
    };
    return payload.metadata;
  };

  it('names the document by title, not by its UUID (#4460)', async () => {
    expect(await emit()).toEqual([{ key: 'Dokument', value: 'Antrag Radverkehr' }]);
  });

  it('falls back to the id when the title lookup fails', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    expect(await emit()).toEqual([{ key: 'Dokument', value: 'doc-1' }]);
  });
});
