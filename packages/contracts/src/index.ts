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
