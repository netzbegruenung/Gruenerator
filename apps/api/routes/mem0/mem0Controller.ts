import express, { type Router, type Response } from 'express';

import { getMem0Instance, normalizeCategory } from '../../services/mem0/index.js';
import { invalidatePersona } from '../../services/mem0/personaService.js';
import { createLogger } from '../../utils/logger.js';

import type { MemoryCategory } from '../../services/mem0/categories.js';
import type { Mem0Memory, MemoryConfidence, MemorySource } from '../../services/mem0/types.js';
import type { AuthRequest } from '../auth/types.js';

const log = createLogger('mem0Controller');

const router: Router = express.Router();

interface FrontendMemory {
  id: string;
  content: string;
  topic?: string;
  category: MemoryCategory | null;
  confidence: MemoryConfidence;
  source: MemorySource;
  created_at?: string;
  updated_at?: string;
}

function toFrontendMemory(m: Mem0Memory): FrontendMemory {
  return {
    id: m.id,
    content: m.memory,
    topic: m.metadata?.memoryType,
    category: normalizeCategory(m.metadata?.memoryType),
    confidence: (m.metadata?.confidence as MemoryConfidence) ?? 'medium',
    source: (m.metadata?.source as MemorySource) ?? 'extracted',
    created_at: m.created_at,
    updated_at: m.updated_at,
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
    const normalized = normalizeCategory(topic);
    const metadata = normalized
      ? { memoryType: normalized, source: 'manual' as const, confidence: 'high' as const }
      : { source: 'manual' as const, confidence: 'high' as const };

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

// PUT /api/mem0/:memoryId — update a memory's content
router.put(
  '/:memoryId',
  async (req: AuthRequest<{ memoryId: string }>, res: Response): Promise<void> => {
    try {
      const { memoryId } = req.params;
      const { content } = req.body as { content?: string };
      const userId = req.user!.id;

      if (!content?.trim()) {
        res.status(400).json({ success: false, message: 'Inhalt ist erforderlich.' });
        return;
      }

      const mem0 = getMem0Instance();
      if (!mem0) {
        res.status(503).json({ success: false, message: 'Memory-Service nicht verfügbar.' });
        return;
      }

      const updated = await mem0.updateMemory(memoryId, userId, content.trim());
      if (!updated) {
        res.status(404).json({ success: false, message: 'Erinnerung nicht gefunden.' });
        return;
      }

      // Invalidate persona cache since memory content changed
      invalidatePersona(userId).catch((e) =>
        log.warn('[mem0 PUT] Persona invalidation failed:', e)
      );

      res.json({ success: true, memory: toFrontendMemory(updated) });
    } catch (error) {
      const err = error as Error;
      log.error('[mem0 PUT /:memoryId] Error:', err);
      res
        .status(500)
        .json({ success: false, message: err.message || 'Fehler beim Aktualisieren.' });
    }
  }
);

// POST /api/mem0/search — semantic search across user memories
router.post('/search', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { query, category, limit } = req.body as {
      query?: string;
      category?: string;
      limit?: number;
    };

    if (!query?.trim()) {
      res.status(400).json({ success: false, message: 'Suchbegriff ist erforderlich.' });
      return;
    }

    const mem0 = getMem0Instance();
    if (!mem0) {
      res.status(503).json({ success: false, message: 'Memory-Service nicht verfügbar.' });
      return;
    }

    const userId = req.user!.id;
    let memories = await mem0.searchMemories(query.trim(), userId, limit ?? 10);

    // Optional category filter
    if (category) {
      const normalized = normalizeCategory(category);
      if (normalized) {
        memories = memories.filter((m) => normalizeCategory(m.metadata?.memoryType) === normalized);
      }
    }

    res.json({
      success: true,
      memories: memories.map((m) => ({ ...toFrontendMemory(m), score: m.score })),
    });
  } catch (error) {
    const err = error as Error;
    log.error('[mem0 POST /search] Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Fehler bei der Suche.' });
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

      invalidatePersona(userId).catch((e) =>
        log.warn('[mem0 DELETE] Persona invalidation failed:', e)
      );
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

// GET /api/mem0/user/:userId/export — export all memories as JSON (GDPR data portability)
router.get(
  '/user/:userId/export',
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

      const [memories, history] = await Promise.all([
        mem0.getAllMemories(userId),
        mem0.getMemoryHistory(userId),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        userId,
        memoryCount: memories.length,
        memories: memories.map(toFrontendMemory),
        auditHistory: history.map((h) => ({
          operation: h.operation,
          memoryText: h.memoryText,
          createdAt: h.createdAt,
          threadId: h.threadId,
        })),
      };

      const filename = `gruenerator-erinnerungen-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.json(exportData);
    } catch (error) {
      const err = error as Error;
      log.error('[mem0 GET /user/:userId/export] Error:', err);
      res.status(500).json({ success: false, message: err.message || 'Fehler beim Export.' });
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

      invalidatePersona(userId).catch((e) =>
        log.warn('[mem0 DELETE ALL] Persona invalidation failed:', e)
      );
      res.json({ success: true });
    } catch (error) {
      const err = error as Error;
      log.error('[mem0 DELETE /user/:userId/all] Error:', err);
      res.status(500).json({
        success: false,
        message: err.message || 'Fehler beim Löschen aller Erinnerungen.',
      });
    }
  }
);

export default router;
