import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Paid upstreams. With a key from .env, any suite that reaches the AI facade
// without mocking `services/ai/execution` spends real tokens and waits on real
// latency — and takes a different path than CI, which has no keys (#4299).
const PROVIDER_KEYS = [
  'MISTRAL_API_KEY',
  'CORTECS_API_KEY',
  'LITELLM_API_KEY',
  'MELIOUS_API_KEY',
  'GREENPT_API_KEY',
  'LINKUP_API_KEY',
  'BFL_API_KEY',
  'KUGELAUDIO_API_KEY',
  'DEEPL_API_KEY',
];
const LIVE_OPT_INS = [
  'RUN_LIVE_PROVIDER_TESTS',
  'RUN_LLM_EVAL_TESTS',
  'FORCE_LIVE',
  'NOTEBOOK_LIVE',
];
const keysFromShell = new Set(PROVIDER_KEYS.filter((key) => process.env[key]));

dotenvConfig();

// Keys passed on the command line, or any live opt-in, keep the .env keys.
// Blank, not deleted, for the same reason as QDRANT_URL below.
if (!LIVE_OPT_INS.some((flag) => process.env[flag])) {
  for (const key of PROVIDER_KEYS) {
    if (!keysFromShell.has(key)) process.env[key] = '';
  }
}

// The local .env points at the production Qdrant, and QdrantService starts
// reconciling collections and indexes as soon as anything constructs it (#3589).
// Tests run without a Qdrant, as in CI; the opt-in live suite keeps the URL.
// Blank, not deleted: the dotenv calls at module load (QdrantService,
// config/env) would refill a deleted key, but never override a present one.
if (process.env.NOTEBOOK_LIVE !== '1') process.env.QDRANT_URL = '';

// Without a .env (CI, fresh worktrees) the Better Auth config rejects async at
// import time (crossSubDomainCookies needs a baseURL) — an unhandled rejection
// that fails the whole run. Tests never talk to this URL.
process.env.BETTER_AUTH_URL ??= 'http://localhost:3001';

export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
    ...(process.env.CI ? {} : { maxWorkers: 2 }),
  },
});
