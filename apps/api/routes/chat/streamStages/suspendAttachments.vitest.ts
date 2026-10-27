/**
 * Ein pausierender Zug speichert die Anhänge seines Turns, BEVOR er den Client
 * fragt.
 *
 * Gespeichert wurden sie bisher nur am Ende des Zuges (`persistAssistantResponse`
 * bzw. `persistResumedResponse`). Ein Zug, der an einer Freigabe, einem
 * Browser-Werkzeug oder einer Rückfrage pausiert, hatte die Tabelle deshalb
 * noch nicht in `chat_thread_attachments` — und genau von dort holt der
 * Browser die Bytes für Pyodide zurück (`/threads/:id/tabular-files`), nachdem
 * der Wechsel vom Entwurf auf den frischen Thread seinen Speicher geleert hat.
 * Live am 27.10.2026: `tabelle_auswerten` → „Einmal erlauben" →
 * `NameError: name 'df' is not defined`. Ein Reload während der offenen
 * Freigabe verlor die Tabelle ebenso.
 *
 * Run: `npx vitest run routes/chat/streamStages/suspendAttachments.vitest.ts`
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { order, persistMock } = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    persistMock: vi.fn(async () => {
      order.push('persist');
    }),
  };
});

vi.mock('../services/postResponseService.js', () => ({
  persistSuspendedTurnAttachments: persistMock,
}));
vi.mock('../services/toolApprovalStateStore.js', () => ({
  toolApprovalStateStore: { store: vi.fn(async () => true) },
}));
vi.mock('../services/loopClientToolStateStore.js', () => ({
  loopClientToolStateStore: { store: vi.fn(async () => true) },
}));
vi.mock('../services/loopClarificationStateStore.js', () => ({
  loopClarificationStateStore: { store: vi.fn(async () => true) },
}));
vi.mock('../services/pipelineStateStore.js', () => ({
  pipelineStateStore: { store: vi.fn(async () => undefined) },
}));
vi.mock('../services/threadPersistenceService.js', () => ({
  createMessage: vi.fn(async () => undefined),
  finalizeAssistantMessage: vi.fn(async () => true),
  touchThread: vi.fn(async () => undefined),
}));
vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { suspendForLoopClarification } from './clarificationLoopSuspend.js';
import { suspendForLoopClientTool } from './clientToolLoopSuspend.js';
import { suspendForToolApproval } from './toolApprovalSuspend.js';
import { suspendTurn } from './turnEnd.js';

import type { ProcessedAttachmentMeta } from '../services/attachmentProcessingService.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const xlsx: ProcessedAttachmentMeta = {
  name: 'test.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 1234,
  isImage: false,
  extractedText: 'Name;Geburtstag',
  fileData: 'UEsDBA==',
} as ProcessedAttachmentMeta;

const requestContext = {
  userId: 'u1',
  userMessageId: 'user-msg-1',
  processedMeta: [xlsx],
} as never;

function sse(): SSEWriter {
  return {
    send: vi.fn((event: string) => order.push(`sse:${event}`)),
    sendRaw: vi.fn(),
    end: vi.fn(),
  } as unknown as SSEWriter;
}

const common = {
  threadId: 't1',
  classifiedState: { intent: 'agentic' } as never,
  partialText: '',
  priorSteps: [],
  pendingId: 'msg-1',
  startTime: Date.now(),
};

function expectPersistedBeforeInterrupt(): void {
  expect(persistMock).toHaveBeenCalledTimes(1);
  expect(persistMock).toHaveBeenCalledWith(
    't1',
    expect.objectContaining({
      userId: 'u1',
      userMessageId: 'user-msg-1',
      processedMeta: [xlsx],
    })
  );
  expect(order.indexOf('persist')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('persist')).toBeLessThan(order.indexOf('sse:interrupt'));
}

beforeEach(() => {
  order.length = 0;
  persistMock.mockClear();
});

describe('Anhänge eines pausierenden Zuges', () => {
  it('Freigabe: gespeichert, bevor die Karte kommt', async () => {
    await suspendForToolApproval({
      ...common,
      sse: sse(),
      requestContext,
      pendingApproval: [{ toolCallId: 'c1', toolName: 'tabelle_auswerten', args: {} }] as never,
    });
    expectPersistedBeforeInterrupt();
  });

  it('Browser-Werkzeug: gespeichert, bevor der Browser rechnet', async () => {
    await suspendForLoopClientTool({
      ...common,
      sse: sse(),
      requestContext,
      pendingClientTool: {
        toolCallId: 'c1',
        toolName: 'tabelle_auswerten',
        args: {},
        clientToolName: 'run_python',
        clientArgs: { code: 'print(df)' },
      },
    });
    expectPersistedBeforeInterrupt();
  });

  it('Rückfrage aus dem Loop: gespeichert, bevor gefragt wird', async () => {
    await suspendForLoopClarification({
      ...common,
      sse: sse(),
      requestContext,
      pendingAsk: { toolCallId: 'c1', question: 'Welches Blatt?' } as never,
    });
    expectPersistedBeforeInterrupt();
  });

  it('Pre-Loop-Pause (suspendTurn): gespeichert, bevor gefragt wird', async () => {
    await suspendTurn({
      threadId: 't1',
      interrupt: { interruptType: 'clarification', question: 'Welches Blatt?' } as never,
      sse: sse(),
      classifiedState: { intent: 'direct' } as never,
      cleanupPending: vi.fn(async () => undefined),
      userId: 'u1',
      agentId: undefined,
      enabledTools: undefined,
      modelId: undefined,
      isNewThread: true,
      processedMeta: [xlsx],
      userMessageId: 'user-msg-1',
      imageAttachments: [],
      memoryContext: null,
      memoryRetrieveTimeMs: 0,
      validMessages: [],
      forcedTool: false,
      rawDocumentIds: undefined,
      startTime: Date.now(),
    });
    expectPersistedBeforeInterrupt();
  });
});
