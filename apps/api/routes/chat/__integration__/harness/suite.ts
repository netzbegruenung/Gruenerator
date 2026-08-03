import { afterAll, beforeAll, beforeEach } from 'vitest';

import { createAiWorkerPoolStub, type AiWorkerStub } from './aiWorkerPoolStub.js';
import { pinChatEnv } from './env.js';
import { resetThreadStore } from './fakeThreadStore.js';
import { resetMockControls } from './mocks.js';
import { respond } from './respondScript.js';
import { startChatApp, type ChatApp, type ChatAppOptions } from './testApp.js';
import { installNetworkGuard } from './trace.js';

export interface Suite {
  /** Valid only inside a test body (assigned in beforeAll). */
  baseUrl: () => string;
  pool: AiWorkerStub;
}

/**
 * One server per file (beforeAll), full state reset per test (beforeEach).
 * A server per test would be safer still but costs a listen/close cycle each
 * time, and the router keeps no per-app state — everything mutable lives in the
 * fake store, the mock controls and the respond script, all reset below.
 */
export function useChatApp(options: ChatAppOptions = {}): Suite {
  const pool = createAiWorkerPoolStub();
  let app: ChatApp | null = null;
  let restoreNetwork: (() => void) | null = null;

  beforeAll(async () => {
    restoreNetwork = installNetworkGuard();
    app = await startChatApp({ aiWorkerPool: pool, ...options });
  });

  afterAll(async () => {
    await app?.close();
    restoreNetwork?.();
  });

  beforeEach(() => {
    pinChatEnv();
    resetThreadStore();
    resetMockControls();
    respond.reset();
    pool.reset();
  });

  return {
    baseUrl: () => {
      if (!app) throw new Error('useChatApp: server not started yet');
      return app.baseUrl;
    },
    pool,
  };
}
