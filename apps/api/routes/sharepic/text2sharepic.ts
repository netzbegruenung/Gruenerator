import { Router, Request, Response } from 'express';
import { createSharepicComposer } from '../../services/text2sharepic/sharepicComposer.js';
import { listTemplates, getTemplate } from '../../services/text2sharepic/zoneTemplates.js';
import { listComponents, getCorporateDesign } from '../../services/text2sharepic/componentLibrary.js';
import { generateLayoutPlan } from '../../services/text2sharepic/LayoutPlanner.js';
import { createLogger } from '../../utils/logger.js';
import { createRequire } from 'module';
import type { LayoutPlan } from '../../services/text2sharepic/types.js';

const require = createRequire(import.meta.url);
const log = createLogger('text2sharepic');
const router: Router = Router();

interface RedisClient {
  get(key: string): Promise<string | null>;
  setEx(key: string, seconds: number, value: string): Promise<void>;
}

let redisClient: RedisClient | null = null;
try {
  redisClient = require('../../utils/redisClient');
} catch (err) {
  log.warn('[Text2Sharepic] Redis client not available, caching disabled');
}

const composer = createSharepicComposer({
  redis: redisClient,
  cacheEnabled: !!redisClient,
  cacheTTL: 3600
});

interface GenerateRequestBody {
  description: string;
  templateId?: string;
  content?: Record<string, unknown>;
  useAI?: boolean;
  skipCache?: boolean;
}

interface GenerateAIRequestBody {
  description: string;
  templateHint?: string;
  mood?: string;
  useBackgroundImage?: boolean;
}

interface EditAIRequestBody {
  layoutPlan: LayoutPlan;
  editRequest: string;
}

interface VariantsRequestBody {
  description: string;
  count?: number;
}

interface PreviewRequestBody {
  description: string;
  templateId?: string;
}

interface RenderPlanRequestBody {
  layoutPlan: LayoutPlan;
}

interface UpdateRequestBody {
  layoutPlan: LayoutPlan;
  contentUpdates: Record<string, unknown>;
}

router.post('/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, templateId, content, useAI, skipCache } = req.body as GenerateRequestBody;

    if (!description || typeof description !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Description is required and must be a string'
      });
      return;
    }

    if (description.length < 5) {
      res.status(400).json({
        success: false,
        error: 'Description must be at least 5 characters'
      });
      return;
    }

    if (description.length > 2000) {
      res.status(400).json({
        success: false,
        error: 'Description must be less than 2000 characters'
      });
      return;
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
      error: (error as Error).message || 'Failed to generate sharepic'
    });
  }
});

router.post('/generate-ai', async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, templateHint, mood, useBackgroundImage } = req.body as GenerateAIRequestBody;

    if (!description || typeof description !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Description is required and must be a string'
      });
      return;
    }

    if (description.length < 5) {
      res.status(400).json({
        success: false,
        error: 'Description must be at least 5 characters'
      });
      return;
    }

    if (description.length > 2000) {
      res.status(400).json({
        success: false,
        error: 'Description must be less than 2000 characters'
      });
      return;
    }

    if (!req.app.locals.aiWorkerPool) {
      res.status(503).json({
        success: false,
        error: 'AI service is not available'
      });
      return;
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
      error: (error as Error).message || 'Failed to generate AI sharepic'
    });
  }
});

router.post('/edit-ai', async (req: Request, res: Response): Promise<void> => {
  try {
    const { layoutPlan, editRequest } = req.body as EditAIRequestBody;

    if (!layoutPlan || typeof layoutPlan !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Layout plan is required and must be an object'
      });
      return;
    }

    if (!editRequest || typeof editRequest !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Edit request is required and must be a string'
      });
      return;
    }

    if (editRequest.length < 3) {
      res.status(400).json({
        success: false,
        error: 'Edit request must be at least 3 characters'
      });
      return;
    }

    if (editRequest.length > 1000) {
      res.status(400).json({
        success: false,
        error: 'Edit request must be less than 1000 characters'
      });
      return;
    }

    if (!req.app.locals.aiWorkerPool) {
      res.status(503).json({
        success: false,
        error: 'AI service is not available'
      });
      return;
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
      error: (error as Error).message || 'Failed to edit sharepic'
    });
  }
});

router.post('/variants', async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, count = 4 } = req.body as VariantsRequestBody;

    if (!description || typeof description !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Description is required'
      });
      return;
    }

    const variantCount = Math.min(Math.max(parseInt(String(count)) || 4, 1), 8);

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
      error: (error as Error).message || 'Failed to generate variants'
    });
  }
});

router.post('/preview', async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, templateId } = req.body as PreviewRequestBody;

    if (!description || typeof description !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Description is required'
      });
      return;
    }

    log.debug(`[Text2Sharepic] Preview request: "${description.substring(0, 100)}..."`);

    const layoutPlan = await generateLayoutPlan(description, { templateId });

    res.json({
      success: true,
      layoutPlan,
      suggestedTemplates: composer.getTemplatesForContent(layoutPlan.analysis?.category || '')
    });

  } catch (error) {
    log.error('[Text2Sharepic] Preview error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message || 'Failed to generate preview'
    });
  }
});

router.post('/render-plan', async (req: Request, res: Response): Promise<void> => {
  try {
    const { layoutPlan } = req.body as RenderPlanRequestBody;

    if (!layoutPlan || typeof layoutPlan !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Layout plan is required'
      });
      return;
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
      error: (error as Error).message || 'Failed to render layout plan'
    });
  }
});

router.get('/templates', (req: Request, res: Response): void => {
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

router.get('/templates/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const template = getTemplate(id);

    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template not found: ${id}`
      });
      return;
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

router.get('/components', (req: Request, res: Response): void => {
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

router.get('/corporate-design', (req: Request, res: Response): void => {
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

router.post('/update', async (req: Request, res: Response): Promise<void> => {
  try {
    const { layoutPlan, contentUpdates } = req.body as UpdateRequestBody;

    if (!layoutPlan || !contentUpdates) {
      res.status(400).json({
        success: false,
        error: 'Layout plan and content updates are required'
      });
      return;
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
      error: (error as Error).message || 'Failed to update and render'
    });
  }
});

router.get('/health', (req: Request, res: Response): void => {
  res.json({
    success: true,
    service: 'text2sharepic',
    cacheEnabled: composer.cacheEnabled,
    timestamp: Date.now()
  });
});

export default router;
