/**
 * Mehrere Pausen in einem Zug: eine schon entschiedene Freigabe darf von der
 * nächsten Pause nicht überschrieben werden (#5051).
 *
 * `pendingApproval` ist ein einzelner Schlüssel. Pausiert die Fortsetzung einer
 * Freigabe erneut an einem Gate, belegte die neue Karte ihn und die
 * entschiedene verschwand — nach einem Reload fehlte deren Pille. Jetzt wandert
 * sie vorher nach `decidedApprovals` und reist im Redis-Zustand mit.
 *
 * Run: `npx vitest run routes/chat/streamStages/resolvedPauseChain.vitest.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/postResponseService.js', () => ({
  persistSuspendedTurnAttachments: vi.fn(async () => undefined),
}));
vi.mock('../services/toolApprovalStateStore.js', () => ({
  toolApprovalStateStore: { store: vi.fn(async () => true) },
}));
vi.mock('../services/loopClarificationStateStore.js', () => ({
  loopClarificationStateStore: { store: vi.fn(async () => true) },
}));
vi.mock('../services/threadPersistenceService.js', () => ({
  createMessage: vi.fn(async () => undefined),
  finalizeAssistantMessage: vi.fn(async () => true),
  touchThread: vi.fn(async () => undefined),
}));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { loopClarificationStateStore } from '../services/loopClarificationStateStore.js';
import { finalizeAssistantMessage } from '../services/threadPersistenceService.js';
import { toolApprovalStateStore } from '../services/toolApprovalStateStore.js';

import { suspendForLoopClarification } from './clarificationLoopSuspend.js';
import { suspendForToolApproval } from './toolApprovalSuspend.js';

import type { SSEWriter } from '../services/sseHelpers.js';

const sse = (): SSEWriter =>
  ({ send: vi.fn(), sendRaw: vi.fn(), end: vi.fn() }) as unknown as SSEWriter;

const common = {
  threadId: 't1',
  classifiedState: { intent: 'agentic' } as never,
  requestContext: { userId: 'u1', processedMeta: [] } as never,
  partialText: 'Teil',
  priorSteps: [],
  pendingId: 'msg-1',
  startTime: Date.now(),
};

const decided = (turn: string, id: string) => ({
  approvalTurnId: turn,
  calls: [{ toolCallId: id, toolName: 'tabelle_auswerten', args: {} }],
  resolved: true,
  decisions: [{ toolCallId: id, approved: true, optionId: 'allow-once' }],
});

const writtenMetadata = (): Record<string, unknown> =>
  vi.mocked(finalizeAssistantMessage).mock.calls[0]?.[2] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Freigabe nach einer entschiedenen Freigabe (#5051)', () => {
  it('schiebt die entschiedene nach decidedApprovals, statt sie zu überschreiben', async () => {
    await suspendForToolApproval({
      ...common,
      sse: sse(),
      pendingApproval: [{ toolCallId: 'c2', toolName: 'tabelle_auswerten', args: {} }] as never,
      resolvedPause: {
        decidedApprovals: [decided('turn-0', 'c0')],
        pendingApproval: decided('turn-1', 'c1'),
      },
    });

    const metadata = writtenMetadata();
    expect(metadata.decidedApprovals).toEqual([decided('turn-0', 'c0'), decided('turn-1', 'c1')]);
    expect(metadata.pendingApproval).toMatchObject({
      calls: [expect.objectContaining({ toolCallId: 'c2' })],
      resolved: false,
    });
    // Die Fortsetzung der neuen Pause muss die Liste weitertragen können.
    expect(vi.mocked(toolApprovalStateStore.store).mock.calls[0]?.[1].resolvedPause).toEqual({
      decidedApprovals: [decided('turn-0', 'c0'), decided('turn-1', 'c1')],
    });
  });

  it('ohne frühere Pause bleibt die Metadaten-Form wie bisher', async () => {
    await suspendForToolApproval({
      ...common,
      sse: sse(),
      pendingApproval: [{ toolCallId: 'c1', toolName: 'tabelle_auswerten', args: {} }] as never,
    });

    expect(writtenMetadata()).not.toHaveProperty('decidedApprovals');
    expect(vi.mocked(toolApprovalStateStore.store).mock.calls[0]?.[1]).not.toHaveProperty(
      'resolvedPause'
    );
  });
});

describe('Rückfrage nach einer entschiedenen Freigabe (#5051)', () => {
  it('schreibt die entschiedene Freigabe in die Nachricht und in den Zustand', async () => {
    const resolvedPause = { pendingApproval: decided('turn-1', 'c1') };
    await suspendForLoopClarification({
      ...common,
      sse: sse(),
      pendingAsk: { toolCallId: 'ask-1', question: 'Welches Blatt?' } as never,
      resolvedPause,
    });

    const metadata = writtenMetadata();
    expect(metadata.pendingApproval).toEqual(decided('turn-1', 'c1'));
    expect(metadata.pendingClarification).toMatchObject({ toolCallId: 'ask-1', resolved: false });
    expect(vi.mocked(loopClarificationStateStore.store).mock.calls[0]?.[1].resolvedPause).toEqual(
      resolvedPause
    );
  });
});
