import express from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import authMiddlewareModule from '../../middleware/authMiddleware.js';

const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const postgres = getPostgresInstance();

const router = express.Router();

// Add debugging middleware to all custom generators routes
router.use((req, res, next) => {
  console.log(`[User Custom Generators] ${req.method} ${req.originalUrl} - User ID: ${req.user?.id}`);
  next();
});

// === CUSTOM GENERATORS MANAGEMENT ENDPOINTS ===

// Get user's custom generators
router.get('/custom_generator', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user's custom generators
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
    console.error('[User Custom Generators /custom_generator GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Grüneratoren.'
    });
  }
});

// Create new custom generator
router.post('/custom_generator/create', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, slug, title, description, form_schema, prompt, contact_email } = req.body;

    // Validate required fields
    if (!name || !slug || !title || !form_schema || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Name, Slug, Title, Form Schema und Prompt sind erforderlich.'
      });
    }

    // Check if slug already exists for this user
    const existingGenerator = await postgres.queryOne(
      `SELECT id FROM custom_generators WHERE slug = $1 AND user_id = $2`,
      [slug, userId],
      { table: 'custom_generators' }
    );

    if (existingGenerator) {
      return res.status(400).json({
        success: false,
        message: 'Ein Grünerator mit diesem Slug existiert bereits.'
      });
    }

    // Create new generator
    const newGenerator = await postgres.queryOne(
      `INSERT INTO custom_generators (user_id, name, slug, title, description, form_schema, prompt, contact_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        name.trim(),
        slug.trim(),
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
    console.error('[User Custom Generators /custom_generator/create POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Erstellen des Grünerators.'
    });
  }
});

// Update existing custom generator
router.put('/custom_generator/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, slug, title, description, form_schema, prompt, contact_email } = req.body;

    // Validate required fields
    if (!name || !slug || !title || !form_schema || !prompt) {
      return res.status(400).json({
        success: false,
        message: 'Name, Slug, Title, Form Schema und Prompt sind erforderlich.'
      });
    }

    // Check if generator exists and belongs to user
    const existingGenerator = await postgres.queryOne(
      `SELECT id, user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!existingGenerator) {
      return res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
    }

    if (existingGenerator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Bearbeiten dieses Grünerators.'
      });
    }

    // Check if slug conflicts with another generator by same user
    const conflictGenerator = await postgres.queryOne(
      `SELECT id FROM custom_generators
       WHERE slug = $1 AND user_id = $2 AND id != $3`,
      [slug, userId, id],
      { table: 'custom_generators' }
    );

    if (conflictGenerator) {
      return res.status(400).json({
        success: false,
        message: 'Ein anderer Grünerator mit diesem Slug existiert bereits.'
      });
    }

    // Update generator
    const updatedGenerator = await postgres.queryOne(
      `UPDATE custom_generators
       SET name = $1, slug = $2, title = $3, description = $4,
           form_schema = $5, prompt = $6, contact_email = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [
        name.trim(),
        slug.trim(),
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
    console.error('[User Custom Generators /custom_generator/:id PUT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Aktualisieren des Grünerators.'
    });
  }
});

// Delete custom generator
router.delete('/custom_generator/:id', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if generator exists and belongs to user
    const existingGenerator = await postgres.queryOne(
      `SELECT id, user_id, name FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!existingGenerator) {
      return res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
    }

    if (existingGenerator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung zum Löschen dieses Grünerators.'
      });
    }

    // Delete generator (CASCADE will handle junction table)
    await postgres.query(
      `DELETE FROM custom_generators WHERE id = $1 AND user_id = $2`,
      [id, userId],
      { table: 'custom_generators' }
    );

    console.log(`[User Custom Generators] Generator "${existingGenerator.name}" (${id}) deleted by user ${userId}`);

    res.json({
      success: true,
      message: 'Grünerator erfolgreich gelöscht!'
    });

  } catch (error) {
    console.error('[User Custom Generators /custom_generator/:id DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Löschen des Grünerators.'
    });
  }
});

// === DOCUMENT MANAGEMENT ENDPOINTS ===

// Get documents linked to a custom generator
router.get('/custom_generator/:id/documents', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verify generator ownership
    const generator = await postgres.queryOne(
      `SELECT user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
    }

    if (generator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung.'
      });
    }

    // Get linked documents
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
    console.error('[User Custom Generators /custom_generator/:id/documents GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der Dokumente.'
    });
  }
});

// Link a document to a custom generator
router.post('/custom_generator/:id/documents', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { document_id } = req.body;

    if (!document_id) {
      return res.status(400).json({
        success: false,
        message: 'Dokument-ID ist erforderlich.'
      });
    }

    // Verify generator ownership
    const generator = await postgres.queryOne(
      `SELECT user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
    }

    if (generator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung.'
      });
    }

    // Verify document exists and user has access
    const document = await postgres.queryOne(
      `SELECT id, user_id FROM documents WHERE id = $1`,
      [document_id],
      { table: 'documents' }
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Dokument nicht gefunden.'
      });
    }

    if (document.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung für dieses Dokument.'
      });
    }

    // Check if already linked
    const existingLink = await postgres.queryOne(
      `SELECT id FROM custom_generator_documents
       WHERE custom_generator_id = $1 AND document_id = $2`,
      [id, document_id],
      { table: 'custom_generator_documents' }
    );

    if (existingLink) {
      return res.status(400).json({
        success: false,
        message: 'Dokument ist bereits verknüpft.'
      });
    }

    // Link document to generator
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
    console.error('[User Custom Generators /custom_generator/:id/documents POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Verknüpfen des Dokuments.'
    });
  }
});

// Unlink a document from a custom generator
router.delete('/custom_generator/:id/documents/:documentId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id, documentId } = req.params;

    // Verify generator ownership
    const generator = await postgres.queryOne(
      `SELECT user_id FROM custom_generators WHERE id = $1`,
      [id],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
    }

    if (generator.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Keine Berechtigung.'
      });
    }

    // Delete the link
    const result = await postgres.query(
      `DELETE FROM custom_generator_documents
       WHERE custom_generator_id = $1 AND document_id = $2
       RETURNING id`,
      [id, documentId],
      { table: 'custom_generator_documents' }
    );

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Verknüpfung nicht gefunden.'
      });
    }

    res.json({
      success: true,
      message: 'Dokument erfolgreich entfernt!'
    });

  } catch (error) {
    console.error('[User Custom Generators /custom_generator/:id/documents/:documentId DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Entfernen des Dokuments.'
    });
  }
});

export default router;
