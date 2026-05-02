/**
 * Resolves the shared chat thread for a collaborative document. One thread per
 * doc, shared across all collaborators. The thread row carries doc_id (added by
 * migration add_chat_threads_doc_id) so this endpoint is idempotent — calling it
 * repeatedly always returns the same thread UUID.
 */

import { Router, type Response } from 'express';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { type AuthRequest } from '../auth/types.js';
import { ensureDocChatThread } from '../chat/services/threadPersistenceService.js';

import { checkDocumentAccess } from './documentAccess.js';
import { type CollaborativeDocument } from './types.js';

const router = Router();

router.get('/:docId/chat-thread', async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const docIdParam = req.params.docId;
  const docId = Array.isArray(docIdParam) ? docIdParam[0] : docIdParam;
  if (!docId) {
    res.status(400).json({ error: 'Missing docId' });
    return;
  }

  const db = getPostgresInstance();
  const docs = (await db.query(
    `SELECT id, created_by, permissions, is_public, share_mode FROM collaborative_documents WHERE id = $1 LIMIT 1`,
    [docId]
  )) as CollaborativeDocument[];
  const doc = docs[0];
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const access = await checkDocumentAccess(doc, userId);
  if (!access.hasAccess) {
    res.status(403).json({ error: 'No access to document' });
    return;
  }

  const thread = await ensureDocChatThread(docId, doc.created_by);
  res.json({ threadId: thread.id });
});

export default router;
