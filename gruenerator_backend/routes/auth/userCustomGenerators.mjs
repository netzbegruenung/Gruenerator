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

async function generateUniqueSlug(baseSlug) {
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

  const slugSet = new Set(existingSlugs.map(r => r.slug));
  if (!slugSet.has(slugBase)) {
    return slugBase;
  }

  let counter = 1;
  while (slugSet.has(`${slugBase}-${counter}`)) {
    counter++;
  }
  return `${slugBase}-${counter}`;
}

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

    // Generate unique slug
    const uniqueSlug = await generateUniqueSlug(slug.trim());

    // Create new generator
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
      `SELECT id, user_id, slug FROM custom_generators WHERE id = $1`,
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

    // Generate unique slug if changed
    let uniqueSlug = slug.trim();
    if (existingGenerator.slug !== uniqueSlug) {
      uniqueSlug = await generateUniqueSlug(uniqueSlug);
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

// === SAVED GENERATORS ENDPOINTS ===

// Get user's saved generators (from other users)
router.get('/saved_generators', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;

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
    console.error('[User Custom Generators /saved_generators GET] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden der gespeicherten Grüneratoren.'
    });
  }
});

// Save a generator to user's profile
router.post('/saved_generators/:generatorId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { generatorId } = req.params;

    // Check if generator exists and is active
    const generator = await postgres.queryOne(
      `SELECT id, user_id, name, is_active FROM custom_generators WHERE id = $1`,
      [generatorId],
      { table: 'custom_generators' }
    );

    if (!generator) {
      return res.status(404).json({
        success: false,
        message: 'Grünerator nicht gefunden.'
      });
    }

    if (!generator.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Dieser Grünerator ist nicht mehr aktiv.'
      });
    }

    // Cannot save your own generator
    if (generator.user_id === userId) {
      return res.status(400).json({
        success: false,
        message: 'Du kannst deinen eigenen Grünerator nicht speichern.'
      });
    }

    // Check if already saved
    const existingSave = await postgres.queryOne(
      `SELECT id FROM saved_generators WHERE user_id = $1 AND generator_id = $2`,
      [userId, generatorId],
      { table: 'saved_generators' }
    );

    if (existingSave) {
      return res.status(400).json({
        success: false,
        message: 'Grünerator ist bereits gespeichert.'
      });
    }

    // Save the generator
    await postgres.query(
      `INSERT INTO saved_generators (user_id, generator_id) VALUES ($1, $2)`,
      [userId, generatorId],
      { table: 'saved_generators' }
    );

    console.log(`[User Custom Generators] Generator "${generator.name}" (${generatorId}) saved by user ${userId}`);

    res.json({
      success: true,
      message: 'Grünerator erfolgreich gespeichert!'
    });

  } catch (error) {
    console.error('[User Custom Generators /saved_generators/:generatorId POST] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Speichern des Grünerators.'
    });
  }
});

// Remove a saved generator from user's profile
router.delete('/saved_generators/:generatorId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user.id;
    const { generatorId } = req.params;

    const result = await postgres.query(
      `DELETE FROM saved_generators WHERE user_id = $1 AND generator_id = $2 RETURNING id`,
      [userId, generatorId],
      { table: 'saved_generators' }
    );

    if (!result || result.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Gespeicherter Grünerator nicht gefunden.'
      });
    }

    console.log(`[User Custom Generators] Saved generator ${generatorId} removed by user ${userId}`);

    res.json({
      success: true,
      message: 'Grünerator erfolgreich entfernt!'
    });

  } catch (error) {
    console.error('[User Custom Generators /saved_generators/:generatorId DELETE] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Entfernen des Grünerators.'
    });
  }
});

export default router;
