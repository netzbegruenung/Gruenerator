/**
 * Notebook Streaming Controller
 * Authenticated endpoint for notebook Q&A streaming.
 * Delegates to the shared notebookStreamCore for SSE streaming logic.
 */

import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';

import { handleNotebookStream, sendSSE } from './notebookStreamCore.js';

import type { UserProfile } from '../../services/user/types.js';
import type express from 'express';

const router = createAuthenticatedRouter();

const getUser = (req: express.Request): UserProfile | undefined =>
  (req as any).user as UserProfile | undefined;

/**
 * POST /api/chat-service/notebook/stream
 * Stream answers to notebook questions with sources/citations
 */
router.post('/', async (req, res) => {
  const user = getUser(req);
  if (!user?.id) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    sendSSE(res, 'error', { error: 'Unauthorized' });
    res.end();
    return;
  }

  const { messages, collectionId, collectionIds, filters, provider, model, mode } = req.body;

  await handleNotebookStream({
    req,
    res,
    messages,
    collectionId,
    collectionIds,
    filters,
    provider,
    model,
    mode,
    userId: user.id,
    allowUserCollections: true,
  });
});

export default router;
