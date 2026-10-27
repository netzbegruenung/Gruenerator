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
vi.mock('../../streamStages/clientToolLoopSuspend.js', () => ({
  suspendForLoopClientTool: vi.fn(),
}));
vi.mock('../../streamStages/clarificationLoopSuspend.js', () => ({
  suspendForLoopClarification: vi.fn(),
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

/** `tabelle_auswerten`: Freigabe, dann pausiert der Zug für den Browser. */
describe('runToolApprovalResume — tabelle_auswerten geht nach der Freigabe in den Browser', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    claim.mockResolvedValue(true);
    get.mockResolvedValue({
      approvalTurnId: 'turn-2',
      calls: [
        {
          toolCallId: 'c1',
          toolName: 'tabelle_auswerten',
          args: { auftrag: 'Summe Umsatz' },
          scopeKey: 'internal/tabelle_auswerten',
        },
      ],
      priorSteps: [],
      partialText: '',
      pausedMessageId: 'msg-2',
      classifiedState: { intent: 'agentic', startTime: Date.now() },
      requestContext: {
        userId: 'u1',
        agentId: 'gruenerator-universal',
        isNewThread: false,
        processedMeta: [],
        memoryRetrieveTimeMs: 0,
        validMessages: [{ role: 'user', content: 'Wie viel Umsatz?' }],
      },
      createdAt: Date.now(),
    });
    streamAgenticResponse.mockResolvedValue({
      fullText: '',
      steps: [],
      citations: [],
      sources: [],
      modelName: 'm',
      pendingClientTool: {
        toolCallId: 'c1',
        toolName: 'tabelle_auswerten',
        args: { auftrag: 'Summe Umsatz' },
        clientToolName: 'run_python',
        clientArgs: { code: 'print(1)' },
      },
    });
  });

  it('merkt sich „Immer erlauben", pausiert für run_python und hält die Karte als entschieden', async () => {
    const { grantApproval } = await import('./toolApprovalRepo.js');
    const { suspendForLoopClientTool } =
      await import('../../streamStages/clientToolLoopSuspend.js');
    const decisions = [{ toolCallId: 'c1', approved: true, optionId: 'allow-always' }];

    await runToolApprovalResume({
      req: {} as never,
      sse: { send: vi.fn(), end: vi.fn() } as never,
      threadId: 't1',
      userId: 'u1',
      decisions: decisions as never,
      fail: vi.fn() as never,
    });

    expect(grantApproval).toHaveBeenCalledWith(
      'u1',
      'internal/tabelle_auswerten',
      'tabelle_auswerten'
    );
    expect(suspendForLoopClientTool).toHaveBeenCalledTimes(1);
    const params = vi.mocked(suspendForLoopClientTool).mock.calls[0]?.[0];
    expect(params?.pendingClientTool.clientToolName).toBe('run_python');
    expect(params?.pendingId).toBe('msg-2');
    expect(params?.resolvedPause).toEqual({
      pendingApproval: {
        approvalTurnId: 'turn-2',
        calls: [expect.objectContaining({ toolCallId: 'c1' })],
        resolved: true,
        decisions,
      },
    });
  });
  // #5044: ein schon freigegebener Browser-Aufruf, den diese Freigabe überholt
  // hat, geht in die Fortsetzung und reist bei einer erneuten Pause weiter mit.
  it('reicht den mitgereisten Browser-Aufruf in die Fortsetzung und in eine neue Pause', async () => {
    const { suspendForToolApproval } = await import('../../streamStages/toolApprovalSuspend.js');
    const held = {
      toolCallId: 'tab_1',
      toolName: 'tabelle_auswerten',
      args: { auftrag: 'Summe Umsatz' },
      clientToolName: 'run_python',
      clientArgs: { code: 'print(1)' },
    };
    const stored = await get.getMockImplementation()?.('t1');
    get.mockResolvedValue({ ...(stored as object), heldClientTool: held });
    streamAgenticResponse.mockResolvedValue({
      fullText: '',
      steps: [],
      citations: [],
      sources: [],
      modelName: 'm',
      pendingApproval: [{ toolCallId: 'c9', toolName: 'mcp__y', args: {}, scopeKey: 'mcp:s/y' }],
      heldClientTool: held,
    });

    await runToolApprovalResume({
      req: {} as never,
      sse: { send: vi.fn(), end: vi.fn() } as never,
      threadId: 't1',
      userId: 'u1',
      decisions: [{ toolCallId: 'c1', approved: true }] as never,
      fail: vi.fn() as never,
    });

    const resumeParams = streamAgenticResponse.mock.calls[0]?.[0] as {
      resumeApproval: { heldClientTool?: unknown };
    };
    expect(resumeParams.resumeApproval.heldClientTool).toEqual(held);
    expect(vi.mocked(suspendForToolApproval).mock.calls[0]?.[0].heldClientTool).toEqual(held);
  });
});

// #5051: eine Fortsetzung, die erneut pausiert, gibt die gerade entschiedene
// Freigabe samt der früher entschiedenen an die neue Pause weiter.
describe('runToolApprovalResume — mehrere Pausen in einem Zug (#5051)', () => {
  const earlier = {
    approvalTurnId: 'turn-1',
    calls: [{ toolCallId: 'c0', toolName: 'tabelle_auswerten', args: {} }],
    resolved: true,
    decisions: [{ toolCallId: 'c0', approved: true, optionId: 'allow-once' }],
  };
  const decisions = [{ toolCallId: 'c1', approved: true, optionId: 'allow-once' }];
  const expectedPause = {
    decidedApprovals: [earlier],
    pendingApproval: {
      approvalTurnId: 'turn-2',
      calls: [expect.objectContaining({ toolCallId: 'c1' })],
      resolved: true,
      decisions,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    claim.mockResolvedValue(true);
    get.mockResolvedValue({
      approvalTurnId: 'turn-2',
      calls: [{ toolCallId: 'c1', toolName: 'tabelle_auswerten', args: {}, scopeKey: 'k' }],
      priorSteps: [],
      partialText: '',
      pausedMessageId: 'msg-2',
      resolvedPause: { decidedApprovals: [earlier] },
      classifiedState: { intent: 'agentic', startTime: Date.now() },
      requestContext: { userId: 'u1', validMessages: [] },
      createdAt: Date.now(),
    });
  });

  const resume = () =>
    runToolApprovalResume({
      req: {} as never,
      sse: { send: vi.fn(), end: vi.fn() } as never,
      threadId: 't1',
      userId: 'u1',
      decisions: decisions as never,
      fail: vi.fn() as never,
    });

  it('erneute Freigabe-Pause: bekommt alle entschiedenen Freigaben mit', async () => {
    const { suspendForToolApproval } = await import('../../streamStages/toolApprovalSuspend.js');
    streamAgenticResponse.mockResolvedValue({
      fullText: '',
      steps: [],
      citations: [],
      sources: [],
      modelName: 'm',
      pendingApproval: [
        { toolCallId: 'c2', toolName: 'tabelle_auswerten', args: {}, scopeKey: 'k' },
      ],
    });

    await resume();

    expect(vi.mocked(suspendForToolApproval).mock.calls[0]?.[0].resolvedPause).toEqual(
      expectedPause
    );
  });

  it('Rückfrage nach der Freigabe: pausiert statt still zu enden', async () => {
    const { suspendForLoopClarification } =
      await import('../../streamStages/clarificationLoopSuspend.js');
    streamAgenticResponse.mockResolvedValue({
      fullText: 'Kurz:',
      steps: [],
      citations: [],
      sources: [],
      modelName: 'm',
      pendingAsk: { toolCallId: 'ask-1', question: 'Welches Blatt?' },
    });

    await resume();

    expect(suspendForLoopClarification).toHaveBeenCalledTimes(1);
    const params = vi.mocked(suspendForLoopClarification).mock.calls[0]?.[0];
    expect(params?.pendingAsk.question).toBe('Welches Blatt?');
    expect(params?.pendingId).toBe('msg-2');
    expect(params?.resolvedPause).toEqual(expectedPause);
    expect(finalizeAssistantMessage).not.toHaveBeenCalled();
  });
});
