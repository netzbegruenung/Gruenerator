import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'vitest/config';

dotenvConfig();

// Without a .env (CI, fresh worktrees) the Better Auth config rejects async at
// import time (crossSubDomainCookies needs a baseURL) — an unhandled rejection
// that fails the whole run. Tests never talk to this URL.
process.env.BETTER_AUTH_URL ??= 'http://localhost:3001';

export default defineConfig({
  test: {
    include: ['**/*.vitest.ts'],
    environment: 'node',
  },
});
