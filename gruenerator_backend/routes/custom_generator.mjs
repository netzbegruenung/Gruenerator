import express from 'express';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import { createRequire } from 'module';
import { getPostgresInstance } from '../database/services/PostgresService.js';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);
const { processGraphRequest } = require('../agents/langgraph/promptProcessor');

const { requireAuth } = authMiddlewareModule;
const postgres = getPostgresInstance();
const router = express.Router();

// GET /:slug - Fetch generator configuration by slug
router.get('/:slug', requireAuth, async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.user.id;

    console.log(`[custom_generator] GET /:slug - Fetching generator with slug: ${slug} for user: ${userId}`);

    // Fetch generator by slug
    const generator = await postgres.queryOne(
      `SELECT id, name, slug, title, description, form_schema, prompt, contact_email,
              created_at, updated_at, is_active, usage_count
       FROM custom_generators
       WHERE slug = $1 AND is_active = true`,
      [slug],
      { table: 'custom_generators' }
    );

    if (!generator) {
      console.log(`[custom_generator] Generator not found for slug: ${slug}`);
      return res.status(404).json({
        success: false,
        message: 'Generator nicht gefunden.'
      });
    }

    // Increment usage count
    await postgres.query(
      `UPDATE custom_generators SET usage_count = usage_count + 1 WHERE id = $1`,
      [generator.id],
      { table: 'custom_generators' }
    );

    res.json({
      success: true,
      generator: generator
    });

  } catch (error) {
    console.error('[custom_generator] Error fetching generator:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Fehler beim Laden des Generators.'
    });
  }
});

router.post('/', async (req, res) => {
  console.log('[custom_generator] Request received via promptProcessor');
  await processGraphRequest('custom_generator', req, res);
});

export default router;