//routes.js
const { createLogger } = require('./utils/logger.js');
const log = createLogger('Routes');

const antraegeRouter = require('./routes/antraege/index');
const recentValuesRouter = require('./routes/recentValues');
// const saveAntragRoute = require('./routes/antraege/saveAntrag');
// const getMyAntraegeRouter = require('./routes/antraege/getMyAntraege');
// const deleteAntragRouter = require('./routes/antraege/deleteAntrag');
// const antragSimpleRoute = require('./routes/antraege/antrag_simple'); // REMOVED direct import/use
// claude_social will be imported dynamically (ES6 module)
const claudeChatRoute = require('./routes/claude_chat');
const { universalRouter, redeRouter, wahlprogrammRouter, buergeranfragenRouter } = require('./routes/claude_universal');
const antragsversteherRoute = require('./routes/claude_antragsversteher');
const sharepicDreizeilenCanvasRoute = require('./routes/sharepic/sharepic_canvas/dreizeilen_canvas');
const zitatSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/zitat_canvas');
const zitatPureSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/zitat_pure_canvas');
const infoSharepicCanvasRoute = require('./routes/sharepic/sharepic_canvas/info_canvas');
const { router: imagineLabelCanvasRoute } = require('./routes/sharepic/sharepic_canvas/imagine_label_canvas');
const campaignCanvasRoute = require('./routes/sharepic/sharepic_canvas/campaign_canvas');
const veranstaltungCanvasRoute = require('./routes/sharepic/sharepic_canvas/veranstaltung_canvas');
const campaignGenerateRoute = require('./routes/sharepic/sharepic_claude/campaign_generate');
const sharepicClaudeRoute = require('./routes/sharepic/sharepic_claude/sharepic_claude');
const text2SharepicRoute = require('./routes/sharepic/text2sharepic');
const { generateSharepicForChat } = require('./routes/chat/services/sharepicGenerationService');
const aiImageModificationRouter = require('./routes/sharepic/sharepic_canvas/aiImageModification');
const imageUploadRouter = require('./routes/sharepic/sharepic_canvas/imageUploadRouter');
const processTextRouter = require('./routes/sharepic/sharepic_canvas/processTextRouter');
const editSessionRouter = require('./routes/sharepic/editSession');
const claudeTextAdjustmentRoute = require('./routes/claude_text_adjustment');
const claudeSuggestEditsRoute = require('./routes/claude_suggest_edits');
const claudeTextImproverRoute = require('./routes/claude_text_improver');
const etherpadRoute = require('./routes/etherpad/etherpadController');
const claudeGrueneJugendRoute = require('./routes/claude_gruene_jugend');
const searchRouter = require('./routes/search/searchRoutes');
const searchAnalysisRouter = require('./routes/search/searchAnalysis');
const imagePickerRoute = require('./routes/imagePickerRoute');
const subtitlerRouter = require('./routes/subtitler/subtitlerController');
const subtitlerSocialRouter = require('./routes/subtitler/subtitlerSocialController');
const subtitlerProjectRouter = require('./routes/subtitler/subtitlerProjectController');
const subtitlerShareRouter = require('./routes/subtitler/subtitlerShareController');
const shareRouter = require('./routes/share/shareController');
// voiceRouter now imported and enabled below
// customGeneratorRoute and generatorConfiguratorRoute will be imported as ES6 modules
// const customGeneratorRoute = require('./routes/custom_generator');
// const generatorConfiguratorRoute = require('./routes/generator_configurator');
const claudeSubtitlesRoute = require('./routes/claude_subtitles');
// claudeGrueneratorAskRoute will be imported dynamically (ES6 module)
const { tusServer } = require('./routes/subtitler/services/tusService');
// DISABLED - Collab feature removed, backup available in archive/collab-feature-backup-2025-01
// const collabEditorRouter = require('./routes/collabEditor'); // Import the new collab editor route
// Snapshotting (Yjs-based) – load conditionally to avoid hard dependency on yjs
let snapshottingRouter = null;
try {
  if (process.env.YJS_ENABLED === 'true') {
    snapshottingRouter = require('./routes/internal/snapshottingController');
    log.debug('Snapshotting controller loaded');
  }
} catch (e) {
  log.debug(`Snapshotting unavailable: ${e.message}`);
}
const offboardingRouter = require('./routes/internal/offboardingController'); // Import the offboarding controller
const webSearchRouter = require('./routes/webSearch'); // Import the web search router
const imageGenerationRouter = require('./routes/imageGeneration'); // Import the image generation router
const exportDocumentsRouter = require('./routes/exportDocuments'); // Server-side DOCX/PDF export
const markdownRouter = require('./routes/markdown'); // Server-side markdown conversion
const databaseTestRouter = require('./routes/databaseTest'); // Database schema test route
const rateLimitRouter = require('./routes/rateLimit'); // Universal rate limiting status API
// mem0Router will be imported dynamically like auth routes
// Auth routes will be imported dynamically

// Route usage tracking - in-memory buffer
const routeStats = new Map();

/**
 * Normalize route pattern by replacing dynamic IDs with placeholders
 * @param {string} path - The request path
 * @returns {string} Normalized route pattern
 */
function normalizeRoute(path) {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id')
    .replace(/\/[0-9a-f]{24}/g, '/:objectid');
}

async function setupRoutes(app) {

  // Route usage tracking middleware - non-blocking, fire-and-forget
  app.use('/api/*splat', (req, res, next) => {
    // Call next() immediately - don't block the request
    next();

    // Track route usage asynchronously
    setImmediate(() => {
      try {
        const routePattern = normalizeRoute(req.path);
        const key = `${req.method} ${routePattern}`;
        routeStats.set(key, (routeStats.get(key) || 0) + 1);
      } catch (err) {
        // Silent failure
      }
    });
  });

  // app.use('/api/subtitler/upload', tusServer.handle.bind(tusServer)); // REMOVED: Redundant, already handled in server.mjs

  // Auth routes (non-API path) - dynamic import for ES modules
  const { default: authCore } = await import('./routes/auth/authCore.mjs');
  const { default: userProfile } = await import('./routes/auth/userProfile.mjs');
  const { default: userContent } = await import('./routes/auth/userContent.mjs');
  const { default: userGroups } = await import('./routes/auth/userGroups.mjs');
  const { default: userCustomGenerators } = await import('./routes/auth/userCustomGenerators.mjs');
  const { default: userTemplates } = await import('./routes/auth/userTemplates.mjs');
  // MOBILE AUTH DISABLED
  // const { default: mobileAuthRoutes } = await import('./routes/auth/mobile.mjs');
  const { default: documentsRouter } = await import('./routes/documents.mjs');

  const { default: oparlRouter } = await import('./routes/oparl.mjs');

  // Import claude_social as ES6 module
  const { default: claudeSocialRoute } = await import('./routes/claude_social.js');
  // Import claude_alttext as ES6 module
  const { default: claudeAlttextRoute } = await import('./routes/claude_alttext.js');
  // Import leichte_sprache as ES6 module
  const { default: leichteSpracheRoute } = await import('./routes/leichte_sprache.js');
  // Import claude_gruenerator_ask as ES6 module
  const { default: claudeGrueneratorAskRoute } = await import('./routes/claude_gruenerator_ask.js');
  // Import claude_website as ES6 module
  const { default: claudeWebsiteRoute } = await import('./routes/claude_website.js');
  // Import custom generator routes as ES6 modules
  const { default: customGeneratorRoute } = await import('./routes/custom_generator.mjs');
  const { default: generatorConfiguratorRoute } = await import('./routes/generator_configurator.mjs');
  // Import Q&A routes as ES6 modules
  const { default: notebookCollectionsRouter } = await import('./routes/notebookCollections.mjs');
  const { default: notebookInteractionRouter } = await import('./routes/notebookInteraction.mjs');
  // Import Canva routes as ES6 modules
  const { default: canvaAuthRouter } = await import('./routes/canva/canvaAuth.mjs');
  const { default: canvaApiRouter } = await import('./routes/canva/canvaApi.mjs');
  // const { default: canvaWebhooksRouter } = await import('./routes/canva/canvaWebhooks.mjs'); // Optional - only needed for real-time updates
  
  // Import Nextcloud routes as ES6 module
  const { default: nextcloudApiRouter } = await import('./routes/nextcloud/nextcloudApi.mjs');
  
  // Import URL crawler route as ES6 module
  const { default: crawlUrlRouter } = await import('./routes/crawlUrl.js');
  
  app.use('/api/auth', authCore);
  app.use('/api/auth', userProfile);
  app.use('/api/auth', userContent);
  app.use('/api/auth', userGroups);
  app.use('/api/auth', userCustomGenerators);
  app.use('/api/auth', userTemplates);
  // MOBILE AUTH DISABLED
  // app.use('/api/auth/mobile', mobileAuthRoutes);
  app.use('/api/auth/notebook-collections', notebookCollectionsRouter);
  app.use('/api/auth/notebook', notebookInteractionRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/oparl', oparlRouter);
  app.use('/api/crawl-url', crawlUrlRouter);
  app.use('/api/recent-values', recentValuesRouter);

  
  // Use the single consolidated router for all /api/antraege paths
  app.use('/api/antraege', antraegeRouter);

  // Remove the separate app.use calls for the individual antraege routes
  // app.use('/api/antraege/my', getMyAntraegeRouter);
  // app.use('/api/antraege', deleteAntragRouter);
  // app.use('/api/antrag-save', saveAntragRoute);

  app.use('/api/claude_social', claudeSocialRoute);
  app.use('/api/claude_alttext', claudeAlttextRoute);
  app.use('/api/claude_website', claudeWebsiteRoute);
  app.use('/api/leichte_sprache', leichteSpracheRoute);
  app.use('/api/claude_rede', redeRouter);
  app.use('/api/claude_buergeranfragen', buergeranfragenRouter);
  app.use('/api/claude_chat', claudeChatRoute);
  app.use('/api/claude_suggest_edits', claudeSuggestEditsRoute);
  app.use('/api/claude_text_improver', claudeTextImproverRoute);

  // Grünerator Chat - Unified chat interface for all agents
  const { default: grueneratorChatRoute } = await import('./routes/chat/grueneratorChat.js');
  app.use('/api/chat', grueneratorChatRoute);
  app.use('/api/antragsversteher', antragsversteherRoute);
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

  // Text2Sharepic - AI-powered text-to-sharepic generation
  app.use('/api/sharepic/text2sharepic', text2SharepicRoute);

  // Use unified handler for all sharepic claude routes
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

  // Unified sharepic generation endpoint - generates complete sharepic (text + image) in one call
  app.post('/api/generate-sharepic', async (req, res) => {
    try {
      const { type, ...requestBody } = req.body;

      if (!type) {
        return res.status(400).json({
          success: false,
          error: 'Sharepic type is required'
        });
      }

      const result = await generateSharepicForChat(req, type, requestBody);

      // Return the complete sharepic with consistent structure
      res.json({
        success: true,
        ...result.content.sharepic,
        metadata: result.content.metadata
      });

    } catch (error) {
      console.error('[UnifiedSharepic] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate sharepic'
      });
    }
  });

  // Zitat with Abyssale generation route - DISABLED until needed
  // const zitatAbyssaleRouter = require('./routes/sharepic/sharepic_abyssale/zitat_abyssale');
  // app.use('/api/zitat_abyssale', zitatAbyssaleRouter);

  app.use('/api/ai-image-modification', aiImageModificationRouter);
  app.use('/api/imageupload', imageUploadRouter);
  app.use('/api/processText', processTextRouter);
  app.use('/api/claude_text_adjustment', claudeTextAdjustmentRoute);
  app.use('/api/etherpad', etherpadRoute);
  app.use('/api/claude_wahlprogramm', wahlprogrammRouter);
  app.use('/api/claude_universal', universalRouter);
  app.use('/api/claude_gruene_jugend', claudeGrueneJugendRoute);
  app.use('/api/claude_gruenerator_ask', claudeGrueneratorAskRoute);
  app.use('/api/custom_generator', customGeneratorRoute); // Public access for view operations
  app.use('/api/auth/custom_generator', customGeneratorRoute); // Authenticated access for management operations
  app.use('/api/generate_generator_config', generatorConfiguratorRoute);
  app.use('/api/claude/generate-short-subtitles', claudeSubtitlesRoute);

  app.use('/api/subtitler', subtitlerRouter);
  app.use('/api/subtitler', subtitlerSocialRouter);
  app.use('/api/subtitler/projects', subtitlerProjectRouter);
  app.use('/api/subtitler/share', subtitlerShareRouter);

  // Unified media sharing routes (images + videos)
  app.use('/api/share', shareRouter);

  // Import and enable Mistral-based voice routes
  const voiceRouter = require('./routes/voice/voiceController');
  app.use('/api/voice', voiceRouter);

  // Unified LangGraph-based search system
  app.use('/api/search', searchRouter); // Handles /, /deep-research, /analyze endpoints
  app.use('/api/analyze', searchRouter); // Redirect to unified controller
  app.use('/api/image-picker', imagePickerRoute); // AI-powered image selection for sharepics
  // DEPRECATED: Legacy SearXNG endpoint - use /api/search instead
  app.use('/api/web-search', webSearchRouter); // TODO: Remove after migration
  app.use('/api/image-generation', imageGenerationRouter);
  app.use('/api/rate-limit', rateLimitRouter); // Universal rate limiting status API for all resource types
  app.use('/api/exports', exportDocumentsRouter);
  app.use('/api/markdown', markdownRouter);
  app.use('/api/database', databaseTestRouter);

  // Add the Collab Editor route - DISABLED - Feature removed, backup available in archive/collab-feature-backup-2025-01
  // app.use('/api/collab-editor', collabEditorRouter);

  // Add internal routes like snapshotting trigger (only if available)
  if (snapshottingRouter) {
    app.use('/api/internal', snapshottingRouter);
  }
  app.use('/api/internal/offboarding', offboardingRouter);

  // Route usage statistics endpoint
  app.get('/api/internal/route-stats', async (req, res) => {
    try {
      const { getPostgresInstance } = await import('./database/services/PostgresService.js');
      const postgresService = getPostgresInstance();

      const limit = parseInt(req.query.limit) || 50;
      const stats = await postgresService.getRouteStats(limit);

      res.json({
        success: true,
        stats,
        currentBuffer: Object.fromEntries(routeStats)
      });
    } catch (error) {
      log.error(`Route stats fetch failed: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Add Canva routes
  app.use('/api/canva/auth', canvaAuthRouter);
  app.use('/api/canva', canvaApiRouter);

  // Add Nextcloud routes
  app.use('/api/nextcloud', nextcloudApiRouter);

  // Add Sites routes (Web-Visitenkarte)
  const { default: sitesRouter } = await import('./routes/sites.mjs');
  const { default: publicSiteRouter } = await import('./routes/publicSite.mjs');
  app.use('/api/sites', sitesRouter);

  // Add Flux greener edit prompt route (ES module)
  const { default: fluxGreenEditPrompt } = await import('./routes/flux/greenEditPrompt.js');
  app.use('/api/flux/green-edit', fluxGreenEditPrompt);

  // Add Imagine Create route (FLUX + Canvas composition with title)
  const imagineCreateRoute = require('./routes/flux/imagineCreate.js');
  app.use('/api/imagine/create', imagineCreateRoute);

  // Add Imagine Pure route (FLUX only, no title/composition)
  const imaginePureRoute = require('./routes/flux/imaginePure.js');
  app.use('/api/imagine/pure', imaginePureRoute);

  // Flush route stats to database every 60 seconds
  setInterval(async () => {
    if (routeStats.size === 0) return;

    // Create snapshot and clear immediately
    const batch = new Map(routeStats);
    routeStats.clear();

    try {
      const { getPostgresInstance } = await import('./database/services/PostgresService.js');
      const postgresService = getPostgresInstance();
      await postgresService.batchUpdateRouteStats(batch);
    } catch (err) {
      // Silent failure - stats are not critical
    }
  }, 60000);

  log.info('Routes initialized');
}

module.exports = { setupRoutes };
