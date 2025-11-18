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

    // Fetch generator by slug with owner info
    const generator = await postgres.queryOne(
      `SELECT cg.id, cg.name, cg.slug, cg.title, cg.description, cg.form_schema, cg.prompt, cg.contact_email,
              cg.created_at, cg.updated_at, cg.is_active, cg.usage_count, cg.user_id as owner_id,
              p.first_name as owner_first_name, p.last_name as owner_last_name, p.email as owner_email
       FROM custom_generators cg
       LEFT JOIN profiles p ON p.id = cg.user_id
       WHERE cg.slug = $1 AND cg.is_active = true`,
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

    // Check if user is owner
    const isOwner = generator.owner_id === userId;

    // Check if user has saved this generator
    let isSaved = false;
    if (!isOwner) {
      const savedCheck = await postgres.queryOne(
        `SELECT id FROM saved_generators WHERE user_id = $1 AND generator_id = $2`,
        [userId, generator.id],
        { table: 'saved_generators' }
      );
      isSaved = !!savedCheck;
    }

    // Increment usage count
    await postgres.query(
      `UPDATE custom_generators SET usage_count = usage_count + 1 WHERE id = $1`,
      [generator.id],
      { table: 'custom_generators' }
    );

    res.json({
      success: true,
      generator: {
        ...generator,
        is_owner: isOwner,
        is_saved: isSaved
      }
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