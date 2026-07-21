/**
 * API Routes Configuration
 * Central routing setup for all API endpoints
 */

import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { env } from './config/env.js';
import { requireAdminToken } from './middleware/adminTokenMiddleware.js';
import authMiddleware from './middleware/authMiddleware.js';
import { rateLimitMiddleware } from './middleware/rateLimitMiddleware.js';
import antraegeRouter from './routes/antraege/index.js';
import { mountGroupsContractRouter } from './routes/auth/groups/groupsContract/index.js';
import { mountImageModelPreferenceContractRouter } from './routes/auth/imageModelPreferenceContractRouter.js';
import authInitRouter from './routes/auth/initController.js';
import { mountModelPreferencesContractRouter } from './routes/auth/modelPreferencesContractRouter.js';
import { mountPromptsContractRouter } from './routes/auth/promptsContractRouter.js';
import { mountAdminVorlagenContractRouter } from './routes/auth/templates/adminVorlagenContractRouter.js';
import { mountTemplateInteractionsContractRouter } from './routes/auth/templates/templateInteractionsContractRouter.js';
import { mountUserTemplatesContractRouter } from './routes/auth/templates/userTemplatesContractRouter.js';
import { mountUserProfileContractRouter } from './routes/auth/userProfileContractRouter.js';
import { mountBoardActivityContractRouter } from './routes/boards/boardActivityContractRouter.js';
import { mountBoardAgentContractRouter } from './routes/boards/boardAgentContractRouter.js';
import { mountBoardAttachmentsContractRouter } from './routes/boards/boardAttachmentsContractRouter.js';
import { boardAttachmentUploadRouter } from './routes/boards/boardAttachmentUpload.js';
import { mountBoardCardDocumentsContractRouter } from './routes/boards/boardCardDocumentsContractRouter.js';
import { mountBoardCommentsContractRouter } from './routes/boards/boardCommentsContractRouter.js';
import { mountBoardSchedulesContractRouter } from './routes/boards/boardSchedulesContractRouter.js';
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
import { mountMcpOAuthCallbackRouter } from './routes/mcp/mcpOAuthCallbackRouter.js';
import { mountMcpServersContractRouter } from './routes/mcp/mcpServersContractRouter.js';
import mcpServerRouter from './routes/mcp-server/index.js';
import { mountMonitorContractRouter } from './routes/monitor/monitorContractRouter.js';
import { mountNotebookCollectionsContractRouter } from './routes/notebook/notebookCollectionsContractRouter.js';
import { mountNotebookContractRouter } from './routes/notebook/notebookContractRouter.js';
import { mountNotebookSharingContractRouter } from './routes/notebook/notebookSharingContractRouter.js';
import { mountWolkePendingContractRouter } from './routes/notebook/wolkePendingContractRouter.js';
import notificationsRouter from './routes/notifications/index.js';
import { mountNotificationsContractRouter } from './routes/notifications/notificationsContractRouter.js';
import presentationExportRouter from './routes/presentations/presentationExportController.js';
import { mountPresentationsContractRouter } from './routes/presentations/presentationsContractRouter.js';
import protokollRouter from './routes/protokoll/index.js';
import { mountRecurringTasksContractRouter } from './routes/recurringTasks/recurringTasksContractRouter.js';
import { mountReisekostenContractRouter } from './routes/reisekosten/reisekostenContractRouter.js';
import { releasesRouter } from './routes/releases/index.js';
import { mountResearchContractRouter } from './routes/research/researchContractRouter.js';
import scannerRouter from './routes/scanner/index.js';
import { mountGlobalSearchContractRouter } from './routes/search/globalSearchContractRouter.js';
import {
  searchController as searchRouter,
  webSearchController as webSearchRouter,
} from './routes/search/index.js';
import searchGraphRouter from './routes/search/searchGraphController.js';
import { mountShareContractRouter } from './routes/share/shareContractRouter.js';
import shareFileRouter from './routes/share/shareFileRouter.js';
import { mountShareReadContractRouter } from './routes/share/shareReadContractRouter.js';
import backgroundRemovalRoute from './routes/sharepic/backgroundRemoval.js';
import editSessionRouter from './routes/sharepic/editSession.js';
import promptRoute from './routes/sharepic/promptRoute.js';
import aiImageModificationRouter from './routes/sharepic/sharepic_canvas/aiImageModification.js';
import dreizeilenAtCanvasRoute from './routes/sharepic/sharepic_canvas/at/dreizeilen_at_canvas.js';
import infoAtCanvasRoute from './routes/sharepic/sharepic_canvas/at/info_at_canvas.js';
import zitatAtCanvasRoute from './routes/sharepic/sharepic_canvas/at/zitat_at_canvas.js';
import zitatPureAtCanvasRoute from './routes/sharepic/sharepic_canvas/at/zitat_pure_at_canvas.js';
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
// Österreich (de-AT) canvas renderers
import campaignGenerateRoute from './routes/sharepic/sharepic_claude/campaign_generate.js';
import sharepicClaudeRoute, {
  handleClaudeRequest,
  handleSliderSmartRequest,
} from './routes/sharepic/sharepic_claude/index.js';
import { type SharepicRequest } from './routes/sharepic/sharepic_claude/types.js';
import { mountSheetsContractRouter } from './routes/sheets/sheetsContractRouter.js';
import { mountSitesContractRouter } from './routes/sites/sitesContractRouter.js';
import subtitlerRouter from './routes/subtitler/processingController.js';
import subtitlerProjectRouter from './routes/subtitler/projectController.js';
import subtitlerShareRouter from './routes/subtitler/shareController.js';
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
import { mountItemUsageContractRouter } from './routes/usage/itemUsageContractRouter.js';
import { recentValuesRouter } from './routes/user/index.js';
import { mountRecentValuesContractRouter } from './routes/user/recentValuesContractRouter.js';
import { mountUserAgentsContractRouter } from './routes/userAgents/userAgentsContractRouter.js';
import { mountUserAgentsSharingContractRouter } from './routes/userAgents/userAgentsSharingContractRouter.js';
import v1CollectionsRouter from './routes/v1/collectionsRouter.js';
import v1NotebooksRouter from './routes/v1/notebooksRouter.js';
import { mountVideoContractRouter } from './routes/video/videoContractRouter.js';
import ttsRouter from './routes/voice/ttsController.js';
import { mountVoiceContractRouter } from './routes/voice/voiceContractRouter.js';
import voiceRouter from './routes/voice/voiceController.js';
import { mountRecentActivityContractRouter } from './routes/workplace/recentActivityContractRouter.js';
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
    contentRouter: _userContentRouter,
    templatesRouter: _userTemplatesRouter,
    groupsRouter: _userGroupsRouter,
  } = await import('./routes/auth/index.js');
  const { default: documentsRouter } = await import('./routes/documents/index.js');
  const { default: claudeSocialRoute } = await import('./routes/texte/social.js');
  const { default: claudeAlttextRoute } = await import('./routes/texte/alttext.js');
  const { default: claudeGrueneratorAskRoute } = await import('./routes/texte/gruenerator_ask.js');
  const { default: claudeWebsiteRoute } = await import('./routes/texte/website.js');
  const { default: customPromptRoute } = await import('./routes/custom_prompts/custom_prompt.js');
  const { internalNotebookRouter } = await import('./routes/notebook/index.js');
  const { internalAgentInsightRouter } =
    await import('./routes/agents/internalAgentInsightController.js');
  const { default: nextcloudApiRouter } = await import('./routes/nextcloud/nextcloudApi.js');
  const { default: connectionsRouter } =
    await import('./routes/connections/connectionsController.js');
  const { default: canvaApiRouter } = await import('./routes/canva/canvaApi.js');
  const { default: vorlagenApiRouter } = await import('./routes/vorlagen/vorlagenApi.js');
  const { urlController: crawlUrlRouter } = await import('./routes/crawl/index.js');
  const { default: chatServiceRouter } = await import('./routes/chat/index.js');
  const { default: threadSharingRouter } = await import('./routes/chat/threadSharingController.js');
  const { default: gruenOMatRouter } = await import('./routes/gruenomat/gruenOMatController.js');
  const { default: mediaRouter } = await import('./routes/media/mediaController.js');
  const { sitesController: sitesRouter, publicController: _publicSiteRouter } =
    await import('./routes/sites/index.js');
  const { default: flyerController } = await import('./routes/sites/flyerController.js');
  const { default: fluxImageEditingRoute } = await import('./routes/flux/imageEditing.js');
  const { mountImageEditContractRouter } = await import('./routes/flux/imageEditContractRouter.js');
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
  app.use('/api/auth/locale', requireAuth);
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
  // ts-rest contract router for template likes & favorites — mounts BEFORE the
  // legacy authRouter so contract routes match first. requireAuth is applied at
  // the prefix because every route requires authentication.
  app.use('/api/auth/templates', requireAuth);
  mountTemplateInteractionsContractRouter(app);
  // ts-rest contract router for user prompts (custom_prompts + saved_prompts
  // CRUD) — mounts BEFORE authRouter so contract routes match first; the
  // legacy userCustomPrompts router keeps the semantic-search / discovery
  // endpoints. requireAuth at the prefixes because every route requires auth.
  app.use('/api/auth/custom_prompts', requireAuth);
  app.use('/api/auth/saved_prompts', requireAuth);
  mountPromptsContractRouter(app);
  app.use('/api/auth', authenticatedReadLimiter, authRouter);
  // ts-rest contract router for notebook collections. requireAuth is
  // applied at the prefix because all routes require authentication.
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
  // the CRUD router so :id/share matches before the :id CRUD routes.
  mountNotebookSharingContractRouter(app);
  // Wolke pending-files endpoints (:id/pending-files/...) — mounted BEFORE the
  // CRUD router so they match before the :id CRUD routes.
  mountWolkePendingContractRouter(app);
  mountNotebookCollectionsContractRouter(app);
  // Mixed-auth contract: `optionalAuth` populates req.user without rejecting,
  // so per-handler `requireAuthUser()` gates the writes and the public/:token
  // routes still work.
  app.use('/api/auth/notebook', optionalAuth);
  mountNotebookContractRouter(app);
  // External API for partner integrations (MCP / programmatic access).
  // Auth: per-route Bearer API key middleware (requireApiKey). Rate-limited
  // per-key via apiKeyRateLimit. LV scope enforced inside each handler.
  app.use('/api/v1/notebooks', v1NotebooksRouter);
  // Public MCP collection catalog (unauthenticated, rate-limited).
  app.use('/api/v1/collections', publicReadLimiter, v1CollectionsRouter);
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
  // ts-rest contract router for /api/reisekosten (Fahrtkosten-Grünerator).
  // requireAuth at the prefix — all routes handle user-entered expense data.
  app.use('/api/reisekosten', requireAuth, standardMutationLimiter);
  mountReisekostenContractRouter(app);
  // ts-rest contract router for /api/item-usage (usage-based "favourites first"
  // ordering). requireAuth at the prefix — returns user-specific data.
  app.use('/api/item-usage', requireAuth, publicReadLimiter);
  mountItemUsageContractRouter(app);
  app.use('/api/antraege', requireAuth, standardMutationLimiter, antraegeRouter);
  app.use('/api/scanner', publicReadLimiter, scannerRouter);
  app.use('/api/protokoll', publicReadLimiter, protokollRouter);

  app.use('/api/claude_social', aiGenerationLimiter, claudeSocialRoute);
  app.use('/api/claude_alttext', aiGenerationLimiter, claudeAlttextRoute);
  app.use('/api/vision', aiGenerationLimiter, requireAuth, visionRouter);
  app.use('/api/claude_website', aiGenerationLimiter, claudeWebsiteRoute);
  app.use('/api/leichte_sprache', aiGenerationLimiter, leichteSpracheRoute);
  app.use('/api/claude_text_improver', aiGenerationLimiter, claudeTextImproverRoute);
  // ts-rest contract routers — mount before legacy routers.
  // Apply requireAuth on the path prefixes BEFORE the mount calls so
  // unauthenticated requests get a 401 instead of crashing the handlers
  // with `Cannot read properties of undefined (reading 'id')`.
  app.use('/api/chat-service/threads', requireAuth);
  app.use('/api/chat-graph', requireAuth);
  // /api/chat-graph/stream is in CUSTOM_BODY_PARSER_PATHS (bodyParserConfig.ts)
  // so the global 10mb body parser is skipped. Install a 50mb parser scoped
  // to /api/chat-graph here so the contract router receives a parsed body
  // (large payloads: base64 image attachments).
  app.use('/api/chat-graph', express.json({ limit: '50mb' }));
  app.use('/api/chat-graph', aiGenerationLimiter);
  mountThreadsContractRouter(app);
  mountChatGraphContractRouter(app);
  app.use('/api/chat-service', authenticatedReadLimiter, chatServiceRouter);
  app.use('/api/chat-service/threads', authenticatedReadLimiter, threadSharingRouter);
  // optionalAuth so the gruen_o_mat limiter can bucket logged-in users as
  // 'authenticated' (50/day) instead of the 'anonymous' 20/day fallback.
  // The tool stays public — anonymous access is still allowed (anonymous = 20).
  app.use('/api/gruen-o-mat', optionalAuth, gruenOMatRouter);
  app.use('/api/dreizeilen_canvas', standardMutationLimiter, sharepicDreizeilenCanvasRoute);
  app.use('/api/zitat_canvas', standardMutationLimiter, zitatSharepicCanvasRoute);
  app.use('/api/zitat_pure_canvas', standardMutationLimiter, zitatPureSharepicCanvasRoute);
  app.use('/api/info_canvas', standardMutationLimiter, infoSharepicCanvasRoute);
  // Österreich (de-AT) canvas renderers
  app.use('/api/info_at_canvas', standardMutationLimiter, infoAtCanvasRoute);
  app.use('/api/zitat_at_canvas', standardMutationLimiter, zitatAtCanvasRoute);
  app.use('/api/zitat_pure_at_canvas', standardMutationLimiter, zitatPureAtCanvasRoute);
  app.use('/api/dreizeilen_at_canvas', standardMutationLimiter, dreizeilenAtCanvasRoute);
  app.use('/api/imagine_label_canvas', standardMutationLimiter, imagineLabelCanvasRoute);
  // Canvas AI suggestions: dedicated Redis-based rate limit bucket
  // (canvas_ai resource) plus the abuse-prevention IP limiter shared with
  // other AI routes. The IP limiter runs first; the Redis middleware
  // auto-increments on success so each completed suggestion request
  // counts against the per-user daily quota.
  // optionalAuth resolves req.user before the Redis limiter so logged-in users
  // are bucketed as 'authenticated' (100/day) rather than the 'anonymous' 5/day
  // fallback. Anonymous access stays allowed here (canvas_ai anonymous = 5).
  app.use(
    '/api/canvas/ai-suggest',
    aiGenerationLimiter,
    optionalAuth,
    rateLimitMiddleware('canvas_ai', { autoIncrement: true })
  );
  mountCanvasAiContractRouter(app);

  // Canvas chat-edit stream: streaming endpoint that wraps notebook chat
  // (research + citations + prose) with a tail canvas-AI-suggest call so
  // operations are research-grounded. Mounted before the canvas CRUD router
  // for the same reason as ai-suggest above.
  // requireAuth MUST run before the Redis limiter: the limiter buckets by
  // req.user (authenticated → 60/day) and falls back to 'anonymous' when it is
  // unset. canvas_chat_edit's anonymous limit is 0, so without auth resolved
  // first EVERY user — including logged-in ones — is classed anonymous and
  // blocked with a 429 on their very first request. requireAuth (inside
  // canvasChatEditRouter via createAuthenticatedRouter) previously ran only
  // after the limiter, too late to matter.
  app.use(
    '/api/canvas/chat-edit/stream',
    aiGenerationLimiter,
    requireAuth,
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
  app.use('/api/custom_prompt', aiGenerationLimiter, customPromptRoute);
  app.use('/api/auth/custom_prompt', aiGenerationLimiter, customPromptRoute);
  // ts-rest contract router for user-created agents — replaces the legacy
  // userAgentsRouter. requireAuth runs before the contract mount because
  // createExpressEndpoints registers handlers directly on the app, bypassing
  // any later prefix middleware.
  app.use('/api/user-agents', requireAuth);
  // Sharing router FIRST so the static `/api/user-agents/public` route resolves
  // before the CRUD `/api/user-agents/:identifier` param route.
  mountUserAgentsSharingContractRouter(app);
  mountUserAgentsContractRouter(app);
  // EXPERIMENTAL: recurring agent tasks. Scheduler worker lives in server.ts.
  app.use('/api/recurring-tasks', requireAuth, authenticatedReadLimiter);
  mountRecurringTasksContractRouter(app);
  app.use('/api/claude/generate-short-subtitles', aiGenerationLimiter, claudeSubtitlesRoute);
  // Auth + rate-limiting must run before the contract mount — createExpressEndpoints
  // registers handlers directly on the app, bypassing the legacy prefix middleware.
  // Same pattern as /api/transfer below.
  //   - project routes require auth (reject unauthenticated)
  //   - share routes: optionalAuth populates req.user so write handlers can
  //     check it, without rejecting the public getShare/thumbnail/preview reads
  //   - standardMutationLimiter guards writes across the whole prefix (it skips
  //     GETs, so the 2s progress-polling endpoints are unaffected)
  app.use('/api/subtitler/projects', requireAuth);
  app.use('/api/subtitler/share', optionalAuth);
  // Read limiter for the public share GETs (getShare / listMyShares) — the
  // prefix-wide standardMutationLimiter below skips GETs, so without this the
  // migrated share reads would be unthrottled. Writes get both limiters.
  app.use('/api/subtitler/share', publicReadLimiter);
  app.use('/api/subtitler', standardMutationLimiter);
  mountSubtitlerContractRouter(app);
  // Legacy routers — binary/streaming routes only (contract handles all JSON).
  app.use('/api/subtitler', subtitlerRouter);
  app.use('/api/subtitler/projects', subtitlerProjectRouter);
  app.use('/api/subtitler/share', publicReadLimiter, subtitlerShareRouter);
  // Populate req.user for /api/share without rejecting unauthenticated reads.
  // The contract router below checks req.user.id per write handler; the legacy
  // router keeps public preview/download/thumbnail endpoints reachable.
  app.use('/api/share', optionalAuth);
  // ts-rest contract routers — mount BEFORE the legacy file router so ts-rest
  // matches the migrated routes first. Write endpoints (image/video/template/
  // push) + read/management endpoints (my/recent/templates/devices/delete/
  // publish) are contracted; only public info + file-streaming stay legacy.
  mountShareContractRouter(app);
  mountShareReadContractRouter(app);
  app.use('/api/share', publicReadLimiter, shareFileRouter);
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
  // ts-rest contract router for /api/recent-activity — mounts BEFORE the legacy
  // router so the typed GET matches first; requireAuth at the prefix guarantees
  // req.user for both the contract handler and the legacy fall-through.
  app.use('/api/recent-activity', requireAuth);
  mountRecentActivityContractRouter(app);
  app.use('/api/recent-activity', publicReadLimiter, recentActivityRouter);
  // ts-rest contract router for notifications — mounts BEFORE the legacy router
  // so contract-modeled routes match first; /stream SSE falls through to legacy.
  // requireAuth applied at prefix; notification-preferences also handled here.
  app.use('/api/notifications', requireAuth);
  app.use('/api/auth/profile', requireAuth);
  mountNotificationsContractRouter(app);
  mountModelPreferencesContractRouter(app);
  mountImageModelPreferenceContractRouter(app);
  // Per-user external MCP server registry (EXPERIMENTAL). requireAuth at the
  // prefix — every route is user-scoped and handles user-entered credentials.
  app.use('/api/mcp/servers', requireAuth);
  mountMcpServersContractRouter(app);
  // OAuth callback is public (identity comes from the one-time Redis state, not
  // a cookie — the cross-site provider redirect can't carry our session).
  mountMcpOAuthCallbackRouter(app);
  // Authenticated MCP SERVER (inbound; mcp.gruenerator.eu/v2). Auth is resolved
  // inside the router (OAuth access token or API key), NOT via requireAuth.
  if (env.MCP_SERVER_ENABLED) {
    app.use('/api/mcp-server', mcpServerRouter);
  }
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
  app.use('/api/board-schedules', requireAuth, authenticatedReadLimiter);
  app.use('/api/board-attachments', requireAuth, authenticatedReadLimiter);
  app.use('/api/board-card-documents', requireAuth, authenticatedReadLimiter);
  mountBoardsContractRouter(app);
  mountBoardCommentsContractRouter(app);
  mountBoardAgentContractRouter(app);
  mountBoardActivityContractRouter(app);
  mountBoardSubscriptionsContractRouter(app);
  mountBoardSchedulesContractRouter(app);
  // Plain Express upload/download routes BEFORE the ts-rest contract router so the
  // multipart/binary handlers aren't shadowed by the JSON contract's validation.
  app.use('/api/board-attachments', boardAttachmentUploadRouter);
  mountBoardAttachmentsContractRouter(app);
  mountBoardCardDocumentsContractRouter(app);
  // Sheets (Univer): only the AI planning route — CRUD/share run via /api/docs/*.
  app.use('/api/sheets', requireAuth, authenticatedReadLimiter);
  mountSheetsContractRouter(app);
  // Presentations (reveal.js): AI planning route + PPTX export — CRUD/share via /api/docs/*.
  app.use('/api/presentations', requireAuth, authenticatedReadLimiter);
  mountPresentationsContractRouter(app);
  app.use('/api/presentations', presentationExportRouter);
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
  // Unified "search everything" over the caller's own content — unrelated to
  // the web search above. requireAuth runs on the prefix because
  // createExpressEndpoints registers handlers directly on the app.
  app.use('/api/global-search', requireAuth, authenticatedReadLimiter);
  mountGlobalSearchContractRouter(app);
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
  app.use('/api/internal/agents', internalAgentInsightRouter);
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
  // Vorlagen semantic search (chat @vorlagen picker). requireAuth is per-route.
  app.use('/api/vorlagen', authenticatedReadLimiter, vorlagenApiRouter);
  app.use('/api/sites/generate-from-flyer', aiGenerationLimiter, flyerController);
  // ts-rest contract router — mount before the legacy sitesRouter so the
  // typed CRUD routes match first; /public/:subdomain and /themes fall
  // through to the legacy router. requireAuth is path-filtered because
  // /api/sites/public/* must stay anonymous.
  app.use('/api/sites', standardMutationLimiter, (req, res, next) => {
    if (req.path.startsWith('/public/')) return next();
    void requireAuth(req, res, next);
  });
  mountSitesContractRouter(app);
  app.use('/api/sites', sitesRouter);
  app.use('/api/flux/green-edit', aiGenerationLimiter, fluxImageEditingRoute);
  // ts-rest contract router for image editing (multi-reference). requireAuth +
  // limiter run at the prefix because createExpressEndpoints registers
  // handlers directly on the app.
  app.use('/api/image-edit', requireAuth, aiGenerationLimiter);
  mountImageEditContractRouter(app);
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
