/**
 * The generate-title endpoint, called straight on the ts-rest router.
 *
 * Two things are pinned: it must not spend the thread's one title attempt on
 * the streaming placeholder row (content NULL — reading it produced the literal
 * string "null" as the answer), and it must hand the generated title back so
 * the client can show it without a reload. The latter is what names a thread
 * whose first message was only a pasted attachment.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const generateThreadTitle = vi.fn();
vi.mock('../../services/chat/threadTitleService.js', () => ({
  generateThreadTitle: (...args: unknown[]) => generateThreadTitle(...args) as unknown,
}));

vi.mock('../../utils/getAiClient.js', () => ({
  getAiClient: () => ({ processRequest: vi.fn() }),
}));

// The router imports the groups module, which pulls in better-auth — and
// better-auth calls zod 4's `.meta()`, which the repo's deliberate zod 3 pin
// does not have. Unrelated to this endpoint; cut the import chain.
vi.mock('../auth/groups/index.js', () => ({
  getPostgresAndCheckMembership: vi.fn(),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');

const THREAD = 'thread-1';
const req = { user: { id: 'user-1' }, headers: {}, originalUrl: '/x' } as never;

/** Ownership lookup first, then the message read — in that order. */
function withMessages(messages: Array<{ role: string; content: string | null }>) {
  query.mockResolvedValueOnce([{ id: THREAD, user_id: 'user-1' }]).mockResolvedValueOnce(messages);
}

async function callGenerateTitle() {
  const handler = threadsContractRouter.generateTitle as unknown as (args: {
    req: unknown;
    params: { threadId: string };
  }) => Promise<{ status: number; body: Record<string, unknown> }>;
  return handler({ req, params: { threadId: THREAD } });
}

beforeEach(() => {
  query.mockReset();
  generateThreadTitle.mockReset().mockResolvedValue('Haushalt 2027');
});

describe('generateTitle endpoint', () => {
  it('waits instead of naming the thread from the empty placeholder row', async () => {
    // createPendingAssistantMessage inserts this row with content NULL before
    // the model runs. persistAssistantResponse names the thread once the turn
    // is finalized, so skipping here costs nothing.
    withMessages([
      { role: 'user', content: 'Was steht im Haushalt?' },
      { role: 'assistant', content: null },
    ]);

    const res = await callGenerateTitle();

    expect(res.body.status).toBe('skipped');
    expect(generateThreadTitle).not.toHaveBeenCalled();
  });

  it('returns the generated title so the sidebar can show it right away', async () => {
    withMessages([
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Der Haushalt 2027 sieht Mehrausgaben für Radwege vor.' },
    ]);

    const res = await callGenerateTitle();

    expect(res.body).toMatchObject({ status: 'accepted', title: 'Haushalt 2027' });
  });

  it('answers with a null title when the thread was renamed meanwhile', async () => {
    generateThreadTitle.mockResolvedValue(null);
    withMessages([
      { role: 'user', content: 'Frage' },
      { role: 'assistant', content: 'Eine ausreichend lange Antwort auf die Frage.' },
    ]);

    const res = await callGenerateTitle();

    expect(res.body).toMatchObject({ status: 'accepted', title: null });
  });
});
