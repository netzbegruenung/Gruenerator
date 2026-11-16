/**
 * Team chats: a project member who is not the thread's owner reads the
 * thread's settings, tabular files and summary state through
 * `threadAccessService` (the one place that knows owner / share / group rules),
 * not through a `chat_threads.user_id` comparison. Strangers stay refused with
 * the same status and body as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const canAccessThread = vi.fn();
const getThreadAccessLevel = vi.fn();
vi.mock('./services/threadAccessService.js', () => ({
  canAccessThread: (...a: unknown[]) => canAccessThread(...a) as unknown,
  getThreadAccessLevel: (...a: unknown[]) => getThreadAccessLevel(...a) as unknown,
}));

const getThreadSettings = vi.fn();
const updateThreadSettings = vi.fn();
vi.mock('./services/threadPersistenceService.js', () => ({
  getThreadSettings: (...a: unknown[]) => getThreadSettings(...a) as unknown,
  updateThreadSettings: (...a: unknown[]) => updateThreadSettings(...a) as unknown,
  insertThreadWithSlugRetry: vi.fn(),
  getUser: (req: { user?: { id: string } }) => req.user,
}));

const getThreadTabularFiles = vi.fn();
vi.mock('./services/attachmentPersistenceService.js', () => ({
  getThreadTabularFiles: (...a: unknown[]) => getThreadTabularFiles(...a) as unknown,
}));

vi.mock('./services/compactionService.js', () => ({
  getCompactionState: vi.fn().mockResolvedValue({
    summary: null,
    compactedUpToMessageId: null,
    compactionUpdatedAt: null,
  }),
  getCompactionTokenThreshold: () => 1000,
  getMessageCount: vi.fn().mockResolvedValue(3),
  getTailTokenBudget: () => 100,
}));

vi.mock('../../utils/keycloak/index.js', async () => {
  const { Router } = await import('express');
  return { createAuthenticatedRouter: () => Router() };
});
vi.mock('../../middleware/requireAiConsent.js', () => ({
  requireAiConsent: (_q: unknown, _r: unknown, n: () => void) => n(),
}));
vi.mock('../auth/groups/index.js', () => ({ getPostgresAndCheckMembership: vi.fn() }));
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');
const summarizeRouter = (await import('./summarizeController.js')).default;

const THREAD = 'thread-1';
const MEMBER = 'member-1';
const req = { user: { id: MEMBER }, headers: {}, originalUrl: '/x' } as unknown as Request;

type Handler = (args: {
  req: Request;
  params: { threadId: string };
  body?: unknown;
}) => Promise<{ status: number; body: unknown }>;

const call = (name: 'getSettings' | 'updateSettings' | 'getTabularFiles', body?: unknown) =>
  (threadsContractRouter[name] as unknown as Handler)({
    req,
    params: { threadId: THREAD },
    body,
  });

/** Existence lookup: the thread is owned by somebody else. */
function threadOwnedByOther() {
  query.mockResolvedValue([{ user_id: 'owner-1' }]);
}

async function callSummarize(method: 'get' | 'post') {
  type Layer = {
    route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
  };
  const layer = (summarizeRouter as unknown as { stack: Layer[] }).stack.find(
    (l) => l.route?.path === '/' && l.route.methods[method]
  );
  const handlers = layer!.route!.stack.map((s) => s.handle as (...a: unknown[]) => unknown);
  const handler = handlers[handlers.length - 1];
  const out: { status: number; json: unknown } = { status: 200, json: null };
  const res = {
    status(s: number) {
      out.status = s;
      return res;
    },
    json(b: unknown) {
      out.json = b;
      return res;
    },
  } as unknown as Response;
  const r = {
    user: { id: MEMBER },
    query: { threadId: THREAD },
    body: { threadId: THREAD },
    headers: {},
  };
  await handler(r, res, () => undefined);
  return out;
}

beforeEach(() => {
  query.mockReset();
  canAccessThread.mockReset();
  getThreadAccessLevel.mockReset();
  getThreadSettings.mockReset().mockResolvedValue({
    custom_system_prompt: 'p',
    custom_enabled_tools: null,
    role_ref: null,
  });
  updateThreadSettings.mockReset().mockResolvedValue(true);
  getThreadTabularFiles.mockReset().mockResolvedValue([]);
});

describe('GET settings', () => {
  it('lets a member with access read a thread owned by someone else', async () => {
    threadOwnedByOther();
    canAccessThread.mockResolvedValue(true);
    const res = await call('getSettings');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ customSystemPrompt: 'p' });
  });

  it('refuses a stranger with 403', async () => {
    threadOwnedByOther();
    canAccessThread.mockResolvedValue(false);
    expect((await call('getSettings')).status).toBe(403);
  });

  it('still answers 404 for a missing thread', async () => {
    query.mockResolvedValue([]);
    expect((await call('getSettings')).status).toBe(404);
  });

  it('keeps the owner working', async () => {
    query.mockResolvedValue([{ user_id: MEMBER }]);
    canAccessThread.mockResolvedValue(true);
    expect((await call('getSettings')).status).toBe(200);
  });
});

describe('PUT settings', () => {
  it('lets the owner change them', async () => {
    getThreadAccessLevel.mockResolvedValue('owner');
    const res = await call('updateSettings', { customSystemPrompt: 'x' });
    expect(res.status).toBe(200);
    expect(updateThreadSettings).toHaveBeenCalled();
  });

  it('refuses a member with write access: settings stay with the owner', async () => {
    getThreadAccessLevel.mockResolvedValue('write');
    const res = await call('updateSettings', { customSystemPrompt: 'x' });
    expect(res.status).toBe(404);
    expect(updateThreadSettings).not.toHaveBeenCalled();
  });
});

describe('GET tabular-files', () => {
  it('lets a member with access read the thread files', async () => {
    threadOwnedByOther();
    canAccessThread.mockResolvedValue(true);
    const res = await call('getTabularFiles');
    expect(res.status).toBe(200);
    expect(getThreadTabularFiles).toHaveBeenCalledWith(THREAD);
  });

  it('refuses a stranger with 403', async () => {
    threadOwnedByOther();
    canAccessThread.mockResolvedValue(false);
    expect((await call('getTabularFiles')).status).toBe(403);
    expect(getThreadTabularFiles).not.toHaveBeenCalled();
  });

  it('keeps the owner working', async () => {
    query.mockResolvedValue([{ user_id: MEMBER }]);
    canAccessThread.mockResolvedValue(true);
    expect((await call('getTabularFiles')).status).toBe(200);
  });
});

describe.each(['get', 'post'] as const)('summarize %s', (method) => {
  it('lets a member with access read the compaction state', async () => {
    threadOwnedByOther();
    canAccessThread.mockResolvedValue(true);
    const out = await callSummarize(method);
    expect(out.status).toBe(200);
  });

  it('refuses a stranger with 403', async () => {
    threadOwnedByOther();
    canAccessThread.mockResolvedValue(false);
    const out = await callSummarize(method);
    expect(out.status).toBe(403);
    expect(out.json).toEqual({ error: 'Forbidden' });
  });

  it('still answers 404 for a missing thread', async () => {
    query.mockResolvedValue([]);
    expect((await callSummarize(method)).status).toBe(404);
  });

  it('keeps the owner working', async () => {
    query.mockResolvedValue([{ user_id: MEMBER }]);
    canAccessThread.mockResolvedValue(true);
    expect((await callSummarize(method)).status).toBe(200);
  });
});
