/**
 * Diagnose eines externen MCP-Servers — beantwortet „warum sehe ich 0 Tools?".
 *
 *   pnpm --filter @gruenerator/api exec tsx scripts/probe-mcp.ts <url> [--token=…]
 *
 * Probiert BEIDE Transporte (StreamableHTTP und legacy SSE), holt `tools/list`
 * mit einem bewusst permissiven Schema und prüft danach jedes Tool EINZELN
 * gegen das strenge `ToolSchema` des SDK. Genau dort liegt der Unterschied zu
 * nachsichtigen Clients wie ChatGPT: das SDK verwirft bei einem einzigen
 * ungültigen Tool die komplette Antwort, und die ZodError-Meldung wird auf dem
 * Weg ins UI zu einem generischen Satz eingedampft.
 *
 * Bewusst OHNE SSRF-Guard (CLI, keine Nutzereingabe aus dem Netz), damit auch
 * ein lokal laufender Server geprüft werden kann.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

type TransportKind = 'http' | 'sse';

/** Alles durchlassen — wir wollen die Rohantwort sehen, nicht ihre Validierung. */
const RawResultSchema = z.object({}).passthrough();

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
const token = args.find((a) => a.startsWith('--token='))?.slice('--token='.length);

if (!url) {
  console.error('Aufruf: tsx scripts/probe-mcp.ts <url> [--token=…]');
  process.exit(1);
}

const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

function buildTransport(kind: TransportKind): Transport {
  const parsed = new URL(url!);
  if (kind === 'sse') {
    return new SSEClientTransport(parsed, {
      requestInit: { headers },
      eventSourceInit: {
        fetch: (input: string | URL | Request, init?: RequestInit) =>
          fetch(input, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), ...headers },
          }),
      },
    }) as unknown as Transport;
  }
  return new StreamableHTTPClientTransport(parsed, {
    requestInit: { headers },
  }) as unknown as Transport;
}

/** Roher POST vor jedem SDK-Aufruf: zeigt Status/Content-Type, wenn nichts geht. */
async function rawInitialize(): Promise<void> {
  console.log('\n── Roher POST (StreamableHTTP) ──────────────────────────────');
  try {
    const res = await fetch(url!, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'gruenerator-probe', version: '1.0.0' },
        },
      }),
    });
    const body = await res.text();
    console.log(`HTTP ${res.status} ${res.statusText}`);
    console.log(`content-type: ${res.headers.get('content-type') ?? '–'}`);
    console.log(`mcp-session-id: ${res.headers.get('mcp-session-id') ?? '–'}`);
    console.log(`www-authenticate: ${res.headers.get('www-authenticate') ?? '–'}`);
    console.log(`body: ${body.slice(0, 800)}`);
  } catch (err) {
    console.log(`fetch fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Jedes Tool einzeln gegen das strenge SDK-Schema — das ist der Kern der Diagnose. */
function validateTools(tools: unknown[]): void {
  let bad = 0;
  for (const [i, tool] of tools.entries()) {
    const parsed = ToolSchema.safeParse(tool);
    const name = (tool as { name?: unknown }).name;
    if (parsed.success) {
      console.log(`  ✓ ${String(name)}`);
      continue;
    }
    bad++;
    console.log(`  ✗ ${String(name ?? `[${i}]`)} — vom SDK-Schema abgelehnt:`);
    for (const issue of parsed.error.issues) {
      console.log(`      ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    console.log(`      roh: ${JSON.stringify(tool).slice(0, 400)}`);
  }
  console.log(
    bad === 0
      ? `\n  Alle ${tools.length} Tools sind SDK-konform.`
      : `\n  ${bad} von ${tools.length} Tools sind NICHT konform — das SDK verwirft deshalb die GANZE Liste.`
  );
}

async function probe(kind: TransportKind): Promise<void> {
  console.log(`\n── Transport: ${kind} ───────────────────────────────────────`);
  const client = new Client({ name: 'gruenerator-probe', version: '1.0.0' }, { capabilities: {} });
  const transport = buildTransport(kind);
  try {
    await client.connect(transport, { timeout: 15_000 });
  } catch (err) {
    console.log(`connect fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    await transport.close().catch(() => {});
    return;
  }

  const negotiated =
    kind === 'http'
      ? (transport as StreamableHTTPClientTransport & { protocolVersion?: string }).protocolVersion
      : '(SSE meldet die Version nicht separat)';
  console.log(`verbunden. serverInfo: ${JSON.stringify(client.getServerVersion())}`);
  console.log(`protocolVersion: ${negotiated ?? '–'}`);
  console.log(`capabilities: ${JSON.stringify(client.getServerCapabilities())}`);
  const instructions = client.getInstructions();
  if (instructions) console.log(`instructions: ${instructions.slice(0, 200)}…`);

  // Permissiv holen — so sehen wir die Rohantwort auch dann, wenn das strenge
  // Schema sie ablehnen würde.
  let cursor: string | undefined;
  let page = 0;
  const all: unknown[] = [];
  do {
    const raw = (await client.request(
      { method: 'tools/list', params: cursor ? { cursor } : {} },
      RawResultSchema,
      { timeout: 30_000 }
    )) as { tools?: unknown[]; nextCursor?: string };
    page++;
    const tools = Array.isArray(raw.tools) ? raw.tools : [];
    console.log(
      `\ntools/list Seite ${page}: ${tools.length} Einträge, nextCursor=${raw.nextCursor ?? '–'}`
    );
    all.push(...tools);
    cursor = raw.nextCursor;
  } while (cursor && page < 10);

  if (all.length === 0) {
    console.log('\n  Der Server liefert eine LEERE Tool-Liste (kein Parser-Problem).');
  } else {
    validateTools(all);
  }

  // Gegenprobe: derselbe Aufruf über den strengen SDK-Pfad.
  try {
    const strict = await client.listTools(undefined, { timeout: 30_000 });
    console.log(`\nSDK listTools() (streng): ${strict.tools.length} Tools`);
  } catch (err) {
    console.log(
      `\nSDK listTools() (streng) WIRFT: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  await client.close().catch(() => {});
}

console.log(`MCP-Probe für ${url}${token ? ' (mit Bearer-Token)' : ' (ohne Auth)'}`);
await rawInitialize();
// Reihenfolge wie im Produktivcode: Pfad-Heuristik zuerst, dann der andere.
const pathname = new URL(url).pathname.replace(/\/$/, '');
const order: TransportKind[] = pathname.endsWith('/sse') ? ['sse', 'http'] : ['http', 'sse'];
for (const kind of order) await probe(kind);
process.exit(0);
