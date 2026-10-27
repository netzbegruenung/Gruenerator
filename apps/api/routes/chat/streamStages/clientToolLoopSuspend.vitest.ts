/**
 * Die Pause für ein Browser-Werkzeug schreibt eine vorher entschiedene
 * Freigabe in die pausierte Nachricht — sonst verschwindet die Karte beim Reload.
 */
import { describe, it, expect, vi } from 'vitest';

const { storeMock, finalizeMock } = vi.hoisted(() => ({
  storeMock: vi.fn(async () => true),
  finalizeMock: vi.fn(async () => true),
}));

vi.mock('../services/loopClientToolStateStore.js', () => ({
  loopClientToolStateStore: { store: storeMock },
}));
vi.mock('../services/threadPersistenceService.js', () => ({
  createMessage: vi.fn(async () => undefined),
  finalizeAssistantMessage: finalizeMock,
  touchThread: vi.fn(async () => undefined),
}));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { suspendForLoopClientTool } from './clientToolLoopSuspend.js';

import type { SSEWriter } from '../services/sseHelpers.js';

describe('suspendForLoopClientTool', () => {
  it('trägt die entschiedene Freigabe in Nachricht und Zustand', async () => {
    const resolvedPause = {
      pendingApproval: { approvalTurnId: 'a1', calls: [], resolved: true, decisions: [] },
    };
    await suspendForLoopClientTool({
      sse: { send: vi.fn(), end: vi.fn() } as unknown as SSEWriter,
      threadId: 't1',
      classifiedState: { intent: 'agentic' } as never,
      requestContext: { userId: 'u1', processedMeta: [] } as never,
      pendingClientTool: {
        toolCallId: 'c1',
        toolName: 'tabelle_auswerten',
        args: {},
        clientToolName: 'run_python',
        clientArgs: { code: 'print(1)' },
      },
      partialText: '',
      priorSteps: [],
      pendingId: 'msg-1',
      startTime: Date.now(),
      resolvedPause,
    });

    const [id, , metadata] = finalizeMock.mock.calls[0] as unknown as [
      string,
      unknown,
      { pendingApproval: { resolved: unknown } },
    ];
    expect(id).toBe('msg-1');
    expect(metadata.pendingApproval.resolved).toBe(true);
    expect(storeMock).toHaveBeenCalledWith('t1', expect.objectContaining({ resolvedPause }));
  });
});
