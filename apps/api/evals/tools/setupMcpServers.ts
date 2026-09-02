/**
 * Connect the no-auth MCP servers the eval user needs for the MCP corpus lane.
 * Idempotent: lists existing servers first and only creates the missing ones.
 * Uses the real contract endpoints with the dev-bypass header, so it exercises
 * the same create path a user's UI does.
 *
 *   EVAL_BYPASS_TOKEN=<token> pnpm --filter @gruenerator/api tsx evals/tools/setupMcpServers.ts
 *
 * Only `authType: 'none'` servers (verified in McpRegistryService SEEDS) — no
 * OAuth, so it runs headless against a local or test-env backend.
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.EVAL_BASE_URL ?? 'http://localhost:3001';
const BYPASS = process.env.EVAL_BYPASS_TOKEN ?? '';

const NO_AUTH_SERVERS: { name: string; url: string }[] = [
  { name: 'trivago', url: 'https://mcp.trivago.com/mcp' },
  { name: 'Yahoo Finance', url: 'https://gateway.mcpservers.org/yahoo-finance/mcp' },
];

const headers = {
  'content-type': 'application/json',
  ...(BYPASS ? { 'x-dev-auth-bypass': BYPASS } : {}),
};

async function listExisting(): Promise<Set<string>> {
  const res = await fetch(`${BASE_URL}/api/mcp/servers`, { headers });
  if (!res.ok) throw new Error(`list failed: HTTP ${res.status}`);
  const body = (await res.json()) as { servers?: { url?: string }[] };
  return new Set((body.servers ?? []).map((s) => s.url ?? '').filter(Boolean));
}

async function create(name: string, url: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/mcp/servers`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, url, authType: 'none' }),
  });
  if (res.status === 201) {
    console.log(`  ✅ created ${name}`);
    return;
  }
  if (res.status === 409) {
    console.log(`  = ${name} already exists`);
    return;
  }
  const text = await res.text();
  console.error(`  ❌ ${name}: HTTP ${res.status} ${text.slice(0, 200)}`);
}

async function main(): Promise<void> {
  if (!BYPASS) {
    console.warn('⚠  EVAL_BYPASS_TOKEN not set — requests will likely 401.');
  }
  console.log(`Setting up no-auth MCP servers on ${BASE_URL}…`);
  const existing = await listExisting().catch((err) => {
    console.error(`Could not list existing servers: ${String(err)}`);
    return new Set<string>();
  });
  for (const { name, url } of NO_AUTH_SERVERS) {
    if (existing.has(url)) {
      console.log(`  = ${name} already connected`);
      continue;
    }
    await create(name, url);
  }
  console.log('Done. Run the MCP lane with EVAL_FILTER=mcp.');
}

// Only run when invoked directly (not when imported by a test). Comparing the
// resolved entry script with this module's own path is the part that actually
// discriminates: `dirname(...)` of a real path is always a non-empty string, so
// the previous guard reduced to `process.argv[1] &&` and ran main() on every
// import.
const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  void main();
}
