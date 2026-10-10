/**
 * Der Controller der Notebook-Seite: welcher Antwortmodus läuft, was davon
 * auf der Leitung steht (`answer_mode`) und was mit der Antwort gespeichert
 * wird. Pipeline und Präzisions-Turn sind Attrappen — sie haben eigene Tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const stack: unknown[] = [];
vi.mock('../../utils/keycloak/index.js', () => ({
  createAuthenticatedRouter: () => ({
    post: (_path: string, ...rest: unknown[]) => stack.push(...rest),
  }),
}));
vi.mock('../../middleware/requireAiConsent.js', () => ({ requireAiConsent: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('../../services/memory/index.js', () => ({
  memoryService: { list: vi.fn(async () => []) },
}));

const sent: Array<{ event: string; data: Record<string, unknown> }> = [];
const fakeSse = {
  send: (event: string, data: Record<string, unknown>) => sent.push({ event, data }),
  isEnded: () => false,
  end: vi.fn(),
  setTextListener: vi.fn(),
  attachRecorder: vi.fn(),
  disableRecording: vi.fn(),
};
vi.mock('./services/sseHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createSSEStream: () => fakeSse,
}));

const canWriteThread = vi.fn(async (..._args: unknown[]) => true);
vi.mock('./services/threadAccessService.js', () => ({
  canWriteThread: (...args: unknown[]) => canWriteThread(...args),
}));

const createThread = vi.fn(async (..._args: unknown[]) => ({ id: 'thread-1' }));
const createMessage = vi.fn(async (..._args: unknown[]) => ({}));
// No placeholder by default: the turn then persists through createMessage.
const createPendingAssistantMessage = vi.fn(async (..._args: unknown[]): Promise<string> => {
  throw new Error('no placeholder');
});
const finalizeAssistantMessage = vi.fn(async (..._args: unknown[]) => true);
vi.mock('./services/threadPersistenceService.js', () => ({
  getUser: (req: { user?: unknown }) => req.user,
  createThread: (...args: unknown[]) => createThread(...args),
  createMessage: (...args: unknown[]) => createMessage(...args),
  createPendingAssistantMessage: (...args: unknown[]) => createPendingAssistantMessage(...args),
  finalizeAssistantMessage: (...args: unknown[]) => finalizeAssistantMessage(...args),
  deleteEmptyStreamingRows: vi.fn(async () => {}),
  discardPendingAssistantIfEmpty: vi.fn(async () => {}),
  touchThread: vi.fn(async () => {}),
}));
vi.mock('./services/pendingAssistantWriter.js', () => ({
  createPendingAssistantWriter: () => ({ onText: vi.fn(), stop: vi.fn(async () => {}) }),
}));

const recorder = { record: vi.fn(), finish: vi.fn(async () => {}) };
const startStreamRecorder = vi.fn(async (..._args: unknown[]): Promise<unknown> => null);
vi.mock('../../services/chat/resumableStreams.js', () => ({
  startStreamRecorder: (...args: unknown[]) => startStreamRecorder(...args),
}));

const handleNotebookStream = vi.fn(async (..._args: unknown[]) => ({
  answer: 'RAG-Antwort [cite:1]',
  citations: [{ index: '1' }],
  sources: [{ document_id: 'd1' }],
  question: 'Frage?',
  traceId: null,
}));
vi.mock('./notebookStreamCore.js', () => ({
  handleNotebookStream: (...args: unknown[]) => handleNotebookStream(...args),
}));

const runNotebookPraezisionTurn = vi.fn(async (..._args: unknown[]) => ({
  answer: 'Loop-Antwort [1]',
  citations: [{ index: '1' }],
  sources: [{ document_id: 'd1' }],
  question: 'Frage?',
  traceId: 't'.repeat(32),
  steps: [{ toolCallId: 'c1', toolName: 'notebook_quellen', args: {}, result: {} }],
  degraded: null,
}));
vi.mock('./services/notebookPraezisionTurn.js', () => ({
  runNotebookPraezisionTurn: (...args: unknown[]) => runNotebookPraezisionTurn(...args),
}));

const aiText = vi.fn(async (..._args: unknown[]) => 'praezision');
vi.mock('../../services/ai/generate.js', () => ({
  aiText: (...args: unknown[]) => aiText(...args),
}));

await import('./notebookStreamController.js');

type Mw = (req: unknown, res: unknown, next: () => void) => void;
type Handler = (req: unknown, res: unknown) => Promise<void>;
const handler = stack.at(-1) as Handler;
const validate = stack.at(-2) as Mw;

const USER_NB = '0b1c29c9-9823-4794-b1be-70a36f801791';

async function post(
  body: Record<string, unknown>,
  reqOverrides: Record<string, unknown> = {},
  resOverrides: Record<string, unknown> = {}
) {
  const req = {
    body: {
      messages: [{ role: 'user', content: 'Wie viele Quellen liegen hier?' }],
      collectionIds: [USER_NB],
      ...body,
    },
    user: { id: 'user-1', locale: 'de-DE', memory_enabled: false },
    on: vi.fn(),
    ...reqOverrides,
  };
  const res = {
    status: () => res,
    json: () => res,
    on: vi.fn(),
    headersSent: true,
    writableEnded: false,
    ...resOverrides,
  };
  let passed = false;
  validate(req, res, () => {
    passed = true;
  });
  expect(passed).toBe(true);
  await handler(req, res);
}

function persistedAssistantMetadata(): Record<string, unknown> {
  const call = createMessage.mock.calls.find((c) => c[1] === 'assistant');
  return call![3] as Record<string, unknown>;
}

beforeEach(() => {
  sent.length = 0;
  vi.clearAllMocks();
  canWriteThread.mockResolvedValue(true);
});

describe('POST /api/chat-service/notebook/stream — answer mode', () => {
  it('runs the RAG pipeline without a mode and says so on the wire and in the row', async () => {
    await post({});
    expect(runNotebookPraezisionTurn).not.toHaveBeenCalled();
    const options = handleNotebookStream.mock.calls[0]![0] as Record<string, unknown>;
    expect(options.completionMetadata).toEqual({ answerMode: 'chat', answerModeReason: 'default' });
    expect(sent.find((e) => e.event === 'answer_mode')!.data).toEqual({
      requested: null,
      resolved: 'chat',
      reason: 'default',
    });
    expect(persistedAssistantMetadata()).toEqual({
      type: 'notebook',
      citations: [{ index: '1' }],
      sources: [{ document_id: 'd1' }],
      answerMode: 'chat',
      answerModeReason: 'default',
    });
  });

  it('runs the precision turn on the page notebooks and persists its tool calls', async () => {
    await post({ answerMode: 'praezision' });
    expect(handleNotebookStream).not.toHaveBeenCalled();
    const params = runNotebookPraezisionTurn.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({
      collectionIds: [USER_NB],
      userId: 'user-1',
      userLocale: 'de-DE',
      threadId: 'thread-1',
      answerModeReason: 'explicit',
    });
    expect(persistedAssistantMetadata()).toEqual({
      type: 'notebook',
      citations: [{ index: '1' }],
      sources: [{ document_id: 'd1' }],
      traceId: 't'.repeat(32),
      answerMode: 'praezision',
      answerModeReason: 'explicit',
      toolCalls: [{ toolCallId: 'c1', toolName: 'notebook_quellen', args: {}, result: {} }],
    });
  });

  it('takes de-AT from the X-User-Locale header when the profile has no country', async () => {
    await post(
      { answerMode: 'praezision' },
      {
        user: { id: 'user-1', memory_enabled: false },
        headers: { 'x-user-locale': 'de-AT' },
      }
    );
    const params = runNotebookPraezisionTurn.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.userLocale).toBe('de-AT');
  });

  it('announces the mode before the answer starts', async () => {
    await post({ answerMode: 'praezision' });
    const events = sent.map((e) => e.event);
    expect(events.indexOf('answer_mode')).toBe(events.indexOf('thread_created') + 1);
  });

  it('falls back to chat with a warning when the page has nothing the loop can read', async () => {
    await post({ answerMode: 'praezision', collectionIds: ['oesterreich-notebook'] });
    expect(runNotebookPraezisionTurn).not.toHaveBeenCalled();
    expect(sent.find((e) => e.event === 'warning')!.data.code).toBe(
      'notebook_praezision_unavailable'
    );
    expect(sent.find((e) => e.event === 'answer_mode')!.data).toMatchObject({
      resolved: 'chat',
      reason: 'ineligible',
    });
    expect(persistedAssistantMetadata().answerMode).toBe('chat');
  });

  it('runs a tool ask in auto straight to precision, without the guard', async () => {
    await post({ answerMode: 'auto' });
    expect(aiText).not.toHaveBeenCalled();
    expect(sent.find((e) => e.event === 'answer_mode')!.data).toEqual({
      requested: 'auto',
      resolved: 'praezision',
      reason: 'pregate',
    });
    expect(persistedAssistantMetadata()).toMatchObject({
      answerMode: 'praezision',
      answerModeReason: 'pregate',
    });
  });

  it('hands the guard the question and the previous exchange with its mode', async () => {
    await post({
      answerMode: 'auto',
      messages: [
        { role: 'user', content: 'Liste die neuesten Quellen auf.' },
        { role: 'assistant', content: '1. A 2. B', answerMode: 'praezision' },
        { role: 'user', content: 'Und was steht in der zweiten?' },
      ],
    });
    const prompt = (aiText.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(prompt).toContain('Nutzer*in: Liste die neuesten Quellen auf.');
    expect(prompt).toContain('Antwort (Modus: praezision): 1. A 2. B');
    expect(prompt).toContain('Letzte Nachricht: "Und was steht in der zweiten?"');
    expect(runNotebookPraezisionTurn.mock.calls[0]![0]).toMatchObject({
      answerModeReason: 'guard',
    });
  });

  it('tolerates an unknown answer mode on a history entry', async () => {
    await post({
      messages: [
        { role: 'assistant', content: 'A', answerMode: 'turbo' },
        { role: 'user', content: 'Frage?' },
      ],
    });
    expect(handleNotebookStream).toHaveBeenCalled();
  });

  it('rejects an unknown mode at the contract', async () => {
    const req = { body: { answerMode: 'turbo' }, user: { id: 'user-1' } };
    let status = 0;
    const res = {
      status: (code: number) => {
        status = code;
        return res;
      },
      json: () => res,
    };
    validate(req, res, () => {});
    expect(status).toBe(400);
  });
});

describe('POST /api/chat-service/notebook/stream — source tier', () => {
  it('hands the source tier to the RAG pipeline and omits it when absent', async () => {
    await post({ sourceTier: 'documents-first' });
    expect((handleNotebookStream.mock.calls[0]![0] as Record<string, unknown>).sourceTier).toBe(
      'documents-first'
    );
    vi.clearAllMocks();
    await post({});
    expect(handleNotebookStream.mock.calls[0]![0]).not.toHaveProperty('sourceTier');
  });

  it('rejects an unknown source tier at the contract', async () => {
    const req = { body: { sourceTier: 'turbo' }, user: { id: 'user-1' } };
    let status = 0;
    const res = {
      status: (code: number) => {
        status = code;
        return res;
      },
      json: () => res,
    };
    validate(req, res, () => {});
    expect(status).toBe(400);
  });
});

describe('POST /api/chat-service/notebook/stream — thread ownership', () => {
  it('never reuses a thread the user cannot write, in either branch', async () => {
    canWriteThread.mockResolvedValue(false);
    await post({ answerMode: 'praezision', threadId: 'foreign-thread' });
    expect(canWriteThread).toHaveBeenCalledWith('foreign-thread', 'user-1');
    expect(createThread).toHaveBeenCalled();
    const params = runNotebookPraezisionTurn.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.threadId).toBe('thread-1');
    expect(createMessage.mock.calls.every((c) => c[0] === 'thread-1')).toBe(true);

    vi.clearAllMocks();
    canWriteThread.mockResolvedValue(false);
    await post({ threadId: 'foreign-thread' });
    expect(createThread).toHaveBeenCalled();
    expect(createMessage.mock.calls.every((c) => c[0] === 'thread-1')).toBe(true);
  });

  it("reuses the user's own thread", async () => {
    await post({ answerMode: 'praezision', threadId: 'own-thread' });
    expect(createThread).not.toHaveBeenCalled();
    const params = runNotebookPraezisionTurn.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.threadId).toBe('own-thread');
  });
});

describe('POST /api/chat-service/notebook/stream — resumable turn', () => {
  it('fills the placeholder row instead of inserting a second answer row', async () => {
    createPendingAssistantMessage.mockResolvedValueOnce('pending-1');
    await post({});
    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      'pending-1',
      'RAG-Antwort [cite:1]',
      expect.objectContaining({ type: 'notebook' })
    );
    expect(createMessage.mock.calls.some((c) => c[1] === 'assistant')).toBe(false);
  });

  it('stops only on cancel, not on disconnect, once the turn is recorded', async () => {
    createPendingAssistantMessage.mockResolvedValueOnce('pending-1');
    startStreamRecorder.mockResolvedValueOnce(recorder);
    await post({});
    expect(fakeSse.attachRecorder).toHaveBeenCalledWith(recorder, 'pending-1');
    const params = handleNotebookStream.mock.calls[0]![0] as Record<string, unknown>;
    expect(params.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('keeps aborting on disconnect when the turn cannot be recorded', async () => {
    createPendingAssistantMessage.mockResolvedValueOnce('pending-1');
    const onClose: Array<() => void> = [];
    await post(
      { answerMode: 'praezision' },
      {},
      { on: (ev: string, fn: () => void) => ev === 'close' && onClose.push(fn) }
    );
    const params = runNotebookPraezisionTurn.mock.calls[0]![0] as { abortSignal: AbortSignal };
    onClose.forEach((fn) => fn());
    expect(params.abortSignal.aborted).toBe(true);
  });

  it('ignores a disconnect once the turn is recorded', async () => {
    createPendingAssistantMessage.mockResolvedValueOnce('pending-1');
    startStreamRecorder.mockResolvedValueOnce(recorder);
    const onClose: Array<() => void> = [];
    await post({}, {}, { on: (ev: string, fn: () => void) => ev === 'close' && onClose.push(fn) });
    const params = handleNotebookStream.mock.calls[0]![0] as { abortSignal: AbortSignal };
    onClose.forEach((fn) => fn());
    expect(params.abortSignal.aborted).toBe(false);
  });

  it('drops the answer when its placeholder vanished instead of re-inserting it', async () => {
    createPendingAssistantMessage.mockResolvedValueOnce('pending-1');
    finalizeAssistantMessage.mockResolvedValueOnce(false);
    await post({});
    expect(createMessage.mock.calls.some((c) => c[1] === 'assistant')).toBe(false);
  });
});
