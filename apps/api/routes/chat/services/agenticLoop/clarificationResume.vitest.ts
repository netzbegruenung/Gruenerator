/**
 * Die Fortsetzung nach einer Loop-Rückfrage (#3220) — geprüft mit gemockten
 * Kollaborateuren, weil der Prüfgegenstand die Orchestrierung ist: Zustand
 * laden, Anspruch nehmen, die beantwortete Frage als Schritt in den frischen
 * Zug einspielen, EINE Blase fortschreiben, Zustand löschen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { storeMock, streamMock, finalizeMock, touchMock, suspendClarMock, suspendApprovalMock } =
  vi.hoisted(() => ({
    storeMock: {
      get: vi.fn(),
      claim: vi.fn(),
      releaseClaim: vi.fn(),
      delete: vi.fn(),
      store: vi.fn(),
    },
    streamMock: vi.fn(),
    finalizeMock: vi.fn(),
    touchMock: vi.fn(),
    suspendClarMock: vi.fn(async () => ({ status: 200 as const, body: undefined })),
    suspendApprovalMock: vi.fn(async () => ({ status: 200 as const, body: undefined })),
  }));

vi.mock('../../../../agents/langgraph/ChatGraph/index.js', () => ({
  buildSystemMessage: vi.fn(async () => 'SYSTEM'),
}));
vi.mock('../../streamStages/clarificationLoopSuspend.js', () => ({
  suspendForLoopClarification: suspendClarMock,
}));
vi.mock('../../streamStages/toolApprovalSuspend.js', () => ({
  suspendForToolApproval: suspendApprovalMock,
}));
vi.mock('../loopClarificationStateStore.js', () => ({
  loopClarificationStateStore: storeMock,
}));
vi.mock('../threadPersistenceService.js', () => ({
  finalizeAssistantMessage: finalizeMock,
  touchThread: touchMock,
}));
vi.mock('./agenticRespondService.js', () => ({
  streamAgenticResponse: streamMock,
}));

import { runClarificationLoopResume } from './clarificationResume.js';

import type { StoredLoopClarificationState } from '../loopClarificationStateStore.js';
import type { SSEWriter } from '../sseHelpers.js';
import type { Request } from 'express';

type SentEvent = { event: string; payload: Record<string, unknown> };

function fakeSse(): { sse: SSEWriter; sent: SentEvent[]; ended: () => boolean } {
  const sent: SentEvent[] = [];
  let ended = false;
  const sse = {
    send: (event: string, payload: Record<string, unknown>) => sent.push({ event, payload }),
    end: () => {
      ended = true;
    },
  } as unknown as SSEWriter;
  return { sse, sent, ended: () => ended };
}

const fails: Array<{ message: string; code: string }> = [];
const fail = (message: string, code: 'invalid_request' | 'unauthorized') => {
  fails.push({ message, code });
  return { handled: true as const, status: 200 as const, body: undefined };
};

function storedState(): StoredLoopClarificationState {
  return {
    askTurnId: 'ask-turn-1',
    toolCallId: 'call_ask',
    question: 'Welche Anna meinst du?',
    options: ['Anna Müller', 'Anna Meier'],
    priorSteps: [
      {
        toolCallId: 'call_search',
        toolName: 'gruenerator_search',
        args: { query: 'Anna' },
        result: { resultCount: 2 },
      },
    ],
    partialText: 'Ich habe zwei Kandidatinnen gefunden.',
    pausedMessageId: 'msg-1',
    classifiedState: { intent: 'agentic' } as never,
    requestContext: { userId: 'user-1', validMessages: [{ role: 'user', content: 'Frage' }] },
    createdAt: Date.now(),
  } as unknown as StoredLoopClarificationState;
}

function goodOutcome(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullText: 'Anna Müller stimmte dafür.',
    steps: [
      {
        toolCallId: 'call_ask',
        toolName: 'ask_human',
        args: { question: 'Welche Anna meinst du?' },
        result: { answer: 'Anna Müller' },
        textOffset: 3,
      },
    ],
    citations: [],
    sources: [],
    modelName: 'mistral-medium-2604',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fails.length = 0;
  storeMock.claim.mockResolvedValue(true);
});

describe('runClarificationLoopResume — fail-closed-Pfade', () => {
  it('abgelaufener Zustand ⇒ invalid_request', async () => {
    storeMock.get.mockResolvedValue(undefined);
    const { sse } = fakeSse();
    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-1',
      answer: 'Anna Müller',
      fail,
    });
    expect(fails).toEqual([expect.objectContaining({ code: 'invalid_request' })]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('fremde Nutzer*in ⇒ unauthorized', async () => {
    storeMock.get.mockResolvedValue(storedState());
    const { sse } = fakeSse();
    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-2',
      answer: 'x',
      fail,
    });
    expect(fails).toEqual([expect.objectContaining({ code: 'unauthorized' })]);
  });

  it('verlorener Anspruch (zweiter Tab) ⇒ invalid_request, kein Zug', async () => {
    storeMock.get.mockResolvedValue(storedState());
    storeMock.claim.mockResolvedValue(false);
    const { sse } = fakeSse();
    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-1',
      answer: 'x',
      fail,
    });
    expect(fails).toEqual([expect.objectContaining({ code: 'invalid_request' })]);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('gescheiterte Fortsetzung ⇒ Anspruch zurück + fail', async () => {
    storeMock.get.mockResolvedValue(storedState());
    streamMock.mockRejectedValue(new Error('kaputt'));
    const { sse } = fakeSse();
    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-1',
      answer: 'x',
      fail,
    });
    expect(storeMock.releaseClaim).toHaveBeenCalledWith('t1', 'ask-turn-1');
    expect(fails).toEqual([expect.objectContaining({ code: 'invalid_request' })]);
  });
});

describe('runClarificationLoopResume — Erfolg', () => {
  it('spielt die Antwort als beantworteten ask_human-Schritt ein und schreibt EINE Blase fort', async () => {
    storeMock.get.mockResolvedValue(storedState());
    streamMock.mockResolvedValue(goodOutcome());
    const { sse, sent, ended } = fakeSse();

    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-1',
      answer: 'Anna Müller',
      fail,
    });

    // Der frische Zug bekommt die Schritte von vorher PLUS die beantwortete
    // Frage — über denselben resumeApproval-Mechanismus wie die Freigabe.
    const call = streamMock.mock.calls[0]![0] as {
      resumeApproval: { priorSteps: Array<Record<string, unknown>> };
      threadId: string;
    };
    expect(call.threadId).toBe('t1');
    expect(call.resumeApproval.priorSteps.map((s) => s.toolName)).toEqual([
      'gruenerator_search',
      'ask_human',
    ]);
    expect(call.resumeApproval.priorSteps[1]).toMatchObject({
      toolCallId: 'call_ask',
      result: { answer: 'Anna Müller' },
    });

    // Karten-Kontinuität: die Vorschritte werden re-emittiert, die beantwortete
    // Frage NICHT (eine ergebnislose ask_human-Karte wäre wieder beantwortbar).
    const startEvents = sent.filter((e) => e.event === 'tool_step_start');
    expect(startEvents.map((e) => e.payload.toolName)).toEqual(['gruenerator_search']);

    // Eine Blase: Teiltext + Fortsetzung, Offsets fallen gelassen, resolved.
    expect(finalizeMock).toHaveBeenCalledWith(
      'msg-1',
      'Ich habe zwei Kandidatinnen gefunden.\n\nAnna Müller stimmte dafür.',
      expect.objectContaining({
        pendingClarification: expect.objectContaining({ resolved: true, answer: 'Anna Müller' }),
      })
    );
    const persistedSteps = (
      finalizeMock.mock.calls[0]![2] as { toolCalls: Array<Record<string, unknown>> }
    ).toolCalls;
    expect(persistedSteps[0]).not.toHaveProperty('textOffset');

    expect(storeMock.delete).toHaveBeenCalledWith('t1');
    expect(sent.some((e) => e.event === 'done')).toBe(true);
    expect(ended()).toBe(true);
  });

  it('pausiert erneut, wenn die Fortsetzung wieder fragt — alter Zustand weg, Blase bleibt', async () => {
    storeMock.get.mockResolvedValue(storedState());
    streamMock.mockResolvedValue(
      goodOutcome({
        pendingAsk: { toolCallId: 'call_ask2', question: 'Und welches Jahr?' },
      })
    );
    const { sse } = fakeSse();

    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-1',
      answer: 'Anna Müller',
      fail,
    });

    expect(storeMock.delete).toHaveBeenCalledWith('t1');
    expect(suspendClarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingAsk: expect.objectContaining({ question: 'Und welches Jahr?' }),
        pendingId: 'msg-1',
      })
    );
    expect(finalizeMock).not.toHaveBeenCalled();
  });

  it('pausiert als Freigabe, wenn die Fortsetzung auf ein Gate läuft', async () => {
    storeMock.get.mockResolvedValue(storedState());
    streamMock.mockResolvedValue(
      goodOutcome({
        pendingApproval: [{ toolCallId: 'c9', toolName: 'mcp__x', args: {}, scopeKey: 'mcp:s1/x' }],
      })
    );
    const { sse } = fakeSse();

    await runClarificationLoopResume({
      req: {} as Request,
      sse,
      threadId: 't1',
      userId: 'user-1',
      answer: 'Anna Müller',
      fail,
    });

    expect(storeMock.delete).toHaveBeenCalledWith('t1');
    expect(suspendApprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({ pendingId: 'msg-1' })
    );
  });
});
