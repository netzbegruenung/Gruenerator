/**
 * The comment routers: /api/comments answers straight from the service, and
 * the legacy agent and Vorlagen routers (shipped mobile binaries) delegate to
 * the same service with their item type, in their old response shapes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const m = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../../services/entityComments/entityCommentsService.js', () => ({
  listEntityComments: m.list,
  createEntityComment: m.create,
  deleteEntityComment: m.remove,
}));

const { entityCommentsContractRouter } = await import('./entityCommentsContractRouter.js');
const { agentCommentsContractRouter } =
  await import('../agentComments/agentCommentsContractRouter.js');
const { templateCommentsContractRouter } =
  await import('../templateComments/templateCommentsContractRouter.js');

type Result = { status: number; body: unknown };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const handler = (router: object, name: string) =>
  (router as Record<string, unknown>)[name] as Handler;
const req = { user: { id: 'viewer' } } as unknown as Request;

const COMMENT = {
  id: 'c1',
  entityType: 'agent',
  entityId: 'gruenerator-universal',
  parentId: null,
  userId: 'u2',
  authorName: 'Ben',
  body: 'Hallo',
  createdAt: '2026-10-20T10:00:00.000Z',
  reactions: [{ emoji: '👍', count: 1, reacted: false }],
};
const ITEM_REACTIONS = [{ emoji: '🎉', count: 2, reacted: true }];

beforeEach(() => {
  vi.clearAllMocks();
  m.list.mockResolvedValue({
    status: 200,
    data: { reactions: ITEM_REACTIONS, comments: [COMMENT] },
  });
  m.create.mockResolvedValue({ status: 201, data: COMMENT });
  m.remove.mockResolvedValue({ status: 200, data: null });
});

describe('/api/comments', () => {
  const params = { entityType: 'studio_asset', entityId: 's1' };

  it('lists comments with the item reactions', async () => {
    const res = await handler(entityCommentsContractRouter, 'listEntityComments')({ req, params });
    expect(res).toEqual({
      status: 200,
      body: { success: true, reactions: ITEM_REACTIONS, comments: [COMMENT] },
    });
    expect(m.list).toHaveBeenCalledWith('studio_asset', 's1', 'viewer');
  });

  it('passes a missing parentId on as null', async () => {
    const res = await handler(
      entityCommentsContractRouter,
      'createEntityComment'
    )({ req, params, body: { body: 'Hallo' } });
    expect(res).toEqual({ status: 201, body: { success: true, comment: COMMENT } });
    expect(m.create).toHaveBeenCalledWith({
      entityType: 'studio_asset',
      entityId: 's1',
      userId: 'viewer',
      body: 'Hallo',
      parentId: null,
    });
  });

  it('maps a service refusal to its status and message', async () => {
    m.remove.mockResolvedValue({ status: 403, message: 'Nein.' });
    const res = await handler(
      entityCommentsContractRouter,
      'deleteEntityComment'
    )({ req, params: { ...params, commentId: 'c1' } });
    expect(res).toEqual({ status: 403, body: { success: false, message: 'Nein.' } });
  });

  it('500 when the service throws', async () => {
    m.list.mockRejectedValue(new Error('db down'));
    const res = await handler(entityCommentsContractRouter, 'listEntityComments')({ req, params });
    expect(res.status).toBe(500);
  });
});

describe('legacy routers', () => {
  it('agent comments delegate with entity type agent and keep agentId', async () => {
    const res = await handler(
      agentCommentsContractRouter,
      'listAgentComments'
    )({ req, params: { agentId: 'gruenerator-universal' } });
    expect(m.list).toHaveBeenCalledWith('agent', 'gruenerator-universal', 'viewer');
    const { entityType: _type, entityId, ...rest } = COMMENT;
    expect(res).toEqual({
      status: 200,
      body: {
        success: true,
        reactions: ITEM_REACTIONS,
        comments: [{ ...rest, agentId: entityId }],
      },
    });
  });

  it('template comments delegate with entity type template, without item reactions', async () => {
    m.list.mockResolvedValue({
      status: 200,
      data: { reactions: ITEM_REACTIONS, comments: [{ ...COMMENT, entityType: 'template' }] },
    });
    const res = await handler(
      templateCommentsContractRouter,
      'listTemplateComments'
    )({ req, params: { templateId: 'kat-1' } });
    expect(m.list).toHaveBeenCalledWith('template', 'kat-1', 'viewer');
    const { entityType: _type, entityId, ...rest } = COMMENT;
    expect(res).toEqual({
      status: 200,
      body: { success: true, comments: [{ ...rest, templateId: entityId }] },
    });
  });

  it('deleting through the legacy routes uses the same service', async () => {
    await handler(
      templateCommentsContractRouter,
      'deleteTemplateComment'
    )({ req, params: { templateId: 'kat-1', commentId: 'c1' } });
    expect(m.remove).toHaveBeenCalledWith({
      entityType: 'template',
      entityId: 'kat-1',
      commentId: 'c1',
      userId: 'viewer',
    });
  });
});
