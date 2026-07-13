/**
 * @gruenerator/contracts
 *
 * Single source of truth for API contracts between the Express backend
 * and React/React Native frontends. Built on ts-rest + Zod.
 *
 * Usage:
 *   import { threadsContract, recentValuesContract } from '@gruenerator/contracts';
 *
 * The schemas (Zod) are also exported for direct reuse in backend route handlers
 * and frontend form validation.
 */

// ── ts-rest core utilities re-exported for frontend client construction ─────
// Frontends import `initClient` from here instead of taking a direct
// `@ts-rest/core` dependency. The contracts package already has it.
export { initClient, type ClientInferRequest, type ClientInferResponses } from '@ts-rest/core';

// ── Contracts ───────────────────────────────────────────────────────────────
export {
  threadsContract,
  exportsContract,
  recentValuesContract,
  itemUsageContract,
  searchContract,
  globalSearchContract,
  researchContract,
  chatGraphContract,
  boardsContract,
  sheetsContract,
  presentationsContract,
  boardCommentsContract,
  boardAgentContract,
  boardActivityContract,
  boardSubscriptionsContract,
  boardSchedulesContract,
  boardAttachmentsContract,
  boardCardDocumentsContract,
  publicBoardsContract,
  sharesContract,
  sharesReadContract,
  userProfileContract,
  notebookContract,
  notebookCollectionsContract,
  wolkePendingContract,
  notebookSharingContract,
  docsContract,
  documentsContract,
  subtitlerContract,
  voiceContract,
  imagePickerContract,
  videoContract,
  textGenerationContract,
  sharepicContract,
  wordpressContract,
  transferContract,
  unsplashContract,
  notificationsContract,
  emailContract,
  modelPreferencesContract,
  imageModelPreferenceContract,
  mcpServersContract,
  imageEditContract,
  adminVorlagenContract,
  userTemplatesContract,
  templateInteractionsContract,
  userAgentsContract,
  userAgentsSharingContract,
  canvasAiContract,
  canvasContract,
  groupsContract,
  contentSyncContract,
  monitorContract,
  sitesContract,
  reisekostenContract,
  promptsContract,
} from './contracts/index.js';

// ── Schemas (Zod) ───────────────────────────────────────────────────────────
export * from './schemas/threads.js';
export * from './schemas/exports.js';
export * from './schemas/recentValues.js';
export * from './schemas/itemUsage.js';
export * from './schemas/search.js';
export * from './schemas/globalSearch.js';
export * from './schemas/research.js';
export * from './schemas/chatGraph.js';
export * from './schemas/chatStreamEvents.js';
export * from './schemas/socialPost.js';
export * from './schemas/bundestag.js';
export * from './schemas/boardFlow.js';
export * from './schemas/boards.js';
export * from './schemas/sheets.js';
export * from './schemas/presentations.js';
export * from './schemas/boardComments.js';
export * from './schemas/boardActivity.js';
export * from './schemas/boardSubscriptions.js';
export * from './schemas/boardSchedules.js';
export * from './schemas/boardAttachments.js';
export * from './schemas/boardCardDocuments.js';
export * from './schemas/shares.js';
export * from './schemas/userProfile.js';
export * from './schemas/notebook.js';
export * from './schemas/notebookCollections.js';
export * from './schemas/wolkePending.js';
export * from './schemas/notebookSharing.js';
export * from './schemas/docs.js';
export * from './schemas/documents.js';
export * from './schemas/subtitler.js';
export * from './schemas/voice.js';
export * from './schemas/imagePicker.js';
export * from './schemas/video.js';
export * from './schemas/textGeneration.js';
export * from './schemas/sharepic.js';
export * from './schemas/wordpress.js';
export * from './schemas/transfer.js';
export * from './schemas/unsplash.js';
export * from './schemas/notifications.js';
export * from './schemas/email.js';
export * from './schemas/modelPreferences.js';
export * from './schemas/imageModelPreference.js';
export * from './schemas/mcpServers.js';
export * from './schemas/imageEdit.js';
export * from './schemas/adminVorlagen.js';
export * from './schemas/userTemplates.js';
export * from './schemas/templateInteractions.js';
export * from './schemas/userAgents.js';
export * from './schemas/userAgentsSharing.js';
export * from './schemas/canvasAi.js';
export * from './schemas/reelEdit.js';
export * from './schemas/canvas.js';
export * from './schemas/canvasTemplateDescriptors.js';
export * from './schemas/sliderDeck.js';
export * from './schemas/skill.js';
export * from './schemas/agent.js';
export * from './schemas/groups.js';
export * from './schemas/contentSync.js';
export * from './schemas/monitor.js';
export * from './schemas/sites.js';
export * from './schemas/richtext.js';
export * from './schemas/reisekosten.js';

// Sheets (Univer) collab schema + pure formatting helpers — Univer-free, shared
// by the editor package and the API.
export * from './sheetsYdoc.js';

// Presentations (reveal.js) collab schema + pure formatting helpers —
// reveal-free, shared by the editor package and the API.
export * from './presentationsYdoc.js';

export * from './schemas/scanner.js';
export * from './schemas/prompts.js';
