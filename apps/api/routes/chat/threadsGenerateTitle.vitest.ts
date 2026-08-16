/**
 * The generate-title endpoint, called straight on the ts-rest router.
 *
 * Two things are pinned: it must not spend the thread's one title attempt on
 * the streaming placeholder row (content NULL — reading it produced the literal
 * string "null" as the answer), and it must hand the generated title back so
 * the client can show it without a reload. The latter is what names a thread
 * whose first message was only a pasted attachment.
 */

import { generateTitleResponseSchema, type GenerateTitleResponse } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const generateThreadTitle = vi.fn();
const threadNeedsTitle = vi.fn();
vi.mock('../../services/chat/threadTitleService.js', () => ({
  generateThreadTitle: (...args: unknown[]) => generateThreadTitle(...args) as unknown,
  threadNeedsTitle: (...args: unknown[]) => threadNeedsTitle(...args) as unknown,
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
const req = { user: { id: 'user-1' }, headers: {}, originalUrl: '/x' } as unknown as Request;

/** Ownership lookup first, then the message read — in that order. */
function withMessages(messages: Array<{ role: string; content: string | null }>) {
  query.mockResolvedValueOnce([{ id: THREAD, user_id: 'user-1' }]).mockResolvedValueOnce(messages);
}

/**
 * ts-rest hands a handler the full express-shaped args object; a test can only
 * synthesize the parts this endpoint reads. Hence one boundary cast — and the
 * body is then parsed with the contract's own schema, so an answer that drifts
 * from `generateTitleResponseSchema` fails here rather than at a client.
 */
async function callGenerateTitle(): Promise<GenerateTitleResponse> {
  const handler = threadsContractRouter.generateTitle as unknown as (args: {
    req: Request;
    params: { threadId: string };
  }) => Promise<{ status: number; body: unknown }>;
  const res = await handler({ req, params: { threadId: THREAD } });
  expect(res.status).toBe(202);
  return generateTitleResponseSchema.parse(res.body);
}

beforeEach(() => {
  query.mockReset();
  generateThreadTitle.mockReset().mockResolvedValue('Haushalt 2027');
  threadNeedsTitle.mockReset().mockResolvedValue(true);
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

    const body = await callGenerateTitle();

    expect(body.status).toBe('skipped');
    expect(generateThreadTitle).not.toHaveBeenCalled();
  });

  it('returns the generated title so the sidebar can show it right away', async () => {
    withMessages([
      { role: 'user', content: '' },
      { role: 'assistant', content: 'Der Haushalt 2027 sieht Mehrausgaben für Radwege vor.' },
    ]);

    const body = await callGenerateTitle();

    expect(body).toMatchObject({ status: 'accepted', title: 'Haushalt 2027' });
  });

  it('leaves a thread alone that somebody has named', async () => {
    // Only reachable because the client no longer PATCHes its own heuristic
    // title: a title in this row is now genuinely one somebody chose.
    threadNeedsTitle.mockResolvedValue(false);
    withMessages([
      { role: 'user', content: 'Frage' },
      { role: 'assistant', content: 'Eine ausreichend lange Antwort auf die Frage.' },
    ]);

    const body = await callGenerateTitle();

    expect(body).toMatchObject({ status: 'skipped', title: null });
    expect(generateThreadTitle).not.toHaveBeenCalled();
  });

  it('answers with a null title when the thread was renamed meanwhile', async () => {
    generateThreadTitle.mockResolvedValue(null);
    withMessages([
      { role: 'user', content: 'Frage' },
      { role: 'assistant', content: 'Eine ausreichend lange Antwort auf die Frage.' },
    ]);

    const body = await callGenerateTitle();

    expect(body).toMatchObject({ status: 'accepted', title: null });
  });
});
