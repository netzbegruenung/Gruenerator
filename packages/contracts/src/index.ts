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
} from './contracts/index.js';

// ── Schemas (Zod) ───────────────────────────────────────────────────────────
export * from './schemas/threads.js';
export * from './schemas/exports.js';
export * from './schemas/recentValues.js';
export * from './schemas/search.js';
