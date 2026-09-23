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
vi.mock('./services/threadPersistenceService.js', () => ({
  getUser: (req: { user?: unknown }) => req.user,
  createThread: (...args: unknown[]) => createThread(...args),
  createMessage: (...args: unknown[]) => createMessage(...args),
  touchThread: vi.fn(async () => {}),
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

await import('./notebookStreamController.js');

type Mw = (req: unknown, res: unknown, next: () => void) => void;
type Handler = (req: unknown, res: unknown) => Promise<void>;
const handler = stack.at(-1) as Handler;
const validate = stack.at(-2) as Mw;

const USER_NB = '0b1c29c9-9823-4794-b1be-70a36f801791';

async function post(body: Record<string, unknown>) {
  const req = {
    body: {
      messages: [{ role: 'user', content: 'Wie viele Quellen liegen hier?' }],
      collectionIds: [USER_NB],
      ...body,
    },
    user: { id: 'user-1', locale: 'de-DE', memory_enabled: false },
    on: vi.fn(),
  };
  const res = { status: () => res, json: () => res, on: vi.fn(), headersSent: true };
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
      toolCalls: [{ toolCallId: 'c1', toolName: 'notebook_quellen', args: {}, result: {} }],
    });
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
