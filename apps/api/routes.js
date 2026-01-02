//routes.js
import { createLogger } from './utils/logger.js';
import authMiddleware from './middleware/authMiddleware.js';
import antraegeRouter from './routes/antraege/index.js';
import recentValuesRouter from './routes/recentValues.js';
import * as claudeUniversal from './routes/claude_universal.ts';
import sharepicDreizeilenCanvasRoute from './routes/sharepic/sharepic_canvas/dreizeilen_canvas.js';
import zitatSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/zitat_canvas.js';
import zitatPureSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/zitat_pure_canvas.js';
import infoSharepicCanvasRoute from './routes/sharepic/sharepic_canvas/info_canvas.js';
import * as imagineLabelCanvasModule from './routes/sharepic/sharepic_canvas/imagine_label_canvas.js';
import campaignCanvasRoute from './routes/sharepic/sharepic_canvas/campaign_canvas.js';
import veranstaltungCanvasRoute from './routes/sharepic/sharepic_canvas/veranstaltung_canvas.js';
import campaignGenerateRoute from './routes/sharepic/sharepic_claude/campaign_generate.js';
import sharepicClaudeRoute from './routes/sharepic/sharepic_claude/sharepic_claude.js';
import text2SharepicRoute from './routes/sharepic/text2sharepic.js';
import * as sharepicGenerationService from './services/chat/sharepicGenerationService.js';
import aiImageModificationRouter from './routes/sharepic/sharepic_canvas/aiImageModification.js';
import imageUploadRouter from './routes/sharepic/sharepic_canvas/imageUploadRouter.js';
import processTextRouter from './routes/sharepic/sharepic_canvas/processTextRouter.js';
import editSessionRouter from './routes/sharepic/editSession.js';
import claudeTextAdjustmentRoute from './routes/claude_text_adjustment.ts';
import claudeSuggestEditsRoute from './routes/claude_suggest_edits.ts';
import claudeTextImproverRoute from './routes/claude_text_improver.ts';
import etherpadRoute from './routes/etherpad/etherpadController.js';
import claudeGrueneJugendRoute from './routes/claude_gruene_jugend.ts';
import searchRouter from './routes/search/searchRoutes.js';
import searchAnalysisRouter from './routes/search/searchAnalysis.js';
import imagePickerRoute from './routes/imagePickerRoute.js';
import subtitlerRouter from './routes/subtitler/subtitlerController.js';
import subtitlerSocialRouter from './routes/subtitler/subtitlerSocialController.js';
import subtitlerProjectRouter from './routes/subtitler/subtitlerProjectController.js';
import subtitlerShareRouter from './routes/subtitler/subtitlerShareController.js';
import shareRouter from './routes/share/shareController.js';
import claudeSubtitlesRoute from './routes/claude_subtitles.ts';
import * as tusServiceModule from './services/subtitler/tusService.js';
import offboardingRouter from './routes/internal/offboardingController.js';
import webSearchRouter from './routes/webSearch.js';
import imageGenerationRouter from './routes/imageGeneration.js';
import exportDocumentsRouter from './routes/exportDocuments.js';
import markdownRouter from './routes/markdown.js';
import databaseTestRouter from './routes/databaseTest.js';
import rateLimitRouter from './routes/rateLimit.js';
import releasesRouter from './routes/releases.js';
import voiceRouter from './routes/voice/voiceController.js';
import imagineCreateRoute from './routes/flux/imagineCreate.js';
import imaginePureRoute from './routes/flux/imaginePure.js';

const log = createLogger('Routes');

const { requireAuth } = authMiddleware;
const { universalRouter, redeRouter, wahlprogrammRouter, buergeranfragenRouter } = claudeUniversal;
const { router: imagineLabelCanvasRoute } = imagineLabelCanvasModule;
const { generateSharepicForChat } = sharepicGenerationService;
const { tusServer } = tusServiceModule;

// Snapshotting (Yjs-based) – load conditionally to avoid hard dependency on yjs
let snapshottingRouter = null;
try {
  if (process.env.YJS_ENABLED === 'true') {
    const module = await import('./routes/internal/snapshottingController.js');
    snapshottingRouter = module.default;
    log.debug('Snapshotting controller loaded');
  }
} catch (e) {
  log.debug(`Snapshotting unavailable: ${e.message}`);
}

// Route usage tracking - in-memory buffer
const routeStats = new Map();

function normalizeRoute(path) {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[0-9a-f]{24}/g, '/:objectid');
}

async function setupRoutes(app) {
  app.use('/api/*splat', (req, res, next) => {
    next();
    setImmediate(() => {
      try {
        const routePattern = normalizeRoute(req.path);
        const key = `${req.method} ${routePattern}`;
        routeStats.set(key, (routeStats.get(key) || 0) + 1);
      } catch (err) {}
    });
  });

  // Dynamic imports for ES modules (.mjs files)
  const { default: authCore } = await import('./routes/auth/authCore.mjs');
  const { default: userProfile } = await import('./routes/auth/userProfile.mjs');
  const { default: userContent } = await import('./routes/auth/userContent.mjs');
  const { default: userGroups } = await import('./routes/auth/userGroups.mjs');
  const { default: userCustomGenerators } = await import('./routes/auth/userCustomGenerators.mjs');
  const { default: userTemplates } = await import('./routes/auth/userTemplates.mjs');
  const { default: documentsRouter } = await import('./routes/documents.mjs');
  const { default: oparlRouter } = await import('./routes/oparl.mjs');
  const { default: claudeSocialRoute } = await import('./routes/claude_social.ts');
  const { default: claudeAlttextRoute } = await import('./routes/claude_alttext.ts');
  const { default: leichteSpracheRoute } = await import('./routes/leichte_sprache.js');
  const { default: claudeGrueneratorAskRoute } = await import('./routes/claude_gruenerator_ask.ts');
  const { default: claudeWebsiteRoute } = await import('./routes/claude_website.ts');
  const { default: customGeneratorRoute } = await import('./routes/custom_generator.mjs');
  const { default: generatorConfiguratorRoute } = await import('./routes/generator_configurator.mjs');
  const { default: notebookCollectionsRouter } = await import('./routes/notebookCollections.mjs');
  const { default: notebookInteractionRouter } = await import('./routes/notebookInteraction.mjs');
  const { default: canvaAuthRouter } = await import('./routes/canva/canvaAuth.mjs');
  const { default: canvaApiRouter } = await import('./routes/canva/canvaApi.mjs');
  const { default: nextcloudApiRouter } = await import('./routes/nextcloud/nextcloudApi.mjs');
  const { default: crawlUrlRouter } = await import('./routes/crawlUrl.js');
  const { default: grueneratorChatRoute } = await import('./routes/chat/grueneratorChat.js');
  const { default: mediaRouter } = await import('./routes/media/mediaController.js');
  const { default: sitesRouter } = await import('./routes/sites.mjs');
  const { default: publicSiteRouter } = await import('./routes/publicSite.mjs');
  const { default: fluxGreenEditPrompt } = await import('./routes/flux/greenEditPrompt.js');

  app.use('/api/auth', authCore);
  app.use('/api/auth', userProfile);
  app.use('/api/auth', userContent);
  app.use('/api/auth', userGroups);
  app.use('/api/auth', userCustomGenerators);
  app.use('/api/auth', userTemplates);
  app.use('/api/auth/notebook-collections', notebookCollectionsRouter);
  app.use('/api/auth/notebook', notebookInteractionRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/oparl', oparlRouter);
  app.use('/api/crawl-url', crawlUrlRouter);
  app.use('/api/recent-values', recentValuesRouter);
  app.use('/api/antraege', antraegeRouter);

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
  app.use('/api/campaign_generate', campaignGenerateRoute);
  app.use('/api/dreizeilen_claude', sharepicClaudeRoute);
  app.use('/api/sharepic/edit-session', editSessionRouter);
  app.use('/api/sharepic/text2sharepic', text2SharepicRoute);

  app.post('/api/zitat_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'zitat');
  });
  app.post('/api/headline_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'headline');
  });
  app.post('/api/info_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'info');
  });
  app.post('/api/veranstaltung_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'veranstaltung');
  });
  app.post('/api/zitat_pure_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'zitat_pure');
  });
  app.post('/api/default_claude', async (req, res) => {
    await sharepicClaudeRoute.handleClaudeRequest(req, res, 'default');
  });

  app.post('/api/generate-sharepic', async (req, res) => {
    try {
      const { type, ...requestBody } = req.body;
      if (!type) {
        return res.status(400).json({ success: false, error: 'Sharepic type is required' });
      }
      const result = await generateSharepicForChat(req, type, requestBody);
      res.json({ success: true, ...result.content.sharepic, metadata: result.content.metadata });
    } catch (error) {
      console.error('[UnifiedSharepic] Error:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to generate sharepic' });
    }
  });

  app.use('/api/ai-image-modification', aiImageModificationRouter);
  app.use('/api/imageupload', imageUploadRouter);
  app.use('/api/processText', processTextRouter);
  app.use('/api/claude_text_adjustment', claudeTextAdjustmentRoute);
  app.use('/api/etherpad', etherpadRoute);
  app.use('/api/claude_wahlprogramm', wahlprogrammRouter);
  app.use('/api/claude_universal', universalRouter);
  app.use('/api/claude_gruene_jugend', claudeGrueneJugendRoute);
  app.use('/api/claude_gruenerator_ask', claudeGrueneratorAskRoute);
  app.use('/api/custom_generator', customGeneratorRoute);
  app.use('/api/auth/custom_generator', customGeneratorRoute);
  app.use('/api/generate_generator_config', generatorConfiguratorRoute);
  app.use('/api/claude/generate-short-subtitles', claudeSubtitlesRoute);
  app.use('/api/subtitler', subtitlerRouter);
  app.use('/api/subtitler', subtitlerSocialRouter);
  app.use('/api/subtitler/projects', subtitlerProjectRouter);
  app.use('/api/subtitler/share', subtitlerShareRouter);
  app.use('/api/share', shareRouter);
  app.use('/api/media', requireAuth, mediaRouter);
  app.use('/api/voice', voiceRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/analyze', searchRouter);
  app.use('/api/image-picker', imagePickerRoute);
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

  app.get('/api/internal/route-stats', async (req, res) => {
    try {
      const { getPostgresInstance } = await import('./database/services/PostgresService.js');
      const postgresService = getPostgresInstance();
      const limit = parseInt(req.query.limit) || 50;
      const stats = await postgresService.getRouteStats(limit);
      res.json({ success: true, stats, currentBuffer: Object.fromEntries(routeStats) });
    } catch (error) {
      log.error(`Route stats fetch failed: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.use('/api/canva/auth', canvaAuthRouter);
  app.use('/api/canva', canvaApiRouter);
  app.use('/api/nextcloud', nextcloudApiRouter);
  app.use('/api/sites', sitesRouter);
  app.use('/api/flux/green-edit', fluxGreenEditPrompt);
  app.use('/api/imagine/create', imagineCreateRoute);
  app.use('/api/imagine/pure', imaginePureRoute);

  setInterval(async () => {
    if (routeStats.size === 0) return;
    const batch = new Map(routeStats);
    routeStats.clear();
    try {
      const { getPostgresInstance } = await import('./database/services/PostgresService.js');
      const postgresService = getPostgresInstance();
      await postgresService.batchUpdateRouteStats(batch);
    } catch (err) {}
  }, 60000);

  log.info('Routes initialized');
}

export { setupRoutes };
export default { setupRoutes };
