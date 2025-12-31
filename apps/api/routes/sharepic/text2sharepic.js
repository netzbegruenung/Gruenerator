/**
 * Text2Sharepic API Routes
 *
 * REST API endpoints for AI-powered text-to-sharepic generation.
 *
 * Endpoints:
 * - POST /api/sharepic/text2sharepic/generate - Generate sharepic from description
 * - POST /api/sharepic/text2sharepic/variants - Generate multiple variants
 * - POST /api/sharepic/text2sharepic/preview - Preview layout without rendering
 * - GET /api/sharepic/text2sharepic/templates - List available templates
 * - GET /api/sharepic/text2sharepic/components - List available components
 */

const express = require('express');
const router = express.Router();

const { createSharepicComposer } = require('../../services/text2sharepic');
const { listTemplates, getTemplate } = require('../../services/text2sharepic/zoneTemplates');
const { listComponents, getCorporateDesign } = require('../../services/text2sharepic/componentLibrary');
const { generateLayoutPlan } = require('../../agents/sharepic/layoutPlanner');
const { createLogger } = require('../../utils/logger.js');
const log = createLogger('text2sharepic');


// Try to load Redis client
let redisClient = null;
try {
  redisClient = require('../../utils/redisClient');
} catch (err) {
  log.warn('[Text2Sharepic] Redis client not available, caching disabled');
}

// Create composer instance with Redis if available
const composer = createSharepicComposer({
  redis: redisClient,
  cacheEnabled: !!redisClient,
  cacheTTL: 3600
});

/**
 * POST /generate
 * Generate a sharepic from a text description
 *
 * Body:
 * - description: string (required) - User's description of the desired sharepic
 * - templateId: string (optional) - Force a specific template
 * - content: object (optional) - Override content fields
 * - useAI: boolean (optional) - Use AI for advanced layout planning
 * - skipCache: boolean (optional) - Skip cache lookup
 */
router.post('/generate', async (req, res) => {
  try {
    const { description, templateId, content, useAI, skipCache } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Description is required and must be a string'
      });
    }

    if (description.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Description must be at least 5 characters'
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Description must be less than 2000 characters'
      });
    }

    log.debug(`[Text2Sharepic] Generate request: "${description.substring(0, 100)}..."`);

    const result = await composer.generateFromDescription(description, {
      templateId,
      content,
      useAI: useAI || false,
      skipCache: skipCache || false
    });

    res.json({
      success: true,
      ...result,
      description: description.substring(0, 200)
    });

  } catch (error) {
    log.error('[Text2Sharepic] Generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate sharepic'
    });
  }
});

/**
 * POST /generate-ai
 * Generate a sharepic using AI for both text generation and layout planning
 *
 * Body:
 * - description: string (required) - User's description of the desired sharepic
 * - templateHint: string (optional) - Hint for preferred template
 * - mood: string (optional) - Desired mood (serious, energetic, warm, fresh)
 * - useBackgroundImage: boolean (optional) - Force/prevent background image usage
 *     - true: Always use background image (auto-selected)
 *     - false: Never use background image (only colors)
 *     - undefined: Let AI decide based on content
 */
router.post('/generate-ai', async (req, res) => {
  try {
    const { description, templateHint, mood, useBackgroundImage } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Description is required and must be a string'
      });
    }

    if (description.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Description must be at least 5 characters'
      });
    }

    if (description.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Description must be less than 2000 characters'
      });
    }

    // Check if AI worker pool is available
    if (!req.app.locals.aiWorkerPool) {
      return res.status(503).json({
        success: false,
        error: 'AI service is not available'
      });
    }

    log.debug(`[Text2Sharepic] AI Generate request: "${description.substring(0, 100)}..." (useBackgroundImage: ${useBackgroundImage})`);

    const result = await composer.generateFromAI(description, req, {
      templateHint,
      mood,
      useBackgroundImage
    });

    res.json({
      success: true,
      ...result,
      description: description.substring(0, 200)
    });

  } catch (error) {
    log.error('[Text2Sharepic] AI Generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI sharepic'
    });
  }
});

/**
 * POST /edit-ai
 * Edit an existing sharepic using AI
 *
 * Body:
 * - layoutPlan: object (required) - Current layout plan from previous generation
 * - editRequest: string (required) - User's description of desired changes
 */
router.post('/edit-ai', async (req, res) => {
  try {
    const { layoutPlan, editRequest } = req.body;

    if (!layoutPlan || typeof layoutPlan !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Layout plan is required and must be an object'
      });
    }

    if (!editRequest || typeof editRequest !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Edit request is required and must be a string'
      });
    }

    if (editRequest.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Edit request must be at least 3 characters'
      });
    }

    if (editRequest.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Edit request must be less than 1000 characters'
      });
    }

    if (!req.app.locals.aiWorkerPool) {
      return res.status(503).json({
        success: false,
        error: 'AI service is not available'
      });
    }

    log.debug(`[Text2Sharepic] AI Edit request: "${editRequest.substring(0, 100)}..."`);

    const result = await composer.editFromAI(layoutPlan, editRequest, req);

    res.json({
      success: true,
      ...result,
      editRequest: editRequest.substring(0, 200)
    });

  } catch (error) {
    log.error('[Text2Sharepic] AI Edit error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to edit sharepic'
    });
  }
});

/**
 * POST /variants
 * Generate multiple variants of a sharepic
 *
 * Body:
 * - description: string (required) - User's description
 * - count: number (optional) - Number of variants (1-8, default 4)
 */
router.post('/variants', async (req, res) => {
  try {
    const { description, count = 4 } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Description is required'
      });
    }

    const variantCount = Math.min(Math.max(parseInt(count) || 4, 1), 8);

    log.debug(`[Text2Sharepic] Generating ${variantCount} variants`);

    const variants = await composer.generateVariants(description, variantCount);

    res.json({
      success: true,
      count: variants.length,
      variants
    });

  } catch (error) {
    log.error('[Text2Sharepic] Variants error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate variants'
    });
  }
});

/**
 * POST /preview
 * Preview a layout plan without full rendering
 *
 * Body:
 * - description: string (required) - User's description
 * - templateId: string (optional) - Force a specific template
 */
router.post('/preview', async (req, res) => {
  try {
    const { description, templateId } = req.body;

    if (!description || typeof description !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Description is required'
      });
    }

    log.debug(`[Text2Sharepic] Preview request: "${description.substring(0, 100)}..."`);

    const layoutPlan = await generateLayoutPlan(description, { templateId });

    res.json({
      success: true,
      layoutPlan,
      suggestedTemplates: composer.getTemplatesForContent(layoutPlan.analysis.category)
    });

  } catch (error) {
    log.error('[Text2Sharepic] Preview error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate preview'
    });
  }
});

/**
 * POST /render-plan
 * Render a pre-defined layout plan
 *
 * Body:
 * - layoutPlan: object (required) - Complete layout plan
 */
router.post('/render-plan', async (req, res) => {
  try {
    const { layoutPlan } = req.body;

    if (!layoutPlan || typeof layoutPlan !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Layout plan is required'
      });
    }

    log.debug(`[Text2Sharepic] Render plan request for template: ${layoutPlan.templateId}`);

    const result = await composer.generateFromPlan(layoutPlan);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    log.error('[Text2Sharepic] Render plan error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to render layout plan'
    });
  }
});

/**
 * GET /templates
 * List all available templates
 */
router.get('/templates', (req, res) => {
  try {
    const templates = listTemplates();

    res.json({
      success: true,
      count: templates.length,
      templates
    });

  } catch (error) {
    log.error('[Text2Sharepic] Templates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list templates'
    });
  }
});

/**
 * GET /templates/:id
 * Get a specific template by ID
 */
router.get('/templates/:id', (req, res) => {
  try {
    const { id } = req.params;
    const template = getTemplate(id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: `Template not found: ${id}`
      });
    }

    res.json({
      success: true,
      template
    });

  } catch (error) {
    log.error('[Text2Sharepic] Template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get template'
    });
  }
});

/**
 * GET /components
 * List all available components
 */
router.get('/components', (req, res) => {
  try {
    const components = listComponents();

    res.json({
      success: true,
      count: components.length,
      components
    });

  } catch (error) {
    log.error('[Text2Sharepic] Components error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list components'
    });
  }
});

/**
 * GET /corporate-design
 * Get corporate design constants (colors, fonts, spacing)
 */
router.get('/corporate-design', (req, res) => {
  try {
    const corporateDesign = getCorporateDesign();

    res.json({
      success: true,
      corporateDesign
    });

  } catch (error) {
    log.error('[Text2Sharepic] Corporate design error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get corporate design'
    });
  }
});

/**
 * POST /update
 * Update content in an existing layout plan and re-render
 *
 * Body:
 * - layoutPlan: object (required) - Original layout plan
 * - contentUpdates: object (required) - Content fields to update
 */
router.post('/update', async (req, res) => {
  try {
    const { layoutPlan, contentUpdates } = req.body;

    if (!layoutPlan || !contentUpdates) {
      return res.status(400).json({
        success: false,
        error: 'Layout plan and content updates are required'
      });
    }

    log.debug(`[Text2Sharepic] Update request for template: ${layoutPlan.templateId}`);

    const result = await composer.updateAndRender(layoutPlan, contentUpdates);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    log.error('[Text2Sharepic] Update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update and render'
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'text2sharepic',
    cacheEnabled: composer.cacheEnabled,
    timestamp: Date.now()
  });
});

module.exports = router;
