/**
 * User custom generators management routes
 * Handles custom generator CRUD, document linking, and saved generators
 */

import express, { Router, Response, NextFunction } from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';
import type { AuthRequest } from './types.js';

const log = createLogger('userCustomGener');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const postgres = getPostgresInstance();

const router: Router = express.Router();

// Debug middleware for all custom generators routes
router.use((req: AuthRequest, _res: Response, next: NextFunction): void => {
  log.debug(`[User Custom Generators] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// ============================================================================
// Helper Functions
// ============================================================================

interface CustomGeneratorCreateBody {
  name: string;
  slug: string;
  title: string;
  description?: string;
  form_schema: any;
  prompt: string;
  contact_email?: string;
}

interface DocumentLinkBody {
  document_id: string;
}

async function generateUniqueSlug(baseSlug: string): Promise<string> {
  const slugBase = baseSlug.replace(/-\d+$/, '');

  const existingSlugs = await postgres.query(
    `SELECT slug FROM custom_generators
     WHERE slug = $1 OR slug ~ $2`,
    [slugBase, `^${slugBase}-\\d+$`],
    { table: 'custom_generators' }
  );

  if (!existingSlugs || existingSlugs.length === 0) {
    return slugBase;
  }

  const slugSet = new Set(existingSlugs.map((r: { slug: string }) => r.slug));
  if (!slugSet.has(slugBase)) {
    return slugBase;
  }

  let counter = 1;
  while (slugSet.has(`${slugBase}-${counter}`)) {
    counter++;
  }
  return `${slugBase}-${counter}`;
}

// ============================================================================
// Custom Generators Management Endpoints
// ============================================================================

router.get('/custom_generator', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const generators = await postgres.query(
      `SELECT id, name, slug, title, description, form_schema, prompt, contact_email, created_at, updated_at, is_active, usage_count
       FROM custom_generators
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
      { table: 'custom_generators' }
    );

    res.json({
      success: true,
      generators: generators || []
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Grüneratoren.'
    });
  }
});

router.post('/custom_generator/create', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, slug, title, description, form_schema, prompt, contact_email } = req.body as CustomGeneratorCreateBody;

    if (!name || !slug || !title || !form_schema || !prompt) {
      res.status(400).json({
        success: false,
        message: 'Name, Slug, Title, Form Schema und Prompt sind erforderlich.'
      });
      return;
    }

    const uniqueSlug = await generateUniqueSlug(slug.trim());

    const newGenerator = await postgres.queryOne(
      `INSERT INTO custom_generators (user_id, name, slug, title, description, form_schema, prompt, contact_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        name.trim(),
        uniqueSlug,
        title.trim(),
        description?.trim() || null,
        form_schema,
        prompt.trim(),
        contact_email?.trim() || null
      ],
      { table: 'custom_generators' }
    );

    res.json({
      success: true,
      generator: newGenerator,
      message: 'Grünerator erfolgreich erstellt!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator/create POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Erstellen des Grünerators.'
    });
  }
});

router.put('/custom_generator/:id', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { name, slug, title, description, form_schema, prompt, contact_email } = req.body as CustomGeneratorCreateBody;

    if (!name || !slug || !title || !form_schema || !prompt) {
      res.status(400).json({
        success: false,
        message: 'Name, Slug, Title, Form Schema und Prompt sind erforderlich.'
      });
      return;
    }

    const existingGenerator = await postgres.queryOne(
      `SELECT id, user_id, slug FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!existingGenerator) {
      res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
      return;
    }

    if (existingGenerator.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Bearbeiten dieses Grünerators.'
      });
      return;
    }

    let uniqueSlug = slug.trim();
    if (existingGenerator.slug !== uniqueSlug) {
      uniqueSlug = await generateUniqueSlug(uniqueSlug);
    }

    const updatedGenerator = await postgres.queryOne(
      `UPDATE custom_generators
       SET name = $1, slug = $2, title = $3, description = $4,
           form_schema = $5, prompt = $6, contact_email = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        name.trim(),
        uniqueSlug,
        title.trim(),
        description?.trim() || null,
        form_schema,
        prompt.trim(),
        contact_email?.trim() || null,
        id,
        userId
      ],
      { table: 'custom_generators' }
    );

    res.json({
      success: true,
      generator: updatedGenerator,
      message: 'Grünerator erfolgreich aktualisiert!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator/:id PUT] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Aktualisieren des Grünerators.'
    });
  }
});

router.delete('/custom_generator/:id', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existingGenerator = await postgres.queryOne(
      `SELECT id, user_id, name FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!existingGenerator) {
      res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
      return;
    }

    if (existingGenerator.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Löschen dieses Grünerators.'
      });
      return;
    }

    await postgres.query(
      `DELETE FROM custom_generators WHERE id = $1 AND user_id = $2`,
      [id, userId],
      { table: 'custom_generators' }
    );

    log.debug(`[User Custom Generators] Generator "${existingGenerator.name}" (${id}) deleted by user ${userId}`);

    res.json({
      success: true,
      message: 'Grünerator erfolgreich gelöscht!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator/:id DELETE] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Löschen des Grünerators.'
    });
  }
});

// ============================================================================
// Document Management Endpoints
// ============================================================================

router.get('/custom_generator/:id/documents', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const generator = await postgres.queryOne(
      `SELECT user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
      return;
    }

    if (generator.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung.'
      });
      return;
    }

    const documents = await postgres.query(
      `SELECT d.id, d.file_name, d.file_type, d.status, d.created_at, cgd.created_at as linked_at
       FROM custom_generator_documents cgd
       JOIN documents d ON d.id = cgd.document_id
       WHERE cgd.custom_generator_id = $1
       ORDER BY cgd.created_at DESC`,
      [id],
      { table: 'custom_generator_documents' }
    );

    res.json({
      success: true,
      documents: documents || []
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator/:id/documents GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der Dokumente.'
    });
  }
});

router.post('/custom_generator/:id/documents', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { document_id } = req.body as DocumentLinkBody;

    if (!document_id) {
      res.status(400).json({
        success: false,
        message: 'Dokument-ID ist erforderlich.'
      });
      return;
    }

    const generator = await postgres.queryOne(
      `SELECT user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
      return;
    }

    if (generator.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung.'
      });
      return;
    }

    const document = await postgres.queryOne(
      `SELECT id, user_id FROM documents WHERE id = $1`,
      [document_id],
      { table: 'documents' }
    );

    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Dokument nicht gefunden.'
      });
      return;
    }

    if (document.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung für dieses Dokument.'
      });
      return;
    }

    const existingLink = await postgres.queryOne(
      `SELECT id FROM custom_generator_documents
       WHERE custom_generator_id = $1 AND document_id = $2`,
      [id, document_id],
      { table: 'custom_generator_documents' }
    );

    if (existingLink) {
      res.status(400).json({
        success: false,
        message: 'Dokument ist bereits verknüpft.'
      });
      return;
    }

    await postgres.query(
      `INSERT INTO custom_generator_documents (custom_generator_id, document_id)
       VALUES ($1, $2)`,
      [id, document_id],
      { table: 'custom_generator_documents' }
    );

    res.json({
      success: true,
      message: 'Dokument erfolgreich verknüpft!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator/:id/documents POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Verknüpfen des Dokuments.'
    });
  }
});

router.delete('/custom_generator/:id/documents/:documentId', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { id, documentId } = req.params;

    const generator = await postgres.queryOne(
      `SELECT user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
      return;
    }

    if (generator.user_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Keine Berechtigung.'
      });
      return;
    }

    const result = await postgres.query(
      `DELETE FROM custom_generator_documents
       WHERE custom_generator_id = $1 AND document_id = $2
       RETURNING id`,
      [id, documentId],
      { table: 'custom_generator_documents' }
    );

    if (!result || result.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Verknüpfung nicht gefunden.'
      });
      return;
    }

    res.json({
      success: true,
      message: 'Dokument erfolgreich entfernt!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /custom_generator/:id/documents/:documentId DELETE] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Entfernen des Dokuments.'
    });
  }
});

// ============================================================================
// Saved Generators Endpoints
// ============================================================================

router.get('/saved_generators', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const savedGenerators = await postgres.query(
      `SELECT
        cg.id, cg.name, cg.slug, cg.title, cg.description, cg.form_schema,
        cg.prompt, cg.contact_email, cg.created_at, cg.updated_at,
        cg.is_active, cg.usage_count, cg.user_id as owner_id,
        sg.saved_at,
        p.first_name as owner_first_name, p.last_name as owner_last_name, p.email as owner_email
       FROM saved_generators sg
       JOIN custom_generators cg ON cg.id = sg.generator_id
       LEFT JOIN profiles p ON p.id = cg.user_id
       WHERE sg.user_id = $1 AND cg.is_active = true
       ORDER BY sg.saved_at DESC`,
      [userId],
      { table: 'saved_generators' }
    );

    res.json({
      success: true,
      generators: savedGenerators || []
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /saved_generators GET] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Laden der gespeicherten Grüneratoren.'
    });
  }
});

router.post('/saved_generators/:generatorId', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { generatorId } = req.params;

    const generator = await postgres.queryOne(
      `SELECT id, user_id, name, is_active FROM custom_generators WHERE id = $1`,
      [generatorId],
      { table: 'custom_generators' }
    );

    if (!generator) {
      res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
      return;
    }

    if (!generator.is_active) {
      res.status(400).json({
        success: false,
        message: 'Dieser Grünerator ist nicht mehr aktiv.'
      });
      return;
    }

    if (generator.user_id === userId) {
      res.status(400).json({
        success: false,
        message: 'Du kannst deinen eigenen Grünerator nicht speichern.'
      });
      return;
    }

    const existingSave = await postgres.queryOne(
      `SELECT id FROM saved_generators WHERE user_id = $1 AND generator_id = $2`,
      [userId, generatorId],
      { table: 'saved_generators' }
    );

    if (existingSave) {
      res.status(400).json({
        success: false,
        message: 'Grünerator ist bereits gespeichert.'
      });
      return;
    }

    await postgres.query(
      `INSERT INTO saved_generators (user_id, generator_id) VALUES ($1, $2)`,
      [userId, generatorId],
      { table: 'saved_generators' }
    );

    log.debug(`[User Custom Generators] Generator "${generator.name}" (${generatorId}) saved by user ${userId}`);

    res.json({
      success: true,
      message: 'Grünerator erfolgreich gespeichert!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /saved_generators/:generatorId POST] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Speichern des Grünerators.'
    });
  }
});

router.delete('/saved_generators/:generatorId', ensureAuthenticated as any, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { generatorId } = req.params;

    const result = await postgres.query(
      `DELETE FROM saved_generators WHERE user_id = $1 AND generator_id = $2 RETURNING id`,
      [userId, generatorId],
      { table: 'saved_generators' }
    );

    if (!result || result.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Gespeicherter Grünerator nicht gefunden.'
      });
      return;
    }

    log.debug(`[User Custom Generators] Saved generator ${generatorId} removed by user ${userId}`);

    res.json({
      success: true,
      message: 'Grünerator erfolgreich entfernt!'
    });

  } catch (error) {
    const err = error as Error;
    log.error('[User Custom Generators /saved_generators/:generatorId DELETE] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Fehler beim Entfernen des Grünerators.'
    });
  }
});

export default router;
