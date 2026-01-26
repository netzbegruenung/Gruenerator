/**
 * API Routes Configuration
 * Central routing setup for all API endpoints
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { createLogger } from './utils/logger.js';
import { RouteStatsTracker } from './utils/routeStats.js';
import authMiddleware from './middleware/authMiddleware.js';
import antraegeRouter from './routes/antraege/index.js';
import { recentValuesRouter } from './routes/user/index.js';
import {
  universalRouter,
  redeRouter,
  wahlprogrammRouter,
  buergeranfragenRouter,
  textAdjustmentRouter as claudeTextAdjustmentRoute,
  suggestEditsRouter as claudeSuggestEditsRoute,
  textImproverRouter as claudeTextImproverRoute,
  grueneJugendRouter as claudeGrueneJugendRoute,
  subtitlesRouter as claudeSubtitlesRoute,
  leichteSpracheRouter as leichteSpracheRoute,
} from './routes/texte/index.js';
import sharepicDreizeilenCanvasRoute from './routes/sharepic/sharepic_canvas/dreizeilen_canvas.js';
import zitatSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/zitat_canvas.js';
import zitatPureSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/zitat_pure_canvas.js';
import infoSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/info_canvas.js';
import imagineLabelCanvasRoute from './routes/sharepic/sharepic_canvas/imagine_label_canvas.js';
import campaignCanvasRoute from './routes/sharepic/sharepic_canvas/campaign_canvas.js';
import veranstaltungCanvasRoute from './routes/sharepic/sharepic_canvas/veranstaltung_canvas.js';
import profilbildCanvasRoute from './routes/sharepic/sharepic_canvas/profilbild_canvas.js';
import simpleCanvasRoute from './routes/sharepic/sharepic_canvas/simple_canvas.js';
import campaignGenerateRoute from './routes/sharepic/sharepic_claude/campaign_generate.js';
import sharepicClaudeRoute, {
  handleClaudeRequest,
} from './routes/sharepic/sharepic_claude/index.js';
import * as sharepicGenerationService from './services/chat/sharepicGenerationService.js';
import aiImageModificationRouter from './routes/sharepic/sharepic_canvas/aiImageModification.js';
import imageUploadRouter from './routes/sharepic/sharepic_canvas/imageUploadRouter.js';
import processTextRouter from './routes/sharepic/sharepic_canvas/processTextRouter.js';
import editSessionRouter from './routes/sharepic/editSession.js';
import etherpadRoute from './routes/etherpad/etherpadController.js';
import {
  searchController as searchRouter,
  webSearchController as webSearchRouter,
} from './routes/search/index.js';
import { pickerController as imagePickerRoute } from './routes/image/index.js';
import subtitlerRouter from './routes/subtitler/processingController.js';
import subtitlerSocialRouter from './routes/subtitler/socialController.js';
import subtitlerProjectRouter from './routes/subtitler/projectController.js';
import subtitlerShareRouter from './routes/subtitler/shareController.js';
import shareRouter from './routes/share/shareController.js';
import * as tusServiceModule from './services/subtitler/tusService.js';
import { offboardingRouter, databaseTestRouter, rateLimitRouter } from './routes/internal/index.js';
import { generationController as imageGenerationRouter } from './routes/image/index.js';
import exportDocumentsRouter from './routes/exports/index.js';
import { markdownController as markdownRouter } from './routes/markdown/index.js';
import { releasesRouter } from './routes/releases/index.js';
import { oparlRouter } from './routes/oparl/index.js';
import voiceRouter from './routes/voice/voiceController.js';
import imagineCreateRoute from './routes/flux/imagineCreate.js';
import imaginePureRoute from './routes/flux/imaginePure.js';
import promptRoute from './routes/sharepic/promptRoute.js';
import planModeRouter from './routes/plan-mode/index.js';

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
      // @ts-ignore - Optional module, may not be present
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
  const { default: canvaAuthRouter } = await import('./routes/canva/canvaAuth.js');
  const { default: canvaApiRouter } = await import('./routes/canva/canvaApi.js');
  const { default: nextcloudApiRouter } = await import('./routes/nextcloud/nextcloudApi.js');
  const { urlController: crawlUrlRouter } = await import('./routes/crawl/index.js');
  const { default: grueneratorChatRoute } = await import('./routes/chat/grueneratorChat.js');
  const { default: mediaRouter } = await import('./routes/media/mediaController.js');
  const { sitesController: sitesRouter, publicController: publicSiteRouter } =
    await import('./routes/sites/index.js');
  const { default: fluxImageEditingRoute } = await import('./routes/flux/imageEditing.js');
  const { default: unsplashRouter } = await import('./routes/unsplash/unsplashRoutes.js');
  const { default: docsRouter } = await import('./routes/docs/index.js');
  const { default: usersRouter } = await import('./routes/users/userController.js');
  const { default: smartTexteRouter } = await import('./routes/texte/smart.js');

  // Auth routes - combined TypeScript router
  app.use('/api/auth', authRouter);
  app.use('/api/auth/notebook-collections', notebookCollectionsRouter);
  app.use('/api/auth/notebook', notebookInteractionRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/oparl', oparlRouter);
  app.use('/api/crawl-url', crawlUrlRouter);
  app.use('/api/recent-values', recentValuesRouter);
  app.use('/api/antraege', requireAuth, antraegeRouter);
  app.use('/api/plan-mode', requireAuth, planModeRouter);

  app.use('/api/claude_social', claudeSocialRoute);
  app.use('/api/claude_alttext', claudeAlttextRoute);
  app.use('/api/claude_website', claudeWebsiteRoute);
  app.use('/api/leichte_sprache', leichteSpracheRoute);
  app.use('/api/claude_rede', redeRouter);
  app.use('/api/claude_buergeranfragen', buergeranfragenRouter);
  app.use('/api/claude_suggest_edits', claudeSuggestEditsRoute);
  app.use('/api/claude_text_improver', claudeTextImproverRoute);
  app.use('/api/chat', grueneratorChatRoute);
  app.use('/api/dreizeilen_canvas', sharepicDreizeilenCanvasRoute);
  app.use('/api/zitat_canvas', zitatSharepicCanvasRoute);
  app.use('/api/zitat_pure_canvas', zitatPureSharepicCanvasRoute);
  app.use('/api/info_canvas', infoSharepicCanvasRoute);
  app.use('/api/imagine_label_canvas', imagineLabelCanvasRoute);
  app.use('/api/campaign_canvas', campaignCanvasRoute);
  app.use('/api/veranstaltung_canvas', veranstaltungCanvasRoute);
  app.use('/api/profilbild_canvas', profilbildCanvasRoute);
  app.use('/api/simple_canvas', simpleCanvasRoute);
  app.use('/api/campaign_generate', campaignGenerateRoute);
  app.use('/api/dreizeilen_claude', sharepicClaudeRoute);
  app.use('/api/sharepic/edit-session', editSessionRouter);
  app.use('/api/sharepic', promptRoute);

  app.post('/api/zitat_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'zitat');
  });
  app.post('/api/headline_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'headline');
  });
  app.post('/api/info_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'info');
  });
  app.post('/api/veranstaltung_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'veranstaltung');
  });
  app.post('/api/zitat_pure_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'zitat_pure');
  });
  app.post('/api/simple_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'simple');
  });
  app.post('/api/default_claude', async (req: Request, res: Response): Promise<void> => {
    await handleClaudeRequest(req as any, res, 'default');
  });

  app.post('/api/generate-sharepic', async (req: Request, res: Response): Promise<void> => {
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
      res.status(500).json({ success: false, error: err.message || 'Failed to generate sharepic' });
    }
  });

  app.use('/api/ai-image-modification', aiImageModificationRouter);
  app.use('/api/imageupload', imageUploadRouter);
  app.use('/api/processText', processTextRouter);
  app.use('/api/claude_text_adjustment', claudeTextAdjustmentRoute);
  app.use('/api/etherpad', etherpadRoute);
  app.use('/api/claude_wahlprogramm', wahlprogrammRouter);
  app.use('/api/claude_universal', universalRouter);
  app.use('/api/texte/smart', smartTexteRouter);
  app.use('/api/claude_gruene_jugend', claudeGrueneJugendRoute);
  app.use('/api/claude_gruenerator_ask', claudeGrueneratorAskRoute);
  app.use('/api/custom_generator', customGeneratorRoute);
  app.use('/api/auth/custom_generator', customGeneratorRoute);
  app.use('/api/generate_generator_config', generatorConfiguratorRoute);
  app.use('/api/custom_prompt', customPromptRoute);
  app.use('/api/auth/custom_prompt', customPromptRoute);
  app.use('/api/claude/generate-short-subtitles', claudeSubtitlesRoute);
  app.use('/api/subtitler', subtitlerRouter);
  app.use('/api/subtitler', subtitlerSocialRouter);
  app.use('/api/subtitler/projects', subtitlerProjectRouter);
  app.use('/api/subtitler/share', subtitlerShareRouter);
  app.use('/api/share', shareRouter);
  app.use('/api/media', requireAuth, mediaRouter);
  app.use('/api/docs', requireAuth, docsRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/voice', voiceRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/analyze', searchRouter);
  app.use('/api/image-picker', imagePickerRoute);
  app.use('/api/unsplash', unsplashRouter);
  app.use('/api/web-search', webSearchRouter);
  app.use('/api/image-generation', imageGenerationRouter);
  app.use('/api/rate-limit', rateLimitRouter);
  app.use('/api/releases', releasesRouter);
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

  app.use('/api/canva/auth', canvaAuthRouter);
  app.use('/api/canva', canvaApiRouter);
  app.use('/api/nextcloud', nextcloudApiRouter);
  app.use('/api/sites', sitesRouter);
  app.use('/api/flux/green-edit', fluxImageEditingRoute);
  app.use('/api/imagine/create', imagineCreateRoute);
  app.use('/api/imagine/pure', imaginePureRoute);

  // Web redirect to frontend imagine (KI image studio)
  app.get('/web', (req: Request, res: Response) => {
    res.redirect('http://localhost:3000/imagine');
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
