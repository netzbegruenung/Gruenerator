import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #5134: a save_as_doc document belongs to the turn's persisted message. When
 * the persist was kicked off before the document existed, the message carried
 * no `createdDocument` — the card vanished on reload and `read_artifact` on the
 * next turn found no document in the thread, so the model read a different one.
 */

const order: string[] = [];
const doc = { documentId: 'd1', title: 'Trinkbrunnen', subtype: 'antrag', url: '/docs/d1' };

const contributeDocumentToOpenTurn = vi.fn(async (_opts: unknown) => {
  order.push('contribute');
  return doc as typeof doc | null;
});
vi.mock('../services/intentExecutionService.js', () => ({
  contributeDocumentToOpenTurn: (opts: unknown) => contributeDocumentToOpenTurn(opts),
}));

const persistAssistantResponse = vi.fn(async (_p: { createdDocument?: unknown }) => {
  order.push('persist');
  return { ok: true };
});
vi.mock('../services/postResponseService.js', () => ({
  persistAssistantResponse: (p: { createdDocument?: unknown }) => persistAssistantResponse(p),
}));

vi.mock('../services/confirmActionService.js', () => ({ emitConfirmAction: vi.fn() }));
vi.mock('../services/createTurn.js', () => ({ buildCreateTurnContext: () => '' }));
vi.mock('../services/threadPersistenceService.js', () => ({
  discardPendingAssistantIfEmpty: vi.fn(async () => {}),
}));

const { runPersistStage } = await import('./persistStage.js');

function run(intent: string) {
  const state = { intent, startTime: Date.now(), citations: [] };
  return runPersistStage({
    sse: { send: vi.fn(), end: vi.fn() },
    req: {},
    finalState: state,
    classifiedState: state,
    cleanupPending: async () => {},
    fullText: 'Antrag auf weitere Trinkbrunnen …',
    actualThreadId: 't1',
    userId: 'u1',
    requestId: 'r1',
    validMessages: [],
    lastUserMessage: { role: 'user', content: 'Erstelle ein Dokument: Antrag Trinkbrunnen' },
    processedMeta: {},
    isNewThread: false,
    memoryRetrieveTimeMs: 0,
    generatedImage: null,
    sharepicVariants: [],
    createdDocument: null,
    createdBoard: null,
    agenticSteps: undefined,
    langfuseTraceId: undefined,
    pendingId: null,
    userMessageId: null,
    agentId: undefined,
    rawDocMentionIds: undefined,
    rawBoardIds: undefined,
  } as never);
}

beforeEach(() => {
  order.length = 0;
  contributeDocumentToOpenTurn.mockClear();
  persistAssistantResponse.mockClear();
});

describe('persist stage — save_as_doc', () => {
  it('persists the contributed document as the turn’s createdDocument', async () => {
    await run('save_as_doc');

    expect(order).toEqual(['contribute', 'persist']);
    expect(persistAssistantResponse.mock.calls[0]![0].createdDocument).toBe(doc);
  });

  it('persists the turn without a document when the contribution fails', async () => {
    contributeDocumentToOpenTurn.mockResolvedValueOnce(null);

    await run('save_as_doc');

    expect(persistAssistantResponse).toHaveBeenCalledTimes(1);
    expect(persistAssistantResponse.mock.calls[0]![0].createdDocument).toBeNull();
  });

  it('does not create a document for other intents', async () => {
    await run('universal');

    expect(contributeDocumentToOpenTurn).not.toHaveBeenCalled();
    expect(persistAssistantResponse).toHaveBeenCalledTimes(1);
  });
});
