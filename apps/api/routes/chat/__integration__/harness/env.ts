import { vi } from 'vitest';

/**
 * `apps/api/vitest.config.ts` calls `dotenvConfig()`, so the developer's `.env`
 * is loaded into every test run — and several of these variables are read at
 * CALL time, not at import time (e.g. `getSystemMcpSources` in
 * services/mcp/systemMcpServers.ts). A `SYSTEM_MCP_*_URL` on one machine flips
 * `isSystemIntentAvailable` → `isMcpTurn` → `runAgentic`, so the same test
 * reaches a different verdict locally than in CI.
 *
 * Every entry below is a verified routing or timing input. Pinning them is not
 * hygiene, it is what makes the suite mean the same thing everywhere.
 * `envGuardValues()` backs a test that fails loudly if a pin stops applying —
 * a missing pin does not fail on its own, it just makes the suite quietly
 * machine-dependent, which is the worst failure mode a test can have.
 */
const PINNED: Record<string, string> = {
  // Loop gates — decideRunAgentic / replay injection
  CHAT_AGENT_LOOP: 'true',
  CHAT_MCP_REPLAY: 'false',

  // System MCP sources: any URL set here mounts a system intent and changes
  // isMcpTurn. Empty string = not configured.
  SYSTEM_MCP_DB_URL: '',
  SYSTEM_MCP_WEATHER_URL: '',
  SYSTEM_MCP_ARD_URL: '',
  SYSTEM_MCP_TRIVAGO_URL: '',
  // Not an intent — a managed connector. Set here for the same reason as the
  // others: leaving it to the ambient env would make a run's connector list
  // depend on the developer's .env.
  SYSTEM_MCP_LAW_URL: '',
  SYSTEM_MCP_INTENTS: '',

  // Provider keys decide which lane the loop picks (isProviderConfigured).
  MISTRAL_API_KEY: '',
  REGOLO_API_KEY: '',
  GREENPT_API_KEY: '',
  LITELLM_API_KEY: '',

  // Telemetry: with Langfuse configured, every turn does a real OTel export.
  LANGFUSE_PUBLIC_KEY: '',
  LANGFUSE_SECRET_KEY: '',
  LANGFUSE_BASE_URL: '',

  // Compaction thresholds are read per turn; the defaults differ from the
  // dev-only overrides the eval README recommends.
  CHAT_COMPACTION_THRESHOLD: '',
  CHAT_COMPACTION_KEEP_RECENT: '',
  CHAT_COMPACTION_COOLDOWN_MS: '',

  // Never reached once Postgres/Redis are mocked, but an unmocked path must
  // fail fast rather than dial a developer's local services.
  DATABASE_URL: '',
  REDIS_URL: '',
};

export function pinChatEnv(overrides: Record<string, string> = {}): void {
  for (const [key, value] of Object.entries({ ...PINNED, ...overrides })) {
    vi.stubEnv(key, value);
  }
}

/** The pins a guard test asserts against. */
export function envGuardValues(): Record<string, string> {
  return { ...PINNED };
}
