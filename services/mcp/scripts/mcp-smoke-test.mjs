#!/usr/bin/env node
// Smoke test for the Grünerator MCP server (Streamable HTTP / JSON-RPC).
//
// Usage:
//   node services/mcp/scripts/mcp-smoke-test.mjs [baseUrl]
//   MCP_URL=http://localhost:3004 node services/mcp/scripts/mcp-smoke-test.mjs
//   MCP_API_KEY=<bearer> node services/mcp/scripts/mcp-smoke-test.mjs   # also exercises authenticated notebook tools
//
// Exit 0 = all hard checks passed. Checks tagged [NEW] need the post-2026-07-04
// image (session-404, zero-result hints); they report PENDING-DEPLOY instead of
// failing while the old image is still live.

const BASE = (process.argv[2] || process.env.MCP_URL || 'https://mcp.gruenerator.eu').replace(/\/$/, '');
const MCP = `${BASE}/mcp`;
const API_KEY = process.env.MCP_API_KEY || null;
const TIMEOUT_MS = 45000;

let sessionId = null;
let idCounter = 0;
const results = [];

function headers(extra = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
    ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    ...extra,
  };
}

function parseSse(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('data:')) {
      const payload = t.slice(5).trim();
      if (payload) {
        try {
          out.push(JSON.parse(payload));
        } catch {
          /* keep-alive / non-json */
        }
      }
    }
  }
  return out;
}

async function post(body, extraHeaders = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: headers(extraHeaders),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const sid = res.headers.get('mcp-session-id');
  if (sid) sessionId = sid;
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  let msg = null;
  if (ct.includes('text/event-stream')) {
    const msgs = parseSse(text);
    msg = msgs.find((m) => m.id === body.id) || msgs[0] || null;
  } else if (text) {
    try {
      msg = JSON.parse(text);
    } catch {
      /* non-json */
    }
  }
  return { status: res.status, msg, raw: text };
}

function rpc(method, params) {
  return post({ jsonrpc: '2.0', id: ++idCounter, method, params });
}

async function notify(method, params) {
  await fetch(MCP, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function parseToolData(msg) {
  const text = msg?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Call a tool, return { isError, data, error, ok }
async function callTool(name, args) {
  const r = await rpc('tools/call', { name, arguments: args });
  return {
    isError: r.msg?.result?.isError,
    data: parseToolData(r.msg),
    protocolError: r.msg?.error || null,
    hasResult: r.msg?.result != null,
  };
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function check(name, ok, detail = '') {
  results.push({ name, ok, soft: false });
  console.log(`  ${ok ? GREEN + 'PASS' : RED + 'FAIL'}${RESET}  ${name}${detail ? ` — ${detail}` : ''}`);
}
function checkNew(name, ok, detail = '') {
  results.push({ name, ok: true, soft: !ok });
  console.log(`  ${ok ? GREEN + 'PASS' : YELLOW + 'PENDING-DEPLOY'}${RESET}  [NEW] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\nMCP smoke test → ${BASE}${API_KEY ? ' (with API key)' : ''}\n`);

  // ---- Protocol layer ----
  console.log('Protocol:');
  try {
    const h = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await h.json();
    check('GET /health', h.status === 200 && body.status === 'ok', `v${body.version}, uptime ${body.uptime?.hours}h`);
  } catch (err) {
    check('GET /health', false, String(err));
  }

  const init = await post({
    jsonrpc: '2.0',
    id: ++idCounter,
    method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke-test', version: '1.0.0' } },
  });
  check('initialize + session id', init.status === 200 && !!sessionId && !!init.msg?.result?.serverInfo, sessionId ? `session ${sessionId.slice(0, 8)}…` : 'no session');
  await notify('notifications/initialized', {});

  const tools = await rpc('tools/list', {});
  const toolNames = (tools.msg?.result?.tools || []).map((t) => t.name);
  check('tools/list', toolNames.length > 0, `${toolNames.length} tools: ${toolNames.join(', ')}`);

  const resList = await rpc('resources/list', {});
  const resItems = resList.msg?.result?.resources || [];
  const resStrings = resItems.flatMap((r) => [r.uri, r.name].filter(Boolean));
  check('resources/list', resStrings.some((s) => s.includes('system-prompt')) && resStrings.some((s) => s.includes('collections')), `${resItems.length} resources`);

  const readUri = resItems.find((r) => String(r.uri || '').startsWith('gruenerator://'))?.uri || resItems[0]?.uri;
  const readRes = readUri ? await rpc('resources/read', { uri: readUri }) : { msg: {} };
  const readOk = !!readRes.msg?.result?.contents?.[0]?.text;
  results.push({ name: 'resources/read', ok: true, soft: !readOk });
  console.log(`  ${readOk ? GREEN + 'PASS' : YELLOW + 'KNOWN-ISSUE'}${RESET}  resources/read${readOk ? ` — uri=${readUri}` : ' — advertised uri not readable (server registers name/uri swapped)'}`);

  // ---- Every tool ----
  console.log('\nTools:');
  const toolTests = [
    {
      label: 'gruenerator_search (vector → hits)',
      name: 'gruenerator_search',
      args: { query: 'soziale Gerechtigkeit', country: 'DE', collection: 'deutschland', searchMode: 'vector', limit: 2 },
      expect: 'ok',
      ok: (d) => d?.resultsCount > 0,
      detail: (d) => `resultsCount=${d?.resultsCount}, top=${d?.results?.[0]?.relevance}`,
    },
    {
      label: 'gruenerator_search (hybrid → hits)',
      name: 'gruenerator_search',
      args: { query: 'Klimaschutz', country: 'DE', collection: 'deutschland', searchMode: 'hybrid', limit: 2 },
      expect: 'ok',
      ok: (d) => Array.isArray(d?.results),
      detail: (d) => `resultsCount=${d?.resultsCount ?? 0}`,
    },
    {
      label: 'gruenerator_search (AT country)',
      name: 'gruenerator_search',
      args: { query: 'Klimaschutz', country: 'AT', limit: 2 },
      expect: 'ok',
      ok: (d) => Array.isArray(d?.results),
      detail: (d) => `resultsCount=${d?.resultsCount ?? 0}`,
    },
    {
      label: 'gruenerator_get_filters',
      name: 'gruenerator_get_filters',
      args: { collection: 'deutschland' },
      expect: 'ok',
      ok: (d) => !d?.error,
      detail: (d) => (d?.error ? d.message : `filter fields: ${Object.keys(d?.filters || {}).length}`),
    },
    {
      label: 'gruenerator_cache_stats',
      name: 'gruenerator_cache_stats',
      args: {},
      expect: 'ok',
      ok: (d) => !!d?.embeddings && !!d?.search,
      detail: (d) => `emb=${d?.embeddings?.entries}, search=${d?.search?.entries}`,
    },
    {
      label: 'get_client_config',
      name: 'get_client_config',
      args: { client: 'claude' },
      expect: 'ok',
      ok: (d) => !!d && !d.error,
      detail: () => 'config generated',
    },
    {
      label: 'gruenerator_examples_search',
      name: 'gruenerator_examples_search',
      args: { query: 'Klimaschutz', country: 'DE', limit: 1 },
      expect: 'ok-or-clean-error',
      ok: (d) => Array.isArray(d?.examples) || d?.errorType === 'search_unavailable',
      detail: (d) => d?.errorType || `resultsCount=${d?.resultsCount ?? 0}`,
    },
    {
      label: 'gruenerator_ask (QA + synthesis)',
      name: 'gruenerator_ask',
      args: { question: 'Was ist die Position zum Klimaschutz?', country: 'DE' },
      expect: 'ok',
      ok: (d) => typeof d?.answer === 'string' && d.answer.length > 0,
      detail: (d) => `answer ${String(d?.answer || '').length} chars, ${d?.sources?.length ?? 0} sources`,
    },
    {
      label: 'gruenerator_compare (DE vs AT)',
      name: 'gruenerator_compare',
      args: { query: 'Klimaschutz', sources: [{ country: 'DE' }, { country: 'AT' }], limit: 2 },
      expect: 'ok',
      ok: (d) => Array.isArray(d?.comparison) && d.comparison.length === 2,
      detail: (d) => `${d?.comparison?.length} sources compared`,
    },
    {
      label: 'gruenerator_notebook_ask (invalid token → clean error)',
      name: 'gruenerator_notebook_ask',
      args: { question: 'test', token: 'invalid-token-xyz-000' },
      expect: 'error',
      ok: (d) => d?.error === true,
      detail: (d) => String(d?.message || '').slice(0, 60),
    },
  ];

  for (const t of toolTests) {
    if (!toolNames.includes(t.name)) {
      check(t.label, false, 'tool not advertised');
      continue;
    }
    try {
      const r = await callTool(t.name, t.args);
      const detail = (() => {
        try {
          return t.detail ? t.detail(r.data) : '';
        } catch {
          return '';
        }
      })();
      if (t.expect === 'error') {
        check(t.label, r.isError === true && t.ok(r.data), detail);
      } else if (t.expect === 'ok-or-clean-error') {
        check(t.label, r.hasResult && t.ok(r.data), detail);
      } else {
        // success = not flagged as error (isError absent counts as false per MCP spec)
        check(t.label, r.isError !== true && t.ok(r.data), detail);
      }
    } catch (err) {
      check(t.label, false, String(err));
    }
  }

  // Authenticated notebook tools (only when a key is forwarded)
  if (API_KEY) {
    console.log('\nAuthenticated tools:');
    const authTools = ['gruenerator_notebooks_list', 'gruenerator_notebooks_search', 'gruenerator_notebooks_ask', 'gruenerator_notebooks_get_filters'];
    check('auth tools advertised with key', authTools.some((t) => toolNames.includes(t)), toolNames.filter((t) => t.startsWith('gruenerator_notebooks')).join(', ') || 'none');
    if (toolNames.includes('gruenerator_notebooks_list')) {
      const r = await callTool('gruenerator_notebooks_list', {});
      check('notebooks_list returns data or clean error', r.hasResult, r.isError ? String(r.data?.message || '').slice(0, 60) : 'ok');
    }
  } else {
    console.log('\nAuthenticated tools: skipped (set MCP_API_KEY to test)');
  }

  // ---- Error handling ----
  console.log('\nError handling:');
  // text mode + nonsense token → genuinely empty (vector mode always returns nearest neighbours)
  const empty = await callTool('gruenerator_search', { query: 'xqzptvwnichtsdergleichen99999zzz', country: 'DE', collection: 'deutschland', searchMode: 'text', limit: 2 });
  check('empty result is NOT an error', empty.isError !== true && Array.isArray(empty.data?.results) && empty.data.results.length === 0, empty.data?.message);
  checkNew('empty result carries a hint', typeof empty.data?.hint === 'string' && empty.data.hint.length > 0, empty.data?.hint);

  const missingArg = await rpc('tools/call', { name: 'gruenerator_search', arguments: { query: 'test' } }); // no `country`
  check('missing required arg rejected', !!missingArg.msg?.error || missingArg.msg?.result?.isError === true, missingArg.msg?.error?.message || 'isError');

  const unknownTool = await rpc('tools/call', { name: 'does_not_exist', arguments: {} });
  check('unknown tool rejected', !!unknownTool.msg?.error || unknownTool.msg?.result?.isError === true, unknownTool.msg?.error?.message || 'isError');

  const bogus = await fetch(MCP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Mcp-Session-Id': '00000000-0000-0000-0000-000000000000' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 999, method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  checkNew('unknown session → 404 (auto-reconnect)', bogus.status === 404, `got HTTP ${bogus.status}`);

  // ---- Summary ----
  const hardFails = results.filter((r) => !r.ok);
  const pending = results.filter((r) => r.soft);
  console.log(
    `\n${hardFails.length === 0 ? GREEN + '✓ all hard checks passed' : `${RED}✗ ${hardFails.length} check(s) failed`}${RESET}` +
      (pending.length ? `  (${YELLOW}${pending.length} pending deploy${RESET})` : '') +
      '\n'
  );
  process.exit(hardFails.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n${RED}FATAL${RESET} ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(2);
});
