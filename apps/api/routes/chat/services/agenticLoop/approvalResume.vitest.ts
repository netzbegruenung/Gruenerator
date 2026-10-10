import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
const claim = vi.fn();
vi.mock('../toolApprovalStateStore.js', () => ({
  toolApprovalStateStore: {
    get: (...a: unknown[]) => get(...a),
    claim: (...a: unknown[]) => claim(...a),
    releaseClaim: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  },
}));

const expirePendingApproval = vi.fn();
const finalizeAssistantMessage = vi.fn(async () => true);
vi.mock('../threadPersistenceService.js', () => ({
  expirePendingApproval: (...a: unknown[]) => expirePendingApproval(...a),
  finalizeAssistantMessage,
  touchThread: vi.fn(async () => undefined),
  createMessage: vi.fn(async () => undefined),
  setThreadToolContext: vi.fn(async () => undefined),
  discardPendingAssistantIfEmpty: vi.fn(async () => undefined),
}));

const streamAgenticResponse = vi.fn();
vi.mock('./agenticRespondService.js', () => ({ streamAgenticResponse }));
vi.mock('../../../../agents/langgraph/ChatGraph/index.js', () => ({
  buildSystemMessage: vi.fn(async () => 'SYSTEM'),
}));
vi.mock('../../streamStages/toolApprovalSuspend.js', () => ({
  suspendForToolApproval: vi.fn(),
}));
vi.mock('./toolApprovalRepo.js', () => ({ grantApproval: vi.fn(async () => undefined) }));
vi.mock('../../../../services/chat/threadTitleService.js', () => ({
  threadNeedsTitle: vi.fn(async () => false),
  generateThreadTitle: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/chat/threadTagService.js', () => ({
  generateThreadTags: vi.fn(async () => undefined),
}));
vi.mock('../../../../services/chat/threadRecallEmbeddingService.js', () => ({
  upsertThreadRecallPoint: vi.fn(async () => undefined),
}));
vi.mock('../intentExecutionService.js', () => ({
  generateAndCreateDocument: vi.fn(async () => undefined),
}));
vi.mock('../pendingActionStore.js', () => ({
  pendingActionStore: { store: vi.fn(async () => undefined) },
}));

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { runToolApprovalResume } = await import('./approvalResume.js');

describe('runToolApprovalResume — expired pause state', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(null);
    expirePendingApproval.mockReset().mockResolvedValue(undefined);
  });

  const run = (fail = vi.fn((message: string) => ({ message }))) =>
    runToolApprovalResume({
      req: {} as never,
      sse: {} as never,
      threadId: 't1',
      userId: 'u1',
      decisions: [{ toolCallId: 'c1', approved: true }],
      fail: fail as never,
    });

  it('marks the stored card expired so it stops being clickable', async () => {
    const fail = vi.fn((message: string) => ({ message }));
    await run(fail);

    expect(expirePendingApproval).toHaveBeenCalledWith('t1', 'u1');
    expect(fail).toHaveBeenCalledWith(
      'Die Freigabe ist abgelaufen. Bitte stelle die Anfrage noch einmal.',
      'invalid_request'
    );
  });

  it('still answers "abgelaufen" when marking the card fails', async () => {
    expirePendingApproval.mockRejectedValue(new Error('db down'));
    const fail = vi.fn((message: string) => ({ message }));
    await run(fail);

    expect(fail).toHaveBeenCalledTimes(1);
  });
});

/** #4369: die Freigabe-Fortsetzung endet über denselben Weg wie ein normaler Zug. */
describe('runToolApprovalResume — endet wie ein normaler Zug (#4369)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claim.mockResolvedValue(true);
    get.mockResolvedValue({
      approvalTurnId: 'turn-1',
      calls: [{ toolCallId: 'c1', toolName: 'mcp__x', args: {}, scopeKey: 'mcp:s1/x' }],
      priorSteps: [],
      partialText: 'Ich frage kurz nach.',
      pausedMessageId: 'msg-1',
      classifiedState: { intent: 'agentic', startTime: Date.now() },
      requestContext: {
        userId: 'u1',
        agentId: 'gruenerator-universal',
        isNewThread: false,
        processedMeta: [],
        memoryRetrieveTimeMs: 0,
        validMessages: [{ role: 'user', content: 'Frage' }],
      },
      createdAt: Date.now(),
    });
  });

  it('persistiert Rezept, Angebot und aufgelöste Freigabe und sendet das Artefakt', async () => {
    streamAgenticResponse.mockImplementation(
      async (params: { finalState: Record<string, unknown> }) => {
        params.finalState.usedRecipes = [{ mention: 'instagram', title: 'Instagram' }];
        return {
          fullText:
            '```html\n<!doctype html>\n<html><body>Post</body></html>\n```\n\nSoll ich daraus ein Sharepic machen?',
          steps: [{ toolCallId: 'c1', toolName: 'mcp__x', args: {}, result: {}, textOffset: 2 }],
          citations: [],
          sources: [],
          modelName: 'm',
        };
      }
    );
    const sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const sse = {
      send: (event: string, payload: Record<string, unknown>) => sent.push({ event, payload }),
      end: vi.fn(),
    };

    await runToolApprovalResume({
      req: {} as never,
      sse: sse as never,
      threadId: 't1',
      userId: 'u1',
      decisions: [{ toolCallId: 'c1', approved: true }],
      fail: vi.fn() as never,
    });

    expect(sent.map((e) => e.event)).toContain('artifact');
    const [id, text, metadata] = finalizeAssistantMessage.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('msg-1');
    expect(text.startsWith('Ich frage kurz nach.\n\n')).toBe(true);
    expect(metadata).toMatchObject({
      recipesUsed: [expect.objectContaining({ mention: 'instagram' })],
      offer: { kind: 'sharepic' },
      pendingApproval: expect.objectContaining({ approvalTurnId: 'turn-1', resolved: true }),
    });
    expect((metadata.toolCalls as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'textOffset'
    );
    expect(sent.find((e) => e.event === 'done')?.payload).toMatchObject({
      metadata: expect.objectContaining({ recipesUsed: expect.any(Array) }),
    });
  });
});
