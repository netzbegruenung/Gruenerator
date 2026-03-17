/**
 * API Routes Configuration
 * Central routing setup for all API endpoints
 */

import rateLimit from 'express-rate-limit';

import authMiddleware from './middleware/authMiddleware.js';
import antraegeRouter from './routes/antraege/index.js';
import etherpadRoute from './routes/etherpad/etherpadController.js';
import exportDocumentsRouter from './routes/exports/index.js';
import imagineCreateRoute from './routes/flux/imagineCreate.js';
import imaginePureRoute from './routes/flux/imaginePure.js';
import {
  pickerController as imagePickerRoute,
  generationController as imageGenerationRouter,
} from './routes/image/index.js';
import { offboardingRouter, databaseTestRouter, rateLimitRouter } from './routes/internal/index.js';
import { markdownController as markdownRouter } from './routes/markdown/index.js';
import { oparlRouter } from './routes/oparl/index.js';
import protokollRouter from './routes/protokoll/index.js';
import { releasesRouter } from './routes/releases/index.js';
import researchRouter from './routes/research/researchController.js';
import scannerRouter from './routes/scanner/index.js';
import {
  searchController as searchRouter,
  webSearchController as webSearchRouter,
} from './routes/search/index.js';
import searchGraphRouter from './routes/search/searchGraphController.js';
import shareRouter from './routes/share/shareController.js';
import editSessionRouter from './routes/sharepic/editSession.js';
import promptRoute from './routes/sharepic/promptRoute.js';
import aiImageModificationRouter from './routes/sharepic/sharepic_canvas/aiImageModification.js';
import campaignCanvasRoute from './routes/sharepic/sharepic_canvas/campaign_canvas.js';
import sharepicDreizeilenCanvasRoute from './routes/sharepic/sharepic_canvas/dreizeilen_canvas.js';
import imageUploadRouter from './routes/sharepic/sharepic_canvas/imageUploadRouter.js';
import imagineLabelCanvasRoute from './routes/sharepic/sharepic_canvas/imagine_label_canvas.js';
import infoSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/info_canvas.js';
import processTextRouter from './routes/sharepic/sharepic_canvas/processTextRouter.js';
import profilbildCanvasRoute from './routes/sharepic/sharepic_canvas/profilbild_canvas.js';
import simpleCanvasRoute from './routes/sharepic/sharepic_canvas/simple_canvas.js';
import sliderCanvasRoute from './routes/sharepic/sharepic_canvas/slider_canvas.js';
import veranstaltungCanvasRoute from './routes/sharepic/sharepic_canvas/veranstaltung_canvas.js';
import zitatSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/zitat_canvas.js';
import zitatPureSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/zitat_pure_canvas.js';
import campaignGenerateRoute from './routes/sharepic/sharepic_claude/campaign_generate.js';
import sharepicClaudeRoute, {
  handleClaudeRequest,
  handleSliderSmartRequest,
} from './routes/sharepic/sharepic_claude/index.js';
import subtitlerRouter from './routes/subtitler/processingController.js';
import subtitlerProjectRouter from './routes/subtitler/projectController.js';
import subtitlerShareRouter from './routes/subtitler/shareController.js';
import subtitlerSocialRouter from './routes/subtitler/socialController.js';
import {
  universalRouter,
  redeRouter,
  wahlprogrammRouter,
  buergeranfragenRouter,
  textAdjustmentRouter as claudeTextAdjustmentRoute,
  textImproverRouter as claudeTextImproverRoute,
  grueneJugendRouter as claudeGrueneJugendRoute,
  subtitlesRouter as claudeSubtitlesRoute,
  leichteSpracheRouter as leichteSpracheRoute,
} from './routes/texte/index.js';
import { recentValuesRouter } from './routes/user/index.js';
import ttsRouter from './routes/voice/ttsController.js';
import voiceRouter from './routes/voice/voiceController.js';
import * as sharepicGenerationService from './services/chat/sharepicGenerationService.js';
import * as tusServiceModule from './services/subtitler/tusService.js';
import { createLogger } from './utils/logger.js';
import { RouteStatsTracker } from './utils/routeStats.js';

import type { Application, Request, Response, NextFunction } from 'express';

/**
 * IP-based rate limiters for abuse prevention.
 * These are intentionally softer since most routes also have frontend-side throttling.
 * Complements the existing Redis-based per-user rate limiter (used for business quotas).
 * Disabled entirely when DISABLE_RATE_LIMITS=true (dev convenience).
 */
const isRateLimitDisabled = process.env.DISABLE_RATE_LIMITS === 'true';

const aiGenerationLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // ~13 per minute average — protects against abuse, not normal use
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many AI generation requests, please try again later.' },
    });

const standardMutationLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    });

const authLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 30, // strict — protects against brute-force on login/register
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many authentication requests, please try again later.' },
    });

const publicReadLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 500, // soft — prevents scraping, allows normal use
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
    });

const log = createLogger('Routes');

const { requireAuth } = authMiddleware;
const { generateSharepicForChat } = sharepicGenerationService;
const { tusServer } = tusServiceModule;

// Route usage tracking
const routeTracker = new RouteStatsTracker();

// Snapshotting (Yjs-based) – load conditionally to avoid hard dependency on yjs
let snapshottingRouter: any = null;

async function loadOptionalModules(): Promise<void> {
  try {
    if (process.env.YJS_ENABLED === 'true') {
      // Dynamic import - module may not exist
      // @ts-expect-error - Optional module, may not be present
      const module = await import('./routes/internal/snapshottingController.js');
      snapshottingRouter = module.default;
      log.debug('Snapshotting controller loaded');
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    log.debug(`Snapshotting unavailable: ${err.message}`);
  }
}

// Initialize optional modules
loadOptionalModules();

export async function setupRoutes(app: Application): Promise<void> {
  // Debug: Log ALL API requests at the start
  app.use('/api/*splat', (req: Request, res: Response, next: NextFunction) => {
    if (req.originalUrl.includes('releases')) {
      console.log(`[Routes DEBUG] API request: ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  // Route tracking middleware
  app.use('/api/*splat', (req: Request, res: Response, next: NextFunction) => {
    next();
    setImmediate(() => {
      routeTracker.track(req.method, req.path);
    });
  });

  // Dynamic imports for ES modules
  // Auth routes - now TypeScript with subdirectory structure
  const {
    default: authRouter,
    authCoreRouter,
    userProfileRouter,
    userCustomGeneratorsRouter,
    contentRouter: userContentRouter,
    templatesRouter: userTemplatesRouter,
    groupsRouter: userGroupsRouter,
  } = await import('./routes/auth/index.js');
  const { default: documentsRouter } = await import('./routes/documents/index.js');
  const { default: claudeSocialRoute } = await import('./routes/texte/social.js');
  const { default: claudeAlttextRoute } = await import('./routes/texte/alttext.js');
  const { default: claudeGrueneratorAskRoute } = await import('./routes/texte/gruenerator_ask.js');
  const { default: claudeWebsiteRoute } = await import('./routes/texte/website.js');
  const { default: customGeneratorRoute } =
    await import('./routes/custom_generators/custom_generator.js');
  const { default: generatorConfiguratorRoute } =
    await import('./routes/custom_generators/generator_configurator.js');
  const { default: customPromptRoute } = await import('./routes/custom_prompts/custom_prompt.js');
  const {
    collectionsRouter: notebookCollectionsRouter,
    interactionRouter: notebookInteractionRouter,
  } = await import('./routes/notebook/index.js');
  const { default: nextcloudApiRouter } = await import('./routes/nextcloud/nextcloudApi.js');
  const { urlController: crawlUrlRouter } = await import('./routes/crawl/index.js');
  const { default: grueneratorChatRoute } = await import('./routes/chat/grueneratorChat.js');
  const { default: chatServiceRouter } = await import('./routes/chat/index.js');
  const { default: chatGraphRouter } = await import('./routes/chat/chatGraphController.js');
  const { default: chatDeepRouter } = await import('./routes/chat/chatDeepController.js'); // @experimental — DeepAgent, not production-ready
  const { default: threadSharingRouter } = await import('./routes/chat/threadSharingController.js');
  const { default: gruenOMatRouter } = await import('./routes/gruenomat/gruenOMatController.js');
  const { default: mediaRouter } = await import('./routes/media/mediaController.js');
  const { sitesController: sitesRouter, publicController: publicSiteRouter } =
    await import('./routes/sites/index.js');
  const { default: flyerController } = await import('./routes/sites/flyerController.js');
  const { default: fluxImageEditingRoute } = await import('./routes/flux/imageEditing.js');
  const { default: unsplashRouter } = await import('./routes/unsplash/unsplashRoutes.js');
  const { default: docsRouter } = await import('./routes/docs/index.js');
  const { default: publicDocRouter } = await import('./routes/docs/publicDocController.js');
  const { default: boardsRouter } = await import('./routes/boards/boardsController.js');
  const { default: publicBoardRouter } = await import('./routes/boards/publicBoardController.js');
  const { default: usersRouter } = await import('./routes/users/userController.js');
  const { default: smartTexteRouter } = await import('./routes/texte/smart.js');
  const { default: contentTitleRouter } = await import('./routes/texte/contentTitleRoute.js');
  const { default: mem0Router } = await import('./routes/mem0/mem0Controller.js');
  const { default: emailRouter } = await import('./routes/email/emailController.js');
  const { default: videoRouter } = await import('./routes/video/index.js');

  // Auth routes — strict limiter for brute-force protection on login/register
  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/auth/notebook-collections', notebookCollectionsRouter);
  app.use('/api/auth/notebook', notebookInteractionRouter);
  // Public read endpoints — soft limiter prevents scraping
  app.use('/api/documents', publicReadLimiter, documentsRouter);
  app.use('/api/oparl', publicReadLimiter, oparlRouter);
  app.use('/api/crawl-url', crawlUrlRouter);
  app.use('/api/recent-values', publicReadLimiter, recentValuesRouter);
  app.use('/api/antraege', requireAuth, antraegeRouter);
  app.use('/api/scanner', publicReadLimiter, scannerRouter);
  app.use('/api/protokoll', publicReadLimiter, protokollRouter);

  app.use('/api/claude_social', aiGenerationLimiter, claudeSocialRoute);
  app.use('/api/claude_alttext', aiGenerationLimiter, claudeAlttextRoute);
  app.use('/api/claude_website', aiGenerationLimiter, claudeWebsiteRoute);
  app.use('/api/leichte_sprache', aiGenerationLimiter, leichteSpracheRoute);
  app.use('/api/claude_rede', aiGenerationLimiter, redeRouter);
  app.use('/api/claude_buergeranfragen', aiGenerationLimiter, buergeranfragenRouter);
  app.use('/api/claude_text_improver', aiGenerationLimiter, claudeTextImproverRoute);
  app.use('/api/chat', aiGenerationLimiter, grueneratorChatRoute);
  app.use('/api/chat-service', standardMutationLimiter, chatServiceRouter);
  app.use('/api/chat-service/threads', standardMutationLimiter, threadSharingRouter);
  app.use('/api/chat-graph', aiGenerationLimiter, chatGraphRouter);
  app.use('/api/chat-deep', aiGenerationLimiter, chatDeepRouter); // @experimental — DeepAgent route, not production-ready
  app.use('/api/gruen-o-mat', gruenOMatRouter);
  app.use('/api/dreizeilen_canvas', standardMutationLimiter, sharepicDreizeilenCanvasRoute);
  app.use('/api/zitat_canvas', standardMutationLimiter, zitatSharepicCanvasRoute);
  app.use('/api/zitat_pure_canvas', standardMutationLimiter, zitatPureSharepicCanvasRoute);
  app.use('/api/info_canvas', standardMutationLimiter, infoSharepicCanvasRoute);
  app.use('/api/imagine_label_canvas', standardMutationLimiter, imagineLabelCanvasRoute);
  app.use('/api/campaign_canvas', standardMutationLimiter, campaignCanvasRoute);
  app.use('/api/veranstaltung_canvas', standardMutationLimiter, veranstaltungCanvasRoute);
  app.use('/api/profilbild_canvas', standardMutationLimiter, profilbildCanvasRoute);
  app.use('/api/simple_canvas', standardMutationLimiter, simpleCanvasRoute);
  app.use('/api/slider_canvas', standardMutationLimiter, sliderCanvasRoute);
  app.use('/api/campaign_generate', aiGenerationLimiter, campaignGenerateRoute);
  app.use('/api/dreizeilen_claude', aiGenerationLimiter, sharepicClaudeRoute);
  app.use('/api/sharepic/edit-session', standardMutationLimiter, editSessionRouter);
  app.use('/api/sharepic', aiGenerationLimiter, promptRoute);

  app.post(
    '/api/zitat_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'zitat');
    }
  );
  app.post(
    '/api/headline_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'headline');
    }
  );
  app.post(
    '/api/info_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'info');
    }
  );
  app.post(
    '/api/veranstaltung_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'veranstaltung');
    }
  );
  app.post(
    '/api/zitat_pure_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'zitat_pure');
    }
  );
  app.post(
    '/api/simple_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'simple');
    }
  );
  app.post(
    '/api/slider_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      if (req.body.smartCount) {
        await handleSliderSmartRequest(req as any, res);
      } else {
        await handleClaudeRequest(req as any, res, 'slider');
      }
    }
  );
  app.post(
    '/api/default_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as any, res, 'default');
    }
  );

  app.post(
    '/api/generate-sharepic',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { type, ...requestBody } = req.body;
        if (!type) {
          res.status(400).json({ success: false, error: 'Sharepic type is required' });
          return;
        }
        const result = await generateSharepicForChat(req as any, type, requestBody);
        res.json({ success: true, ...result.content.sharepic, metadata: result.content.metadata });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('[UnifiedSharepic] Error:', err);
        res
          .status(500)
          .json({ success: false, error: err.message || 'Failed to generate sharepic' });
      }
    }
  );

  app.use('/api/ai-image-modification', aiGenerationLimiter, aiImageModificationRouter);
  app.use('/api/imageupload', standardMutationLimiter, imageUploadRouter);
  app.use('/api/processText', aiGenerationLimiter, processTextRouter);
  app.use('/api/claude_text_adjustment', aiGenerationLimiter, claudeTextAdjustmentRoute);
  app.use('/api/etherpad', standardMutationLimiter, etherpadRoute);
  app.use('/api/claude_wahlprogramm', aiGenerationLimiter, wahlprogrammRouter);
  app.use('/api/claude_universal', aiGenerationLimiter, universalRouter);
  app.use('/api/texte/smart', aiGenerationLimiter, smartTexteRouter);
  app.use('/api/generate-content-title', aiGenerationLimiter, contentTitleRouter);
  app.use('/api/claude_gruene_jugend', aiGenerationLimiter, claudeGrueneJugendRoute);
  app.use('/api/claude_gruenerator_ask', aiGenerationLimiter, claudeGrueneratorAskRoute);
  app.use('/api/custom_generator', customGeneratorRoute);
  app.use('/api/auth/custom_generator', customGeneratorRoute);
  app.use('/api/generate_generator_config', generatorConfiguratorRoute);
  app.use('/api/custom_prompt', customPromptRoute);
  app.use('/api/auth/custom_prompt', customPromptRoute);
  app.use('/api/claude/generate-short-subtitles', aiGenerationLimiter, claudeSubtitlesRoute);
  app.use('/api/subtitler', standardMutationLimiter, subtitlerRouter);
  app.use('/api/subtitler', standardMutationLimiter, subtitlerSocialRouter);
  app.use('/api/subtitler/projects', subtitlerProjectRouter);
  app.use('/api/subtitler/share', subtitlerShareRouter);
  app.use('/api/share', shareRouter);
  app.use('/api/mem0', requireAuth, mem0Router);
  app.use('/api/email', requireAuth, emailRouter);
  app.use('/api/media', requireAuth, mediaRouter);
  app.use('/api/docs/public', publicDocRouter);
  app.use('/api/docs', requireAuth, docsRouter);
  app.use('/api/boards/public', publicBoardRouter);
  app.use('/api/boards', requireAuth, boardsRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/voice', voiceRouter);
  app.use('/api/voice/tts', requireAuth, ttsRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/analyze', searchRouter);
  app.use('/api/search-graph', requireAuth, searchGraphRouter);
  app.use('/api/image-picker', imagePickerRoute);
  app.use('/api/unsplash', unsplashRouter);
  app.use('/api/web-search', webSearchRouter);
  app.use('/api/research', requireAuth, researchRouter);
  app.use('/api/image-generation', aiGenerationLimiter, imageGenerationRouter);
  app.use('/api/rate-limit', rateLimitRouter);

  // Debug: log all requests to /api/releases/*
  app.use('/api/releases', (req, res, next) => {
    console.log(
      `[Routes] Request to /api/releases: ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`
    );
    next();
  });
  app.use('/api/releases', publicReadLimiter, releasesRouter);
  app.use('/api/exports', exportDocumentsRouter);
  app.use('/api/markdown', markdownRouter);
  app.use('/api/database', databaseTestRouter);

  if (snapshottingRouter) {
    app.use('/api/internal', snapshottingRouter);
  }
  app.use('/api/internal/offboarding', offboardingRouter);

  app.get('/api/internal/route-stats', async (req: Request, res: Response): Promise<void> => {
    try {
      const { getPostgresInstance } = await import('./database/services/PostgresService.js');
      const postgresService = getPostgresInstance();
      const limit = parseInt(req.query.limit as string) || 50;
      const stats = await postgresService.getRouteStats(limit);
      res.json({ success: true, stats, currentBuffer: routeTracker.getStatsObject() });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`Route stats fetch failed: ${err.message}`);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.use('/api/video', requireAuth, videoRouter);
  app.use('/api/nextcloud', nextcloudApiRouter);
  app.use('/api/sites/generate-from-flyer', aiGenerationLimiter, flyerController);
  app.use('/api/sites', standardMutationLimiter, sitesRouter);
  app.use('/api/flux/green-edit', aiGenerationLimiter, fluxImageEditingRoute);
  app.use('/api/imagine/create', aiGenerationLimiter, imagineCreateRoute);
  app.use('/api/imagine/pure', aiGenerationLimiter, imaginePureRoute);

  // Web redirect to frontend imagine (KI image studio)
  app.get('/web', (req: Request, res: Response) => {
    res.redirect(`${req.protocol}://${req.get('host')}/imagine`);
  });

  // Periodic flush of route stats to database
  setInterval(async () => {
    if (!routeTracker.hasStats()) return;
    const batch = routeTracker.flush();
    try {
      const { getPostgresInstance } = await import('./database/services/PostgresService.js');
      const postgresService = getPostgresInstance();
      await postgresService.batchUpdateRouteStats(batch);
    } catch {
      // Silently ignore flush errors
    }
  }, 60000);

  log.info('Routes initialized');
}

// Export the route tracker for external access if needed
export { routeTracker };

export default { setupRoutes };
