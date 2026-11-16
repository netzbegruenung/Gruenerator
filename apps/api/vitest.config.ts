import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'vitest/config';

const LIVE_OPT_INS = [
  'RUN_LIVE_PROVIDER_TESTS',
  'RUN_LLM_EVAL_TESTS',
  'FORCE_LIVE',
  'NOTEBOOK_LIVE',
];
const liveOptIn = LIVE_OPT_INS.some((flag) => process.env[flag]);

// Tests run on the environment CI has: the shell's, without apps/api/.env.
// The developer's .env changes outcomes (instance channel, thumbnail signing
// secret), names the shared dev database (#5640) and carries paid provider
// keys — any suite reaching the AI facade unmocked would spend real tokens and
// take a different path than CI (#4299). Only a live opt-in loads it. DOTENV_PATH is the default every dotenv.config()
// reads, so the module-level call in QdrantService and the forked
// workers, which inherit process.env, skip the file as well.
if (liveOptIn) {
  dotenvConfig({ quiet: true });
} else {
  process.env.DOTENV_PATH = '.env.vitest-disabled';
  process.env.DOTENV_QUIET = 'true';
}

// Without a .env, PostgresService still defaults to localhost:5432/gruenerator —
// on a developer machine the shared dev database, where any test that calls
// init() runs the migration runner with whatever branch migrations it sees
// (#5640). Port 1 refuses at once, the same failure CI hits (its Postgres is on
// 5433). The *.db.vitest.ts lane connects via MIGRATIONS_TEST_DATABASE_URL and
// is unaffected; a DATABASE_URL passed on the command line wins.
process.env.DATABASE_URL ??= 'postgresql://vitest@127.0.0.1:1/no-database';

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
