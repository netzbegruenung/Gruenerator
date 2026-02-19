import express, { type Router, type Response } from 'express';

import { getMem0Instance } from '../../services/mem0/index.js';
import { createLogger } from '../../utils/logger.js';

import type { Mem0Memory } from '../../services/mem0/types.js';
import type { AuthRequest } from '../auth/types.js';

const log = createLogger('mem0Controller');

const router: Router = express.Router();

interface FrontendMemory {
  id: string;
  content: string;
  topic?: string;
  created_at?: string;
}

function toFrontendMemory(m: Mem0Memory): FrontendMemory {
  return {
    id: m.id,
    content: m.memory,
    topic: m.metadata?.memoryType,
    created_at: m.created_at,
  };
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

      const mem0 = getMem0Instance();
      if (!mem0) {
        res.json({ success: true, memories: [] });
        return;
      }

      const memories = await mem0.getAllMemories(userId);
      res.json({ success: true, memories: memories.map(toFrontendMemory) });
    } catch (error) {
      const err = error as Error;
      log.error('[mem0 GET /user/:userId] Error:', err);
      res
        .status(500)
        .json({ success: false, message: err.message || 'Fehler beim Laden der Erinnerungen.' });
    }
  }
);

// POST /api/mem0/add-text — add a text memory for the authenticated user
router.post('/add-text', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { text, topic } = req.body as { text?: string; topic?: string };

    if (!text || !text.trim()) {
      res.status(400).json({ success: false, message: 'Text ist erforderlich.' });
      return;
    }

    const mem0 = getMem0Instance();
    if (!mem0) {
      res.status(503).json({ success: false, message: 'Memory-Service nicht verfügbar.' });
      return;
    }

    const userId = req.user!.id;
    const metadata = topic
      ? { memoryType: topic as 'preference' | 'fact' | 'context' | 'instruction' }
      : undefined;

    const added = await mem0.addMemories(
      [{ role: 'user', content: text.trim() }],
      userId,
      metadata
    );

    res.json({ success: true, memories: added.map(toFrontendMemory) });
  } catch (error) {
    const err = error as Error;
    log.error('[mem0 POST /add-text] Error:', err);
    res
      .status(500)
      .json({ success: false, message: err.message || 'Fehler beim Speichern der Erinnerung.' });
  }
});

// DELETE /api/mem0/:memoryId — delete a single memory
router.delete(
  '/:memoryId',
  async (req: AuthRequest<{ memoryId: string }>, res: Response): Promise<void> => {
    try {
      const { memoryId } = req.params;
      const userId = req.user!.id;

      const mem0 = getMem0Instance();
      if (!mem0) {
        res.status(503).json({ success: false, message: 'Memory-Service nicht verfügbar.' });
        return;
      }

      const deleted = await mem0.deleteMemory(memoryId, userId);
      if (!deleted) {
        res.status(404).json({ success: false, message: 'Erinnerung nicht gefunden.' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      const err = error as Error;
      log.error('[mem0 DELETE /:memoryId] Error:', err);
      res
        .status(500)
        .json({ success: false, message: err.message || 'Fehler beim Löschen der Erinnerung.' });
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

      const mem0 = getMem0Instance();
      if (!mem0) {
        res.status(503).json({ success: false, message: 'Memory-Service nicht verfügbar.' });
        return;
      }

      const deleted = await mem0.deleteAllUserMemories(userId);
      if (!deleted) {
        res
          .status(500)
          .json({ success: false, message: 'Fehler beim Löschen aller Erinnerungen.' });
        return;
      }

      res.json({ success: true });
    } catch (error) {
      const err = error as Error;
      log.error('[mem0 DELETE /user/:userId/all] Error:', err);
      res
        .status(500)
        .json({
          success: false,
          message: err.message || 'Fehler beim Löschen aller Erinnerungen.',
        });
    }
  }
);

export default router;
