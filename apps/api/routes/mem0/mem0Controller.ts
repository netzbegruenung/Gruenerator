/**
 * REST surface of the person's explicit memory, on the legacy `/api/mem0`
 * paths the settings tab still calls. Interim: the follow-up PR moves this to
 * a ts-rest contract under `/api/memory` and rewrites `MemoriesSection.tsx`
 * against it. Until then the response shape stays what the tab expects
 * (`category` carries the memory kind, `source` is `chat` | `manual`).
 */
import express, { type Router, type Response } from 'express';

import { memoryKindSchema, type MemoryKind } from '@gruenerator/contracts';

import { memoryService, MemoryRejectedError } from '../../services/memory/index.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';
import { toIsoString } from '../../utils/toIsoString.js';

import type { UserMemoryRow } from '../../database/schema/index.js';
import type { AuthRequest } from '../auth/types.js';

const log = createLogger('memoryController');

const router: Router = express.Router();

function toFrontendMemory(m: UserMemoryRow) {
  return {
    id: m.id,
    content: m.text,
    topic: m.kind,
    category: m.kind,
    confidence: 'high' as const,
    source: m.source,
    created_at: toIsoString(m.created_at),
    updated_at: toIsoString(m.updated_at),
  };
}

function fail(res: Response, err: unknown, fallback: string, where: string): void {
  if (err instanceof MemoryRejectedError) {
    res.status(400).json({ success: false, message: err.userMessage });
    return;
  }
  log.error(`[memory ${where}] Error:`, err);
  res.status(500).json({
    success: false,
    message: toUserFacingMessage(err as Error) || fallback,
  });
}

// GET /api/mem0/user/:userId — list all memories for the authenticated user
router.get(
  '/user/:userId',
  async (req: AuthRequest<{ userId: string }>, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      if (req.user!.id !== userId) {
        res.status(403).json({ success: false, message: 'Zugriff verweigert.' });
        return;
      }
      const rows = await memoryService.list(userId);
      res.json({ success: true, memories: rows.map(toFrontendMemory) });
    } catch (error) {
      fail(res, error, 'Fehler beim Laden der Erinnerungen.', 'GET /user/:userId');
    }
  }
);

// POST /api/mem0/add-text — add a memory typed into the settings tab
router.post('/add-text', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { text, topic } = req.body as { text?: string; topic?: string };
    if (!text || !text.trim()) {
      res.status(400).json({ success: false, message: 'Text ist erforderlich.' });
      return;
    }
    const parsedKind = memoryKindSchema.safeParse(topic);
    const kind: MemoryKind = parsedKind.success ? parsedKind.data : 'fakt';
    const { row } = await memoryService.create({
      userId: req.user!.id,
      kind,
      text,
      source: 'manual',
      threadId: null,
    });
    res.json({ success: true, memories: [toFrontendMemory(row)] });
  } catch (error) {
    fail(res, error, 'Fehler beim Speichern der Erinnerung.', 'POST /add-text');
  }
});

// PUT /api/mem0/:memoryId — update a memory's text
router.put(
  '/:memoryId',
  async (req: AuthRequest<{ memoryId: string }>, res: Response): Promise<void> => {
    try {
      const { content } = req.body as { content?: string };
      if (!content?.trim()) {
        res.status(400).json({ success: false, message: 'Inhalt ist erforderlich.' });
        return;
      }
      const updated = await memoryService.update(req.user!.id, req.params.memoryId, content);
      if (!updated) {
        res.status(404).json({ success: false, message: 'Erinnerung nicht gefunden.' });
        return;
      }
      res.json({ success: true, memory: toFrontendMemory(updated) });
    } catch (error) {
      fail(res, error, 'Fehler beim Aktualisieren.', 'PUT /:memoryId');
    }
  }
);

// DELETE /api/mem0/:memoryId — delete a single memory
router.delete(
  '/:memoryId',
  async (req: AuthRequest<{ memoryId: string }>, res: Response): Promise<void> => {
    try {
      const removed = await memoryService.remove(req.user!.id, req.params.memoryId);
      if (!removed) {
        res.status(404).json({ success: false, message: 'Erinnerung nicht gefunden.' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      fail(res, error, 'Fehler beim Löschen der Erinnerung.', 'DELETE /:memoryId');
    }
  }
);

// GET /api/mem0/user/:userId/export — all memories as JSON (GDPR data portability)
router.get(
  '/user/:userId/export',
  async (req: AuthRequest<{ userId: string }>, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      if (req.user!.id !== userId) {
        res.status(403).json({ success: false, message: 'Zugriff verweigert.' });
        return;
      }
      const rows = await memoryService.list(userId);
      const exportData = {
        exportedAt: new Date().toISOString(),
        userId,
        memoryCount: rows.length,
        memories: rows.map(toFrontendMemory),
      };
      const filename = `gruenerator-erinnerungen-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json');
      setContentDisposition(res, filename);
      res.json(exportData);
    } catch (error) {
      fail(res, error, 'Fehler beim Export.', 'GET /user/:userId/export');
    }
  }
);

// DELETE /api/mem0/user/:userId/all — delete all memories (GDPR)
router.delete(
  '/user/:userId/all',
  async (req: AuthRequest<{ userId: string }>, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      if (req.user!.id !== userId) {
        res.status(403).json({ success: false, message: 'Zugriff verweigert.' });
        return;
      }
      await memoryService.removeAll(userId);
      res.json({ success: true });
    } catch (error) {
      fail(res, error, 'Fehler beim Löschen aller Erinnerungen.', 'DELETE /user/:userId/all');
    }
  }
);

export default router;
