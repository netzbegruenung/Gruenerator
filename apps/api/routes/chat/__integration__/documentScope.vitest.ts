/**
 * Document ids in the request body are authorized before they scope a search.
 *
 * The scoped document search runs without an owner filter (a shared notebook
 * holds other people's documents), so `buildStreamContext` is the trust
 * boundary for `documentIds` and `documentChatIds`. Asserted on the state the
 * turn hands to the answer path and on every document search the turn makes —
 * the real `authorizeDocumentScope` runs, only its storage is faked.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../services/ai/execution/index.js', async () => {
  const { executeProviderStub } = await import('./harness/providerStub.js');
  return { executeProvider: executeProviderStub };
});

const DOCS = vi.hoisted(() => ({
  own: 'a0000000-0000-4000-8000-0000000000a1',
  foreign: 'b0000000-0000-4000-8000-0000000000b1',
  shared: 'b0000000-0000-4000-8000-0000000000b2',
  sharedNotebook: 'd0000000-0000-4000-8000-0000000000d1',
}));
const searchedScopes = vi.hoisted(() => [] as string[][]);
// Above SMALL_DOC_THRESHOLD the owned text is not inlined — the "large" branch.
const fullText = vi.hoisted(() => ({ value: 'Kurzer Beschluss zum Radverkehr.' }));

// Only the queries the document paths ask; anything else still fails by name.
// The owner of `own` is the harness user (TEST_USER.id).
vi.mock('../../../database/services/PostgresService.js', async () => {
  const owners: Record<string, string> = {
    [DOCS.own]: '00000000-0000-4000-a000-000000000042',
    [DOCS.foreign]: '00000000-0000-4000-a000-000000000099',
    [DOCS.shared]: '00000000-0000-4000-a000-000000000099',
  };
  const rowsFor = (ids: string[]) =>
    ids
      .filter((id) => owners[id])
      .map((id) => ({ id, user_id: owners[id], title: `Dok ${id.slice(0, 4)}` }));
  return {
    getPostgresInstance: () => ({
      query: (sql: string, params: unknown[]) => {
        if (sql.includes('FROM documents WHERE id = ANY($1::uuid[])')) {
          return Promise.resolve(rowsFor(params[0] as string[]));
        }
        if (sql.includes('FROM documents WHERE id = $1')) {
          return Promise.resolve(rowsFor([params[0] as string]));
        }
        if (sql.includes('FROM documents WHERE user_id = $1 AND id = ANY($2)')) {
          return Promise.resolve(
            rowsFor(params[1] as string[]).filter((r) => r.user_id === params[0])
          );
        }
        throw new Error(`unexpected Postgres query: ${String(sql).slice(0, 300)}`);
      },
    }),
  };
});
vi.mock('../../../database/services/NotebookQdrantHelper.js', async (orig) => {
  const mod = (await orig()) as {
    NotebookQdrantHelper: { prototype: Record<string, unknown> };
  };
  const proto = mod.NotebookQdrantHelper.prototype;
  proto.getCollectionIdsForDocuments = (ids: string[]) =>
    Promise.resolve(
      new Map(ids.filter((id) => id === DOCS.shared).map((id) => [id, [DOCS.sharedNotebook]]))
    );
  proto.isDocumentInCollection = (nb: string, doc: string) =>
    Promise.resolve(nb === DOCS.sharedNotebook && doc === DOCS.shared);
  proto.getNotebookCollection = (nb: string) =>
    Promise.resolve(nb === DOCS.sharedNotebook ? { id: nb, name: 'Geteiltes Notebook' } : null);
  return mod;
});
vi.mock('../../notebook/notebookAccess.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  checkNotebookAccess: (nb: string) =>
    Promise.resolve(
      nb === DOCS.sharedNotebook
        ? { exists: true, isOwner: false, canRead: true, canEdit: false }
        : { exists: false, isOwner: false, canRead: false, canEdit: false }
    ),
}));
vi.mock('../../../services/document-services/DocumentSearchService/index.js', async (orig) => ({
  ...((await orig()) as Record<string, unknown>),
  getQdrantDocumentService: () => ({
    search: ({ filters }: { filters?: { documentIds?: string[] } }) => {
      searchedScopes.push([...(filters?.documentIds ?? [])]);
      return Promise.resolve({
        results: (filters?.documentIds ?? []).map((id) => ({
          document_id: id,
          title: 'Beschluss.pdf',
          relevant_content: 'Der Radverkehr wird ausgebaut.',
          similarity_score: 0.8,
        })),
      });
    },
    getMultipleDocumentsFullText: (_userId: string, ids: string[]) =>
      Promise.resolve({
        documents: ids.map((id) => ({
          id,
          fullText: fullText.value,
          totalCharsReconstructed: fullText.value.length,
        })),
        errors: [],
      }),
  }),
}));
vi.mock('../services/threadPersistenceService.js', async () => {
  return await import('./harness/fakeThreadStore.js');
});
vi.mock('../services/threadAccessService.js', async () => {
  const { threadAccessMock } = await import('./harness/mocks.js');
  return threadAccessMock();
});
vi.mock('../services/compactionService.js', async (orig) => {
  const { compactionMock } = await import('./harness/mocks.js');
  return compactionMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/attachmentPersistenceService.js', async (orig) => {
  const { attachmentPersistenceMock } = await import('./harness/mocks.js');
  return attachmentPersistenceMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pastChatRecallService.js', async (orig) => {
  const { pastChatRecallMock } = await import('./harness/mocks.js');
  return pastChatRecallMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/postResponseService.js', async (orig) => {
  const { postResponseMock } = await import('./harness/mocks.js');
  return postResponseMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/pipelineStateStore.js', async () => {
  const { pipelineStateStoreMock } = await import('./harness/mocks.js');
  return pipelineStateStoreMock();
});
vi.mock('../services/sharepicEditService.js', async (orig) => {
  const { sharepicEditMock } = await import('./harness/mocks.js');
  return sharepicEditMock((await orig()) as Record<string, unknown>);
});
vi.mock('../services/agenticLoop/agenticRespondService.js', async (orig) => {
  const { fakeStreamAgenticResponse } = await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    streamAgenticResponse: fakeStreamAgenticResponse,
  };
});
vi.mock('../services/responseStreamingService.js', async (orig) => {
  const { fakeResolveModel, fakeStreamForResolution, fakeStreamWithFallback } =
    await import('./harness/respondScript.js');
  return {
    ...((await orig()) as Record<string, unknown>),
    resolveModel: fakeResolveModel,
    streamForResolution: fakeStreamForResolution,
    streamWithFallback: fakeStreamWithFallback,
  };
});

const { useChatApp } = await import('./harness/suite.js');
const { userTurn } = await import('./harness/testApp.js');
const { runTurn } = await import('./harness/trace.js');
const { respond } = await import('./harness/respondScript.js');
const { threads, messagesOf } = await import('./harness/fakeThreadStore.js');

const suite = useChatApp();

const FACTUAL = 'Was ist die Position der Grünen zur Windkraft?';

function answeredState() {
  expect(respond.agenticCalls).toHaveLength(1);
  return respond.agenticCalls[0]!.finalState;
}

describe('document ids from the request body', () => {
  it('keeps owned and shared-notebook documents, drops a foreign one — @datei picks', async () => {
    searchedScopes.length = 0;
    await runTurn(suite.baseUrl(), {
      messages: [userTurn(FACTUAL)],
      documentIds: [DOCS.foreign, DOCS.own, DOCS.shared],
    });

    const state = answeredState();
    expect(state.documentIds).toEqual([DOCS.own, DOCS.shared]);
    // The reader of a shared source needs the notebook that grants it.
    expect(state.documentNotebookIds?.[DOCS.shared]).toBe(DOCS.sharedNotebook);
    for (const scope of searchedScopes) expect(scope).not.toContain(DOCS.foreign);
  });

  it('keeps a shared-notebook document beside a large own one', async () => {
    fullText.value = 'Langer Beschluss zum Radverkehr. '.repeat(200);
    try {
      await runTurn(suite.baseUrl(), {
        messages: [userTurn(FACTUAL)],
        documentIds: [DOCS.own, DOCS.shared],
      });
      expect(answeredState().documentIds).toEqual([DOCS.own, DOCS.shared]);
    } finally {
      fullText.value = 'Kurzer Beschluss zum Radverkehr.';
    }
  });

  it('never lets a foreign id reach the state — document chat', async () => {
    searchedScopes.length = 0;
    await runTurn(suite.baseUrl(), {
      messages: [userTurn(FACTUAL)],
      documentChatIds: [DOCS.foreign, DOCS.own],
    });

    const state = answeredState();
    expect(state.documentChatIds).toEqual([DOCS.own]);
    for (const scope of searchedScopes) expect(scope).not.toContain(DOCS.foreign);
  });

  it('carries @datei picks into a follow-up that sends none (#4861)', async () => {
    const first = await runTurn(suite.baseUrl(), {
      messages: [userTurn(FACTUAL)],
      documentIds: [DOCS.foreign, DOCS.own, DOCS.shared],
    });
    const threadId = first.trace.threadId!;
    // The pick turn reads them as `documentIds` only, not a second time.
    expect(answeredState().notebookSources).toEqual([]);
    expect(threads.get(threadId)?.notebookSources).toEqual([
      { documentId: DOCS.own, notebookId: null },
      { documentId: DOCS.shared, notebookId: DOCS.sharedNotebook },
    ]);
    // The chip a reload restores.
    expect(messagesOf(threadId).find((m) => m.role === 'user')?.metadata).toEqual({
      notebookSources: [
        { ref: { documentId: DOCS.own, notebookId: null }, title: `Dok ${DOCS.own.slice(0, 4)}` },
        {
          ref: { documentId: DOCS.shared, notebookId: DOCS.sharedNotebook },
          title: `Dok ${DOCS.shared.slice(0, 4)}`,
        },
      ],
    });

    respond.agenticCalls.length = 0;
    await runTurn(suite.baseUrl(), {
      messages: [userTurn('Und was steht darin zum Radverkehr?', 'm2')],
      threadId,
    });

    expect(answeredState().notebookSources).toEqual([
      expect.objectContaining({ kind: 'user', documentId: DOCS.own }),
      expect.objectContaining({ kind: 'user', documentId: DOCS.shared }),
    ]);
  });

  it('drops a list of only foreign ids entirely', async () => {
    await runTurn(suite.baseUrl(), {
      messages: [userTurn(FACTUAL)],
      documentIds: [DOCS.foreign],
    });

    expect(answeredState().documentIds ?? []).toEqual([]);
  });
});
