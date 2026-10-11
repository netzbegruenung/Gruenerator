/**
 * Die Fortsetzung nach einem Browser-Werkzeug des Loops (`check_sharepic` →
 * `render_sharepic`) — gemockt sind Zustand, Prüfung und der frische Zug; der
 * Prüfgegenstand ist die Orchestrierung: Anspruch nehmen, Bild prüfen, die
 * Prüfung als Ergebnis des zurückgehaltenen Aufrufs einspielen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storeMock, streamMock, reviewMock, suspendToolMock, finishMock } = vi.hoisted(() => ({
  storeMock: {
    get: vi.fn(),
    claim: vi.fn(),
    releaseClaim: vi.fn(),
    delete: vi.fn(),
    store: vi.fn(),
  },
  streamMock: vi.fn(),
  reviewMock: vi.fn(),
  suspendToolMock: vi.fn(async (_p: Record<string, unknown>) => ({
    status: 200 as const,
    body: undefined,
  })),
  finishMock: vi.fn(async (_p: Record<string, unknown>) => ({
    status: 200 as const,
    body: undefined,
  })),
}));

vi.mock('../../../../agents/langgraph/ChatGraph/index.js', () => ({
  buildSystemMessage: vi.fn(async () => 'SYSTEM'),
}));
vi.mock('../../streamStages/clarificationLoopSuspend.js', () => ({
  suspendForLoopClarification: vi.fn(),
}));
vi.mock('../../streamStages/toolApprovalSuspend.js', () => ({ suspendForToolApproval: vi.fn() }));
vi.mock('../../streamStages/clientToolLoopSuspend.js', () => ({
  suspendForLoopClientTool: suspendToolMock,
}));
vi.mock('../../streamStages/loopResumeEnd.js', () => ({ finishResumedLoopTurn: finishMock }));
vi.mock('../loopClientToolStateStore.js', () => ({ loopClientToolStateStore: storeMock }));
vi.mock('../../agents/sharepicCheckTool.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../agents/sharepicCheckTool.js')>()),
  reviewRenderedSharepic: reviewMock,
}));
vi.mock('./agenticRespondService.js', () => ({ streamAgenticResponse: streamMock }));

import { runClientToolLoopResume } from './clientToolResume.js';

import type { StoredLoopClientToolState } from '../loopClientToolStateStore.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { Request } from 'express';

type SentEvent = { event: string; payload: Record<string, unknown> };

function fakeSse(): { sse: SSEWriter; sent: SentEvent[] } {
  const sent: SentEvent[] = [];
  const sse = {
    send: (event: string, payload: Record<string, unknown>) => sent.push({ event, payload }),
  } as unknown as SSEWriter;
  return { sse, sent };
}

const fails: Array<{ message: string; code: string }> = [];
const fail = (message: string, code: 'invalid_request' | 'unauthorized') => {
  fails.push({ message, code });
  return { handled: true as const, status: 200 as const, body: undefined };
};

function storedState(): StoredLoopClientToolState {
  return {
    clientToolTurnId: 'ct-turn-1',
    toolCallId: 'call_check',
    toolName: 'check_sharepic',
    args: {},
    clientToolName: 'render_sharepic',
    clientArgs: { variantId: 'v1', canvasType: 'x', initialProps: {} },
    priorSteps: [
      { toolCallId: 'call_read', toolName: 'read_sharepic', args: {}, result: { ok: true } },
    ],
    partialText: 'Ich schaue es mir an.',
    pausedMessageId: 'msg-1',
    classifiedState: {
      intent: 'agentic',
      lastUserTextNoMentions: 'Sieht das gut aus?',
    } as never,
    requestContext: {
      userId: 'user-1',
      validMessages: [{ role: 'user', content: 'Sieht das gut aus?' }],
    },
    createdAt: Date.now(),
  } as unknown as StoredLoopClientToolState;
}

const IMAGE = 'data:image/png;base64,AAAA';

function run(result: unknown, userId = 'user-1') {
  const fake = fakeSse();
  const promise = runClientToolLoopResume({
    req: {} as Request,
    sse: fake.sse,
    threadId: 't1',
    userId,
    result,
    fail,
  });
  return { ...fake, promise };
}

beforeEach(() => {
  vi.clearAllMocks();
  fails.length = 0;
  storeMock.claim.mockResolvedValue(true);
  storeMock.get.mockResolvedValue(storedState());
  reviewMock.mockResolvedValue({ ok: false, issues: ['Folie 1: Text zu klein'] });
  streamMock.mockResolvedValue({
    fullText: 'Der Text ist zu klein.',
    steps: [],
    citations: [],
    sources: [],
    modelName: 'm',
  });
});

describe('runClientToolLoopResume', () => {
  it('abgelaufener Zustand ⇒ invalid_request, kein Zug', async () => {
    storeMock.get.mockResolvedValue(undefined);
    await run({ image: IMAGE }).promise;
    expect(fails).toEqual([expect.objectContaining({ code: 'invalid_request' })]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('fremde Nutzer*in ⇒ unauthorized', async () => {
    await run({ image: IMAGE }, 'user-2').promise;
    expect(fails).toEqual([expect.objectContaining({ code: 'unauthorized' })]);
  });

  it('verlorener Anspruch ⇒ invalid_request, keine Prüfung', async () => {
    storeMock.claim.mockResolvedValue(false);
    await run({ image: IMAGE }).promise;
    expect(fails).toEqual([expect.objectContaining({ code: 'invalid_request' })]);
    expect(reviewMock).not.toHaveBeenCalled();
  });

  it('prüft das Bild und spielt die Prüfung als Ergebnis des gehaltenen Aufrufs ein', async () => {
    const { promise, sent } = run({ image: IMAGE });
    await promise;

    expect(reviewMock).toHaveBeenCalledWith({
      threadId: 't1',
      variantId: 'v1',
      userText: 'Sieht das gut aus?',
      image: IMAGE,
    });
    const call = streamMock.mock.calls[0]![0] as {
      resumeApproval: { priorSteps: Array<Record<string, unknown>> };
    };
    expect(call.resumeApproval.priorSteps.map((s) => s.toolName)).toEqual([
      'read_sharepic',
      'check_sharepic',
    ]);
    expect(call.resumeApproval.priorSteps[1]).toMatchObject({
      toolCallId: 'call_check',
      result: { ok: false, issues: ['Folie 1: Text zu klein'] },
    });
    expect(call.resumeApproval.priorSteps[1]).not.toHaveProperty('ok');

    const results = sent.filter((e) => e.event === 'tool_step_result');
    expect(results.map((e) => e.payload.toolName)).toEqual(['read_sharepic', 'check_sharepic']);
    expect(storeMock.delete).toHaveBeenCalledWith('t1');
    expect(finishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pausedMessageId: 'msg-1',
        fullText: 'Ich schaue es mir an.\n\nDer Text ist zu klein.',
      })
    );
  });

  it('ohne Bild (Renderfehler) ⇒ Schritt als fehlgeschlagen, der Zug läuft trotzdem weiter', async () => {
    reviewMock.mockResolvedValue({ ok: false, note: 'konnte nicht gerendert werden' });
    await run({ image: null }).promise;

    expect(reviewMock).toHaveBeenCalledWith(expect.objectContaining({ image: null }));
    const call = streamMock.mock.calls[0]![0] as {
      resumeApproval: { priorSteps: Array<Record<string, unknown>> };
    };
    expect(call.resumeApproval.priorSteps[1]).toMatchObject({ ok: false });
    expect(finishMock).toHaveBeenCalled();
  });

  it('pausiert die Fortsetzung selbst wieder ⇒ neue Pause statt Abschluss', async () => {
    const again = { toolCallId: 'c2', toolName: 'check_sharepic', args: {} };
    streamMock.mockResolvedValue({
      fullText: '',
      steps: [],
      citations: [],
      sources: [],
      modelName: 'm',
      pendingClientTool: again,
    });
    await run({ image: IMAGE }).promise;

    expect(suspendToolMock).toHaveBeenCalledWith(
      expect.objectContaining({ pendingClientTool: again, pendingId: 'msg-1' })
    );
    expect(finishMock).not.toHaveBeenCalled();
  });

  it('gescheiterte Fortsetzung ⇒ Anspruch zurück + fail', async () => {
    streamMock.mockRejectedValue(new Error('kaputt'));
    await run({ image: IMAGE }).promise;
    expect(storeMock.releaseClaim).toHaveBeenCalledWith('t1', 'ct-turn-1');
    expect(fails).toEqual([expect.objectContaining({ code: 'invalid_request' })]);
  });
});
