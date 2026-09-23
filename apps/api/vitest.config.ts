import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenvConfig();

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
    ...(process.env.CI ? {} : { maxWorkers: 2, minWorkers: 1 }),
  },
});
