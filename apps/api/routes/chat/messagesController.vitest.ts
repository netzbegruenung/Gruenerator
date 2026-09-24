/**
 * Reload eines Threads: der Antwortmodus einer Notebook-Antwort muss aus der
 * gespeicherten Metadata zurückkommen, sonst fehlt der Modus-Chip nach dem
 * Neuladen.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gets: unknown[] = [];
vi.mock('../../utils/keycloak/index.js', () => ({
  createAuthenticatedRouter: () => ({
    get: (_path: string, ...rest: unknown[]) => gets.push(...rest),
    delete: () => {},
  }),
}));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));
vi.mock('./services/threadAccessService.js', () => ({ canAccessThread: async () => true }));
vi.mock('./services/threadPersistenceService.js', () => ({
  getUser: (req: { user?: unknown }) => req.user,
}));

await import('./messagesController.js');

type Handler = (req: unknown, res: unknown) => Promise<void>;
const handler = gets.at(-1) as Handler;

async function load(toolResults: Record<string, unknown>) {
  query.mockResolvedValueOnce([
    {
      id: 'm1',
      role: 'assistant',
      content: 'Antwort [1]',
      tool_calls: null,
      tool_results: toolResults,
      user_id: null,
      status: 'complete',
      created_at: '2026-09-23T10:00:00Z',
      attachments: [],
    },
  ]);
  let body: unknown;
  const res = {
    status: () => res,
    json: (b: unknown) => {
      body = b;
      return res;
    },
  };
  await handler({ query: { threadId: 't1' }, user: { id: 'u1' } }, res);
  return (body as Array<{ metadata: Record<string, unknown> }>)[0]!.metadata;
}

beforeEach(() => {
  query.mockReset();
});

describe('GET /api/chat-service/messages — notebook answer mode', () => {
  it('passes the persisted answer mode through', async () => {
    const meta = await load({
      type: 'notebook',
      citations: [],
      answerMode: 'praezision',
      answerModeReason: 'guard',
      toolCalls: [{ toolCallId: 'c1', toolName: 'notebook_quellen', args: {}, result: {} }],
    });
    expect(meta.answerMode).toBe('praezision');
    expect(meta.answerModeReason).toBe('guard');
    expect(meta.toolCalls).toHaveLength(1);
  });

  it('drops a value that is not a resolved mode', async () => {
    expect(await load({ type: 'notebook', answerMode: 'auto' })).not.toHaveProperty('answerMode');
    expect(await load({ type: 'notebook' })).not.toHaveProperty('answerMode');
    expect(
      await load({ type: 'notebook', answerMode: 'chat', answerModeReason: 'erraten' })
    ).not.toHaveProperty('answerModeReason');
  });
});

describe('GET /api/chat-service/messages — attachment preview', () => {
  it('strips the page markers a PDF attachment carries for the model', async () => {
    query.mockResolvedValueOnce([
      {
        id: 'm1',
        role: 'user',
        content: 'Was steht drin?',
        tool_calls: null,
        tool_results: null,
        user_id: 'u1',
        status: 'complete',
        created_at: '2026-09-23T10:00:00Z',
        attachments: [
          {
            id: 'a1',
            name: 'antrag.pdf',
            contentType: 'application/pdf',
            preview: '## Seite 1\n\nPräambel\n\n## Seite 2\n\nBeschluss',
            truncated: false,
            pageCount: 2,
          },
        ],
      },
    ]);
    let body: unknown;
    const res = {
      status: () => res,
      json: (b: unknown) => {
        body = b;
        return res;
      },
    };
    await handler({ query: { threadId: 't1' }, user: { id: 'u1' } }, res);

    const [message] = body as Array<{ attachments: Array<{ preview: string }> }>;
    expect(message!.attachments[0]!.preview).toBe('Präambel\n\nBeschluss');
  });
});
