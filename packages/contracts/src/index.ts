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

// ── Contracts ───────────────────────────────────────────────────────────────
export {
  threadsContract,
  exportsContract,
  recentValuesContract,
  searchContract,
  chatGraphContract,
  boardsContract,
  sharesContract,
  userProfileContract,
  notebookContract,
  notebookCollectionsContract,
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
  adminVorlagenContract,
  authStatusContract,
  canvasAiContract,
} from './contracts/index.js';

// ── Schemas (Zod) ───────────────────────────────────────────────────────────
export * from './schemas/threads.js';
export * from './schemas/exports.js';
export * from './schemas/recentValues.js';
export * from './schemas/search.js';
export * from './schemas/chatGraph.js';
export * from './schemas/boards.js';
export * from './schemas/shares.js';
export * from './schemas/userProfile.js';
export * from './schemas/notebook.js';
export * from './schemas/notebookCollections.js';
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
export * from './schemas/adminVorlagen.js';
export * from './schemas/authStatus.js';
export * from './schemas/canvasAi.js';
