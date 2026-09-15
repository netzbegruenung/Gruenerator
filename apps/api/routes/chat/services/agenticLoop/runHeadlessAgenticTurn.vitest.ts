/**
 * Der headless Loop-Einstieg (#3221) — geprüft über injizierte Deps: was er an
 * `streamAgenticResponse` übergibt (Null-Sink, disableMcp, kein req, kein
 * Thread) und wie er den Ausgang mappt (degraded durchreichen, pendingApproval
 * defensiv als failed).
 */
import { describe, it, expect, vi } from 'vitest';

import { runHeadlessAgenticTurn, type HeadlessTurnDeps } from './runHeadlessAgenticTurn.js';

import type { AgenticResponseOutcome } from './agenticRespondService.js';

function outcome(overrides: Partial<AgenticResponseOutcome> = {}): AgenticResponseOutcome {
  return {
    fullText: 'Ergebnis mit Quellen. ',
    steps: [],
    citations: [],
    sources: [],
    modelName: 'mistral-medium-2604',
    ...overrides,
  };
}

function makeDeps(opts: { outcome?: AgenticResponseOutcome; enabledTools?: string[] }): {
  deps: HeadlessTurnDeps;
  streamCalls: Array<Record<string, unknown>>;
} {
  const streamCalls: Array<Record<string, unknown>> = [];
  const deps: HeadlessTurnDeps = {
    prepareAgentState: vi.fn(async () => ({
      finalState: {
        intent: 'agentic',
        userLocale: 'de-DE',
        agentConfig: {
          identifier: 'gruenerator-universal',
          provider: 'mistral',
          model: 'mistral-medium-2604',
          params: { temperature: 0.3 },
          ...(opts.enabledTools ? { enabledTools: opts.enabledTools } : {}),
        },
      },
      userMessage: { role: 'user', content: 'Auftrag' },
    })) as unknown as HeadlessTurnDeps['prepareAgentState'],
    buildSystemMessage: vi.fn(async () => 'SYSTEM') as never,
    streamAgenticResponse: vi.fn(async (p: Record<string, unknown>) => {
      streamCalls.push(p);
      return opts.outcome ?? outcome();
    }) as unknown as HeadlessTurnDeps['streamAgenticResponse'],
  };
  return { deps, streamCalls };
}

const baseParams = {
  instruction: 'Fasse die Woche zusammen.',
  userId: 'user-1',
  userLocale: 'de-DE' as const,
  longForm: true,
  slotLabel: 'recurring-task-t1',
};

describe('runHeadlessAgenticTurn', () => {
  it('fährt den Loop ohne Leitung: Null-Sink, disableMcp, kein req, kein Thread', async () => {
    const { deps, streamCalls } = makeDeps({});
    const result = await runHeadlessAgenticTurn(baseParams, deps);

    const call = streamCalls[0]!;
    expect(call.disableMcp).toBe(true);
    expect(call.threadId).toBeNull();
    expect(call.toolHistory).toBeNull();
    expect(call).not.toHaveProperty('req');
    // Der Sink ist ein echter SSEWriter über einer stummen Response.
    expect(typeof (call.sse as { send: unknown }).send).toBe('function');
    expect((call.sse as { isEnded: () => boolean }).isEnded()).toBe(false);
    expect(call.requestId).toBe('recurring-task-t1');
    expect(call.systemMessage).toContain('DOKUMENT-MODUS');

    expect(result.degraded).toBe('none');
    expect(result.text).toBe('Ergebnis mit Quellen.');
  });

  it('hängt die Prüf-Rückmeldung als zweite User-Message an', async () => {
    const { deps, streamCalls } = makeDeps({});
    await runHeadlessAgenticTurn(
      { ...baseParams, feedback: { hint: 'Thema verfehlt', priorDraft: 'Alter Entwurf' } },
      deps
    );
    const messages = streamCalls[0]!.messages as Array<{ role: string; content: string }>;
    expect(messages).toHaveLength(2);
    expect(messages[1]!.content).toContain('Thema verfehlt');
    expect(messages[1]!.content).toContain('Alter Entwurf');
  });

  it('reicht degraded durch', async () => {
    const { deps } = makeDeps({ outcome: outcome({ degraded: 'no_answer', fullText: '' }) });
    const result = await runHeadlessAgenticTurn(baseParams, deps);
    expect(result.degraded).toBe('no_answer');
  });

  it('wertet ein pendingApproval defensiv als failed — niemand wartet am Lauf', async () => {
    const { deps } = makeDeps({
      outcome: outcome({
        pendingApproval: [{ toolCallId: 'c1', toolName: 'mcp__x', args: {}, scopeKey: 'k' }],
      }),
    });
    const result = await runHeadlessAgenticTurn(baseParams, deps);
    expect(result.degraded).toBe('failed');
    expect(result.text).toBe('');
  });

  it('beschränkt die Suchfamilie nur bei gebundenem Agenten mit Picker-Auswahl', async () => {
    const bound = makeDeps({ enabledTools: ['search', 'web'] });
    await runHeadlessAgenticTurn({ ...baseParams, restrictToAgentTools: true }, bound.deps);
    expect(bound.streamCalls[0]!.searchToolKeys).toEqual(['search', 'web']);

    const universal = makeDeps({});
    await runHeadlessAgenticTurn({ ...baseParams, restrictToAgentTools: true }, universal.deps);
    expect(universal.streamCalls[0]!).not.toHaveProperty('searchToolKeys');

    const unrestricted = makeDeps({ enabledTools: ['search'] });
    await runHeadlessAgenticTurn({ ...baseParams, restrictToAgentTools: false }, unrestricted.deps);
    expect(unrestricted.streamCalls[0]!).not.toHaveProperty('searchToolKeys');
  });
});
