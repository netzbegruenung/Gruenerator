/**
 * API Routes Configuration
 * Central routing setup for all API endpoints
 */

import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { requireAdminToken } from './middleware/adminTokenMiddleware.js';
import authMiddleware from './middleware/authMiddleware.js';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
import antraegeRouter from './routes/antraege/index.js';
import { mountGroupsContractRouter } from './routes/auth/groups/groupsContract/index.js';
import { mountImageModelPreferenceContractRouter } from './routes/auth/imageModelPreferenceContractRouter.js';
import authInitRouter from './routes/auth/initController.js';
import { mountModelPreferencesContractRouter } from './routes/auth/modelPreferencesContractRouter.js';
import { mountAdminVorlagenContractRouter } from './routes/auth/templates/adminVorlagenContractRouter.js';
import { mountUserTemplatesContractRouter } from './routes/auth/templates/userTemplatesContractRouter.js';
import { mountUserProfileContractRouter } from './routes/auth/userProfileContractRouter.js';
import { mountBoardActivityContractRouter } from './routes/boards/boardActivityContractRouter.js';
import { mountBoardAttachmentsContractRouter } from './routes/boards/boardAttachmentsContractRouter.js';
import { boardAttachmentUploadRouter } from './routes/boards/boardAttachmentUpload.js';
import { mountBoardCommentsContractRouter } from './routes/boards/boardCommentsContractRouter.js';
import { mountBoardsContractRouter } from './routes/boards/boardsContractRouter.js';
import { mountBoardSubscriptionsContractRouter } from './routes/boards/boardSubscriptionsContractRouter.js';
import { mountPublicBoardsContractRouter } from './routes/boards/publicBoardsContractRouter.js';
import { mountCanvasAiContractRouter } from './routes/canvas/aiSuggestRoute.js';
import canvasChatEditRouter from './routes/canvas/canvasChatEditController.js';
import { mountCanvasContractRouter } from './routes/canvas/canvasContractRouter.js';
import { mountChatGraphContractRouter } from './routes/chat/chatGraphContractRouter.js';
import { mountThreadsContractRouter } from './routes/chat/threadsContractRouter.js';
import { mountDocsContractRouter } from './routes/docs/docsContractRouter.js';
import { mountDocumentsContractRouter } from './routes/documents/documentsContractRouter.js';
import { mountEmailContractRouter } from './routes/email/emailContractRouter.js';
import etherpadRoute from './routes/etherpad/etherpadController.js';
import { mountExportsContractRouter } from './routes/exports/exportsContractRouter.js';
import exportDocumentsRouter from './routes/exports/index.js';
import imagineCreateRoute from './routes/flux/imagineCreate.js';
import imaginePureRoute from './routes/flux/imaginePure.js';
import outpaintRoute from './routes/flux/outpaint.js';
import { mountImagePickerContractRouter } from './routes/image/imagePickerContractRouter.js';
import {
  pickerController as imagePickerRoute,
  generationController as imageGenerationRouter,
} from './routes/image/index.js';
import { mountContentSyncContractRouter } from './routes/internal/contentSyncContractRouter.js';
import {
  offboardingRouter,
  databaseTestRouter,
  rateLimitRouter,
  grueneApiTestRouter,
  wolkeWatchRouter,
} from './routes/internal/index.js';
import { markdownController as markdownRouter } from './routes/markdown/index.js';
import { mountMonitorContractRouter } from './routes/monitor/monitorContractRouter.js';
import { mountNotebookCollectionsContractRouter } from './routes/notebook/notebookCollectionsContractRouter.js';
import { mountNotebookContractRouter } from './routes/notebook/notebookContractRouter.js';
import { mountNotebookSharingContractRouter } from './routes/notebook/notebookSharingContractRouter.js';
import { mountWolkePendingContractRouter } from './routes/notebook/wolkePendingContractRouter.js';
import notificationsRouter from './routes/notifications/index.js';
import { mountNotificationsContractRouter } from './routes/notifications/notificationsContractRouter.js';
import protokollRouter from './routes/protokoll/index.js';
import { releasesRouter } from './routes/releases/index.js';
import { mountResearchContractRouter } from './routes/research/researchContractRouter.js';
import scannerRouter from './routes/scanner/index.js';
import {
  searchController as searchRouter,
  webSearchController as webSearchRouter,
} from './routes/search/index.js';
import searchGraphRouter from './routes/search/searchGraphController.js';
import { mountShareContractRouter } from './routes/share/shareContractRouter.js';
import shareRouter from './routes/share/shareController.js';
import backgroundRemovalRoute from './routes/sharepic/backgroundRemoval.js';
import editSessionRouter from './routes/sharepic/editSession.js';
import promptRoute from './routes/sharepic/promptRoute.js';
import aiImageModificationRouter from './routes/sharepic/sharepic_canvas/aiImageModification.js';
import campaignCanvasRoute from './routes/sharepic/sharepic_canvas/campaign_canvas.js';
import { mountCampaignCanvasContractRouter } from './routes/sharepic/sharepic_canvas/campaignCanvasContractRouter.js';
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
import { type SharepicRequest } from './routes/sharepic/sharepic_claude/types.js';
import subtitlerRouter from './routes/subtitler/processingController.js';
import subtitlerProjectRouter from './routes/subtitler/projectController.js';
import subtitlerShareRouter from './routes/subtitler/shareController.js';
import subtitlerSocialRouter from './routes/subtitler/socialController.js';
import { mountSubtitlerContractRouter } from './routes/subtitler/subtitlerContractRouter.js';
import {
  universalRouter,
  textAdjustmentRouter as claudeTextAdjustmentRoute,
  textImproverRouter as claudeTextImproverRoute,
  subtitlesRouter as claudeSubtitlesRoute,
  leichteSpracheRouter as leichteSpracheRoute,
} from './routes/texte/index.js';
import { mountTransferContractRouter } from './routes/transfer/transferContractRouter.js';
import { mountUnsplashContractRouter } from './routes/unsplash/unsplashContractRouter.js';
import { recentValuesRouter } from './routes/user/index.js';
import { mountRecentValuesContractRouter } from './routes/user/recentValuesContractRouter.js';
import { mountUserAgentsContractRouter } from './routes/userAgents/userAgentsContractRouter.js';
import v1NotebooksRouter from './routes/v1/notebooksRouter.js';
import { mountVideoContractRouter } from './routes/video/videoContractRouter.js';
import ttsRouter from './routes/voice/ttsController.js';
import { mountVoiceContractRouter } from './routes/voice/voiceContractRouter.js';
import voiceRouter from './routes/voice/voiceController.js';
import { mountWordpressContractRouter } from './routes/wordpress/wordpressContractRouter.js';
import recentActivityRouter from './routes/workplace/recentActivityController.js';
import * as sharepicGenerationService from './services/chat/sharepicGenerationService.js';
import * as tusServiceModule from './services/subtitler/tusService.js';
import { createLogger } from './utils/logger.js';
import { RouteStatsTracker } from './utils/routeStats.js';

import type { Application, Request, Response, NextFunction, Router } from 'express';

/**
 * IP-based rate limiters for abuse prevention.
 * These are intentionally softer since most routes also have frontend-side throttling.
 * Complements the existing Redis-based per-user rate limiter (used for business quotas).
 * Disabled entirely when DISABLE_RATE_LIMITS=true (dev convenience).
 */
const isRateLimitDisabled = process.env.DISABLE_RATE_LIMITS === 'true';

// Bucket key: authenticated user when known, else client IP. Without this,
// users sharing an egress IP (office NAT, CGNAT, VPN) compete for one bucket.
// IPv6 addresses are normalised to their /64 prefix via ipKeyGenerator so a
// single user cannot bypass the limit by rotating low bits of their address.
const perUserOrIpKey = (req: Request): string =>
  req.user?.id ?? (req.ip ? ipKeyGenerator(req.ip) : 'anonymous');

const aiGenerationLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 200, // AI cost control lives in rateLimitMiddleware.ts; this is a safety net only
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: perUserOrIpKey,
      message: { error: 'Too many AI generation requests, please try again later.' },
    });

const standardMutationLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 2000, // DDoS-only ceiling for writes — bulk ops can spike legitimately
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: perUserOrIpKey,
      // Skip GETs so polling endpoints (e.g. /api/subtitler/export-progress/:token,
      // fired every 2s during export) don't consume the mutation budget. The
      // limiter's purpose is abuse-prevention on writes; reads are covered by
      // authenticatedReadLimiter where it matters.
      skip: (req) => req.method === 'GET',
      message: { error: 'Too many requests, please try again later.' },
    });

const authenticatedReadLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10000, // DDoS-only — heavy users with many tabs + polling can hit 2–3k legitimately
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: perUserOrIpKey,
      message: { error: 'Too many requests, please try again later.' },
    });

const publicReadLimiter = isRateLimitDisabled
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 2000, // allow embeds & site visitors without tripping legitimate traffic
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: perUserOrIpKey,
      message: { error: 'Too many requests, please try again later.' },
    });

const log = createLogger('Routes');

const { requireAuth, optionalAuth } = authMiddleware;
const { generateSharepicForChat } = sharepicGenerationService;
const { tusServer: _tusServer } = tusServiceModule;

// Route usage tracking
const routeTracker = new RouteStatsTracker();

// Snapshotting (Yjs-based) – load conditionally to avoid hard dependency on yjs
let snapshottingRouter: Router | null = null;

async function loadOptionalModules(): Promise<void> {
  try {
    if (process.env.YJS_ENABLED === 'true') {
      // Dynamic import - module may not exist
      // @ts-expect-error - Optional module, may not be present
      const module = (await import('./routes/internal/snapshottingController.js')) as {
        default: typeof snapshottingRouter;
      };
      snapshottingRouter = module.default;
      log.debug('Snapshotting controller loaded');
    }
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    log.debug(`Snapshotting unavailable: ${err.message}`);
  }
}

// Initialize optional modules
void loadOptionalModules();

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
    authCoreRouter: _authCoreRouter,
    userCustomGeneratorsRouter: _userCustomGeneratorsRouter,
    contentRouter: _userContentRouter,
    templatesRouter: _userTemplatesRouter,
    groupsRouter: _userGroupsRouter,
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
    recentDocumentsRouter: notebookRecentDocumentsRouter,
    statisticsRouter: notebookStatisticsRouter,
    internalNotebookRouter,
  } = await import('./routes/notebook/index.js');
  const { default: nextcloudApiRouter } = await import('./routes/nextcloud/nextcloudApi.js');
  const { default: connectionsRouter } =
    await import('./routes/connections/connectionsController.js');
  const { default: wordpressApiRouter } = await import('./routes/wordpress/wordpressApi.js');
  const { default: canvaApiRouter } = await import('./routes/canva/canvaApi.js');
  const { urlController: crawlUrlRouter } = await import('./routes/crawl/index.js');
  const { default: grueneratorChatRoute } = await import('./routes/chat/grueneratorChat.js');
  const { default: chatServiceRouter } = await import('./routes/chat/index.js');
  const { default: chatGraphRouter } = await import('./routes/chat/chatGraphController.js');
  const { default: threadSharingRouter } = await import('./routes/chat/threadSharingController.js');
  const { default: gruenOMatRouter } = await import('./routes/gruenomat/gruenOMatController.js');
  const { default: mediaRouter } = await import('./routes/media/mediaController.js');
  const { sitesController: sitesRouter, publicController: _publicSiteRouter } =
    await import('./routes/sites/index.js');
  const { default: flyerController } = await import('./routes/sites/flyerController.js');
  const { default: fluxImageEditingRoute } = await import('./routes/flux/imageEditing.js');
  const { default: unsplashRouter } = await import('./routes/unsplash/unsplashRoutes.js');
  const { default: docsRouter } = await import('./routes/docs/index.js');

  const { default: publicDocRouter } = await import('./routes/docs/publicDocController.js');
  const { default: docResolveRouter } = await import('./routes/docs/resolveController.js');
  const { default: ogDocsRouter } = await import('./routes/docs/ogController.js');
  const { default: usersRouter } = await import('./routes/users/userController.js');
  const { default: smartTexteRouter } = await import('./routes/texte/smart.js');
  const { default: playgroundRouter } = await import('./routes/texte/playground.js');
  const { default: contentTitleRouter } = await import('./routes/texte/contentTitleRoute.js');
  const { default: mem0Router } = await import('./routes/mem0/mem0Controller.js');
  const { default: emailRouter } = await import('./routes/email/emailController.js');
  const { default: videoRouter } = await import('./routes/video/index.js');
  const { default: transferRouter } = await import('./routes/transfer/transferController.js');
  const { default: visionRouter } = await import('./routes/vision/visionController.js');

  // Auth routes — authLimiter applied inside authCore.ts to login/callback only
  // ts-rest contract router — sole owner of /api/auth/profile/* and
  // /api/auth/delete-account (the legacy userProfile router was removed).
  // Mounts before authRouter so its routes register first; `requireAuth` is
  // applied at the prefixes here because the contract router does not inherit
  // middleware from the later `app.use('/api/auth', ...)` mount (Express
  // middleware ordering), and every profile route requires authentication.
  app.use('/api/auth/profile', requireAuth);
  app.use('/api/auth/delete-account', requireAuth);
  mountUserProfileContractRouter(app);
  // ts-rest contract router for admin Vorlagen — mounts BEFORE the legacy authRouter
  // so contract-modeled routes match first; unmatched paths fall through.
  // `requireAuth` is applied at the prefix here because the contract router
  // does not inherit middleware from the later `app.use('/api/auth', ...)`
  // mount (Express middleware ordering), and every admin-vorlagen route
  // requires both authentication and an is_admin check (the latter is
  // enforced per-handler via `checkIsAdmin` inside the contract).
  app.use('/api/auth/admin/vorlagen', requireAuth);
  mountAdminVorlagenContractRouter(app);
  // ts-rest contract router for user templates (Vorlagen CRUD) — replaces the
  // legacy userTemplatesRouter. Mounts BEFORE authRouter so contract routes
  // match first. requireAuth is applied at the prefix because every route
  // requires authentication and the contract router does not inherit the
  // later `app.use('/api/auth', ...)` middleware.
  app.use('/api/auth/user-templates', requireAuth);
  mountUserTemplatesContractRouter(app);
  app.use('/api/auth', authenticatedReadLimiter, authRouter);
  // ts-rest contract router for notebook collections — mounts BEFORE the
  // legacy router so contract-modeled routes match first. requireAuth is
  // applied at the prefix because all 10 routes require authentication.
  app.use('/api/auth/notebook-collections', requireAuth);
  // Neutral "my groups" endpoint used by share dialogs across features. Must
  // be `.use`'d before the contract router mounts the GET /api/auth/groups/me
  // handler so the middleware actually runs.
  app.use('/api/auth/groups', requireAuth);
  // Public-group discovery + join-request endpoints (additive to the legacy
  // group routes). Mounted under the shared `/api/auth/groups` prefix; its
  // literal paths (/discover, /:id/visibility, /:id/join-requests) don't
  // collide with any legacy group route.
  mountGroupsContractRouter(app);
  // Sharing endpoints (share mode, edit policy, group shares) — mounted BEFORE
  // the CRUD router so :id/share doesn't fall through to the legacy router.
  mountNotebookSharingContractRouter(app);
  // Wolke pending-files endpoints (:id/pending-files/...) — mounted BEFORE the
  // CRUD router so they don't fall through to the legacy collectionsController.
  mountWolkePendingContractRouter(app);
  mountNotebookCollectionsContractRouter(app);
  app.use('/api/auth/notebook-collections', authenticatedReadLimiter, notebookCollectionsRouter);
  // Mixed-auth contract: `optionalAuth` populates req.user without rejecting,
  // so per-handler `requireAuthUser()` gates the writes and the public/:token
  // routes still work. Mounted before the legacy router so contract routes win.
  app.use('/api/auth/notebook', optionalAuth);
  mountNotebookContractRouter(app);
  app.use('/api/auth/notebook', authenticatedReadLimiter, notebookInteractionRouter);
  app.use('/api/auth/notebook', authenticatedReadLimiter, notebookRecentDocumentsRouter);
  app.use('/api/auth/notebook', authenticatedReadLimiter, notebookStatisticsRouter);
  // External API for partner integrations (MCP / programmatic access).
  // Auth: per-route Bearer API key middleware (requireApiKey). Rate-limited
  // per-key via apiKeyRateLimit. LV scope enforced inside each handler.
  app.use('/api/v1/notebooks', v1NotebooksRouter);
  // ts-rest contract router for /api/documents — mounts BEFORE the legacy documentsRouter
  // so ts-rest matches its own routes first; unmatched paths fall through.
  // requireAuth is applied at the prefix because all 3 contract routes require auth.
  app.use('/api/documents', requireAuth);
  mountDocumentsContractRouter(app);
  // Public read endpoints — soft limiter prevents scraping
  app.use('/api/documents', publicReadLimiter, documentsRouter);
  app.use('/api/crawl-url', requireAuth, standardMutationLimiter, crawlUrlRouter);
  // ts-rest contract router for /api/recent-values (Phase 4.1 pilot)
  // Mounted BEFORE the legacy router so ts-rest matches its own routes first;
  // unmatched paths fall through to the Express fallback below. `requireAuth`
  // is applied at the prefix because all routes return user-specific data.
  app.use('/api/recent-values', requireAuth);
  mountRecentValuesContractRouter(app);
  app.use('/api/recent-values', publicReadLimiter, recentValuesRouter);
  app.use('/api/antraege', requireAuth, standardMutationLimiter, antraegeRouter);
  app.use('/api/scanner', publicReadLimiter, scannerRouter);
  app.use('/api/protokoll', publicReadLimiter, protokollRouter);

  app.use('/api/claude_social', aiGenerationLimiter, claudeSocialRoute);
  app.use('/api/claude_alttext', aiGenerationLimiter, claudeAlttextRoute);
  app.use('/api/vision', aiGenerationLimiter, requireAuth, visionRouter);
  app.use('/api/claude_website', aiGenerationLimiter, claudeWebsiteRoute);
  app.use('/api/leichte_sprache', aiGenerationLimiter, leichteSpracheRoute);
  app.use('/api/claude_text_improver', aiGenerationLimiter, claudeTextImproverRoute);
  app.use('/api/chat', aiGenerationLimiter, grueneratorChatRoute);
  // ts-rest contract routers — mount before legacy routers.
  // Apply requireAuth on the path prefixes BEFORE the mount calls so
  // unauthenticated requests get a 401 instead of crashing the handlers
  // with `Cannot read properties of undefined (reading 'id')`.
  app.use('/api/chat-service/threads', requireAuth);
  app.use('/api/chat-graph', requireAuth);
  // /api/chat-graph/stream is in CUSTOM_BODY_PARSER_PATHS (bodyParserConfig.ts)
  // so the global 10mb body parser is skipped. The legacy chatGraphController
  // installs its own 50mb parser at controller mount, but ts-rest's contract
  // router (mounted next) runs BEFORE the legacy router and would otherwise
  // see req.body === undefined and 400. Install the same 50mb parser scoped
  // to /api/chat-graph here so both routers receive a parsed body.
  app.use('/api/chat-graph', express.json({ limit: '50mb' }));
  mountThreadsContractRouter(app);
  mountChatGraphContractRouter(app);
  app.use('/api/chat-service', authenticatedReadLimiter, chatServiceRouter);
  app.use('/api/chat-service/threads', authenticatedReadLimiter, threadSharingRouter);
  app.use('/api/chat-graph', aiGenerationLimiter, chatGraphRouter);
  app.use('/api/gruen-o-mat', gruenOMatRouter);
  app.use('/api/dreizeilen_canvas', standardMutationLimiter, sharepicDreizeilenCanvasRoute);
  app.use('/api/zitat_canvas', standardMutationLimiter, zitatSharepicCanvasRoute);
  app.use('/api/zitat_pure_canvas', standardMutationLimiter, zitatPureSharepicCanvasRoute);
  app.use('/api/info_canvas', standardMutationLimiter, infoSharepicCanvasRoute);
  app.use('/api/imagine_label_canvas', standardMutationLimiter, imagineLabelCanvasRoute);
  // Canvas AI suggestions: dedicated Redis-based rate limit bucket
  // (canvas_ai resource) plus the abuse-prevention IP limiter shared with
  // other AI routes. The IP limiter runs first; the Redis middleware
  // auto-increments on success so each completed suggestion request
  // counts against the per-user daily quota.
  app.use(
    '/api/canvas/ai-suggest',
    aiGenerationLimiter,
    rateLimitMiddleware('canvas_ai', { autoIncrement: true })
  );
  mountCanvasAiContractRouter(app);

  // Canvas chat-edit stream: streaming endpoint that wraps notebook chat
  // (research + citations + prose) with a tail canvas-AI-suggest call so
  // operations are research-grounded. Mounted before the canvas CRUD router
  // for the same reason as ai-suggest above.
  app.use(
    '/api/canvas/chat-edit/stream',
    aiGenerationLimiter,
    rateLimitMiddleware('canvas_chat_edit', { autoIncrement: true }),
    canvasChatEditRouter
  );

  // Canvas documents (collaborative): /api/canvas CRUD via ts-rest contract.
  // requireAuth + authenticatedReadLimiter run on the /api/canvas prefix BEFORE
  // the contract endpoints (createExpressEndpoints registers handlers directly
  // on the app, bypassing later prefix middleware). Mounted AFTER the AI-suggest
  // + chat-edit routers above so /api/canvas/ai-suggest and
  // /api/canvas/chat-edit/stream match first.
  app.use('/api/canvas', requireAuth, authenticatedReadLimiter);
  mountCanvasContractRouter(app);

  // ts-rest contract router — mount before legacy campaignCanvasRoute
  mountCampaignCanvasContractRouter(app);
  app.use('/api/campaign_canvas', standardMutationLimiter, campaignCanvasRoute);
  app.use('/api/veranstaltung_canvas', standardMutationLimiter, veranstaltungCanvasRoute);
  app.use('/api/profilbild_canvas', standardMutationLimiter, profilbildCanvasRoute);
  app.use('/api/simple_canvas', standardMutationLimiter, simpleCanvasRoute);
  app.use('/api/slider_canvas', standardMutationLimiter, sliderCanvasRoute);
  app.use('/api/campaign_generate', aiGenerationLimiter, campaignGenerateRoute);
  app.use('/api/dreizeilen_claude', aiGenerationLimiter, sharepicClaudeRoute);
  app.use('/api/sharepic/edit-session', standardMutationLimiter, editSessionRouter);
  app.use('/api/sharepic', aiGenerationLimiter, promptRoute);
  app.use('/api/background-removal', aiGenerationLimiter, requireAuth, backgroundRemovalRoute);

  app.post(
    '/api/zitat_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'zitat');
    }
  );
  app.post(
    '/api/headline_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'headline');
    }
  );
  app.post(
    '/api/info_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'info');
    }
  );
  app.post(
    '/api/veranstaltung_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'veranstaltung');
    }
  );
  app.post(
    '/api/zitat_pure_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'zitat_pure');
    }
  );
  app.post(
    '/api/simple_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'simple');
    }
  );
  app.post(
    '/api/slider_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      if ((req.body as { smartCount?: unknown })?.smartCount) {
        await handleSliderSmartRequest(req as SharepicRequest, res);
      } else {
        await handleClaudeRequest(req as SharepicRequest, res, 'slider');
      }
    }
  );
  app.post(
    '/api/default_claude',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      await handleClaudeRequest(req as SharepicRequest, res, 'default');
    }
  );

  app.post(
    '/api/generate-sharepic',
    aiGenerationLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const { type, ...requestBody } = req.body as { type?: string; [key: string]: unknown };
        if (!type) {
          res.status(400).json({ success: false, error: 'Sharepic type is required' });
          return;
        }
        const result = await generateSharepicForChat(
          req,
          type as string,
          requestBody as Parameters<typeof generateSharepicForChat>[2]
        );
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
  app.use('/api/claude_universal', aiGenerationLimiter, universalRouter);
  app.use('/api/texte/smart', aiGenerationLimiter, smartTexteRouter);
  app.use('/api/texte/playground', requireAuth, aiGenerationLimiter, playgroundRouter);
  app.use('/api/generate-content-title', aiGenerationLimiter, contentTitleRouter);
  app.use('/api/claude_gruenerator_ask', aiGenerationLimiter, claudeGrueneratorAskRoute);
  app.use('/api/custom_generator', aiGenerationLimiter, customGeneratorRoute);
  app.use('/api/auth/custom_generator', aiGenerationLimiter, customGeneratorRoute);
  app.use('/api/generate_generator_config', aiGenerationLimiter, generatorConfiguratorRoute);
  app.use('/api/custom_prompt', aiGenerationLimiter, customPromptRoute);
  app.use('/api/auth/custom_prompt', aiGenerationLimiter, customPromptRoute);
  // ts-rest contract router for user-created agents — replaces the legacy
  // userAgentsRouter. requireAuth runs before the contract mount because
  // createExpressEndpoints registers handlers directly on the app, bypassing
  // any later prefix middleware.
  app.use('/api/user-agents', requireAuth);
  mountUserAgentsContractRouter(app);
  app.use('/api/claude/generate-short-subtitles', aiGenerationLimiter, claudeSubtitlesRoute);
  // requireAuth must run before the contract mount — createExpressEndpoints
  // registers handlers directly on the app, bypassing the legacy prefix
  // middleware. Same pattern as /api/transfer below.
  app.use('/api/subtitler/projects', requireAuth);
  mountSubtitlerContractRouter(app);
  app.use('/api/subtitler', standardMutationLimiter, subtitlerRouter);
  app.use('/api/subtitler', standardMutationLimiter, subtitlerSocialRouter);
  app.use('/api/subtitler/projects', standardMutationLimiter, subtitlerProjectRouter);
  app.use('/api/subtitler/share', publicReadLimiter, subtitlerShareRouter);
  // Populate req.user for /api/share without rejecting unauthenticated reads.
  // The contract router below checks req.user.id per write handler; the legacy
  // router keeps public preview/download/thumbnail endpoints reachable.
  app.use('/api/share', optionalAuth);
  // ts-rest contract router — mount before legacy shareRouter
  mountShareContractRouter(app);
  app.use('/api/share', publicReadLimiter, shareRouter);
  // ts-rest contract router — mount before legacy transferRouter (GET /list and DELETE /:token)
  // POST /upload (multer file upload) falls through to the legacy router.
  app.use('/api/transfer', requireAuth);
  mountTransferContractRouter(app);
  app.use('/api/transfer', standardMutationLimiter, transferRouter);
  app.use('/api/mem0', requireAuth, standardMutationLimiter, mem0Router);
  // ts-rest contract router for /api/email — mounts BEFORE legacy emailRouter
  // so the typed /test endpoint matches first; /send-content stays on legacy.
  app.use('/api/email', requireAuth);
  mountEmailContractRouter(app);
  app.use('/api/email', standardMutationLimiter, emailRouter);
  app.use('/api/auth/init', publicReadLimiter, authInitRouter);
  app.use('/api/recent-activity', publicReadLimiter, recentActivityRouter);
  // ts-rest contract router for notifications — mounts BEFORE the legacy router
  // so contract-modeled routes match first; /stream SSE falls through to legacy.
  // requireAuth applied at prefix; notification-preferences also handled here.
  app.use('/api/notifications', requireAuth);
  app.use('/api/auth/profile', requireAuth);
  mountNotificationsContractRouter(app);
  mountModelPreferencesContractRouter(app);
  mountImageModelPreferenceContractRouter(app);
  app.use('/api/notifications', requireAuth, publicReadLimiter, notificationsRouter);
  app.use('/api/media', requireAuth, authenticatedReadLimiter, mediaRouter);
  app.use('/api/og/docs', publicReadLimiter, ogDocsRouter);
  app.use('/api/docs/resolve', optionalAuth, publicReadLimiter, docResolveRouter);
  app.use('/api/docs/public', publicReadLimiter, publicDocRouter);
  // ts-rest contract router for /api/docs — mounts BEFORE the legacy docsRouter
  // so ts-rest matches its own routes first; unmatched paths fall through.
  // `requireAuth` is applied at the prefix so the contract router inherits
  // protection. The /api/og/docs, /api/docs/resolve, and /api/docs/public
  // routers above are registered first, so public docs requests match and
  // terminate before this middleware runs.
  app.use('/api/docs', requireAuth);
  mountDocsContractRouter(app);
  app.use('/api/docs', authenticatedReadLimiter, docsRouter);

  // Public board lookup (no auth). Registered first so requests terminate here
  // before the requireAuth gate below ever runs.
  app.use('/api/boards/public', publicReadLimiter);
  mountPublicBoardsContractRouter(app);
  // All authenticated board + comment endpoints are contracted via ts-rest.
  // requireAuth + the read limiter apply at the prefix; the contract routers
  // register their own routes after, so the middleware runs first.
  app.use('/api/boards', requireAuth, authenticatedReadLimiter);
  app.use('/api/board-comments', requireAuth, authenticatedReadLimiter);
  app.use('/api/board-activity', requireAuth, authenticatedReadLimiter);
  app.use('/api/board-subscriptions', requireAuth, authenticatedReadLimiter);
  app.use('/api/board-attachments', requireAuth, authenticatedReadLimiter);
  mountBoardsContractRouter(app);
  mountBoardCommentsContractRouter(app);
  mountBoardActivityContractRouter(app);
  mountBoardSubscriptionsContractRouter(app);
  // Plain Express upload/download routes BEFORE the ts-rest contract router so the
  // multipart/binary handlers aren't shadowed by the JSON contract's validation.
  app.use('/api/board-attachments', boardAttachmentUploadRouter);
  mountBoardAttachmentsContractRouter(app);
  app.use('/api/users', requireAuth, publicReadLimiter, usersRouter);
  // ts-rest contract router — mount before legacy voiceController router
  mountVoiceContractRouter(app);
  app.use('/api/voice', publicReadLimiter, voiceRouter);
  app.use('/api/voice/tts', requireAuth, standardMutationLimiter, ttsRouter);
  // searchContractRouter exists but is intentionally NOT mounted yet — the
  // pilot contract doesn't model the SSE `?stream=true` mode that the frontend
  // depends on. Activate once streaming is added to the contract.
  app.use('/api/search', publicReadLimiter, searchRouter);
  app.use('/api/analyze', publicReadLimiter, searchRouter);
  app.use('/api/search-graph', requireAuth, standardMutationLimiter, searchGraphRouter);
  // ts-rest contract router — mount before legacy imagePickerRoute
  mountImagePickerContractRouter(app);
  app.use('/api/image-picker', publicReadLimiter, imagePickerRoute);
  // ts-rest contract router — mount before legacy unsplashRouter
  mountUnsplashContractRouter(app);
  app.use('/api/unsplash', publicReadLimiter, unsplashRouter);
  app.use('/api/web-search', publicReadLimiter, webSearchRouter);
  // Apply auth + rate limiting on the prefix BEFORE mounting the ts-rest
  // router (createExpressEndpoints registers routes directly on `app`, so the
  // prefix middleware must be in place first to gate them).
  app.use('/api/research', requireAuth, standardMutationLimiter);
  mountResearchContractRouter(app);
  app.use('/api/image-generation', aiGenerationLimiter, imageGenerationRouter);
  app.use('/api/rate-limit', publicReadLimiter, rateLimitRouter);

  // Debug: log all requests to /api/releases/*
  app.use('/api/releases', (req, res, next) => {
    console.log(
      `[Routes] Request to /api/releases: ${req.method} ${req.path} (originalUrl: ${req.originalUrl})`
    );
    next();
  });
  app.use('/api/releases', publicReadLimiter, releasesRouter);
  // ts-rest contract router — mount before legacy exports router
  mountExportsContractRouter(app);
  app.use('/api/exports', requireAuth, authenticatedReadLimiter, exportDocumentsRouter);
  app.use('/api/markdown', publicReadLimiter, markdownRouter);
  app.use('/api/database', publicReadLimiter, databaseTestRouter);

  if (snapshottingRouter) {
    app.use('/api/internal', snapshottingRouter);
  }
  app.use('/api/internal/offboarding', offboardingRouter);
  app.use('/api/internal/wolke-watch', wolkeWatchRouter);
  app.use('/api/internal/gruene-api', grueneApiTestRouter);
  app.use('/api/internal/notebook', internalNotebookRouter);
  // Content-sync is a ts-rest contract router; apply the admin-token prefix
  // before the endpoints register on `app` (createExpressEndpoints uses
  // absolute paths, so prefix middleware must be mounted first).
  app.use('/api/internal/content-sync', requireAdminToken);
  mountContentSyncContractRouter(app);
  // Monitor: one contract router serves both the public /api/monitor/* routes
  // and the admin /api/internal/monitor/* refresh routes. Apply each prefix's
  // middleware before the endpoints register on `app`.
  app.use('/api/internal/monitor', requireAdminToken);
  app.use('/api/monitor', requireAuth, publicReadLimiter);
  mountMonitorContractRouter(app);

  app.get(
    '/api/internal/route-stats',
    publicReadLimiter,
    async (req: Request, res: Response): Promise<void> => {
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
    }
  );

  // ts-rest contract router — mount before legacy videoRouter
  app.use('/api/video', requireAuth);
  mountVideoContractRouter(app);
  app.use('/api/video', requireAuth, standardMutationLimiter, videoRouter);
  app.use('/api/nextcloud', requireAuth, standardMutationLimiter, nextcloudApiRouter);
  app.use('/api/connections', standardMutationLimiter, requireAuth, connectionsRouter);
  // Direct Canva Connect API (OAuth2 + PKCE). requireAuth is applied per-route
  // inside the router — the OAuth callback must stay public (cookie-less redirect).
  app.use('/api/canva', standardMutationLimiter, canvaApiRouter);
  // ts-rest contract router — mount before legacy wordpressApiRouter
  // requireAuth is also inside the legacy router, but we apply it here
  // since the contract router runs first.
  app.use('/api/wordpress', requireAuth);
  mountWordpressContractRouter(app);
  app.use('/api/wordpress', standardMutationLimiter, requireAuth, wordpressApiRouter);
  app.use('/api/sites/generate-from-flyer', aiGenerationLimiter, flyerController);
  app.use('/api/sites', standardMutationLimiter, sitesRouter);
  app.use('/api/flux/green-edit', aiGenerationLimiter, fluxImageEditingRoute);
  app.use('/api/imagine/create', aiGenerationLimiter, imagineCreateRoute);
  app.use('/api/imagine/pure', aiGenerationLimiter, imaginePureRoute);
  app.use('/api/imagine/outpaint', aiGenerationLimiter, outpaintRoute);

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
