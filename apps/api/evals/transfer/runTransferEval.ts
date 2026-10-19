/**
 * Übertragungs-Eval für Leichte und Einfache Sprache.
 *
 *   npx tsx apps/api/evals/transfer/runTransferEval.ts [--case id] [--agent ls|es] [--base http://localhost:3031]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRANSFER_CASES, type TransferCase } from './cases.js';
import {
  avgSentenceWords,
  hasCheckTrailInMessage,
  pageChromeLines,
  hasClosingOffer,
  hasVisualBlockFence,
  lengthRatio,
  longSentenceShare,
  numberRecall,
  parseProtocolHeader,
} from './metrics.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VISUAL_BLOCKS = [
  'chart',
  'bars',
  'stats',
  'callout',
  'timeline',
  'steps',
  'compare',
  'table',
];
const DEV_USER = '00000000-0000-4000-a000-000000000001';

interface SseEvent {
  event: string;
  data: string;
  at: number;
}

interface CaseResult {
  id: string;
  agent: string;
  origChars: number;
  finalChars: number;
  ratio: number;
  numberRecall: number | null;
  urteil: string | null;
  runden: number | null;
  closingOffer: boolean;
  visualFence: boolean;
  trailInMessage: boolean;
  pageChrome: number;
  avgSentenceWords: number | null;
  longSentenceShare: number | null;
  durationS: number;
  documentId: string | null;
  protocolFetched: boolean;
  steps: { title: string; status: string; atS: number }[];
  errors: string[];
}

function parseArgs(argv: string[]) {
  const opts = {
    caseId: null as string | null,
    agent: null as string | null,
    base: 'http://localhost:3031',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case') opts.caseId = argv[++i] ?? null;
    else if (a === '--agent') opts.agent = argv[++i] ?? null;
    else if (a === '--base') opts.base = argv[++i] ?? opts.base;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function readBypassToken(): string {
  const env = readFileSync(path.resolve(HERE, '../../.env'), 'utf8');
  const m = /^DEV_AUTH_BYPASS_TOKEN\s*=\s*"?([^"\n]+)"?/m.exec(env);
  if (!m?.[1]) throw new Error('DEV_AUTH_BYPASS_TOKEN fehlt in apps/api/.env');
  return m[1].trim();
}

function parseSse(raw: string, t0: number): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of raw.split(/\r?\n\r?\n/)) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) events.push({ event, data: data.join('\n'), at: t0 });
  }
  return events;
}

function tryJson(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchProtocol(base: string, headers: Record<string, string>, id: string) {
  // GET /api/docs/:id (docsContractRouter.ts getDocumentById), content ist HTML
  const res = await fetch(`${base}/api/docs/${id}`, { headers });
  if (!res.ok) return null;
  const body = tryJson(await res.text());
  return typeof body?.content === 'string' ? body.content : null;
}

function htmlToMarkdownish(html: string): string {
  return html
    .replace(/<h([1-6])[^>]*>/gi, (_, n: string) => `\n${'#'.repeat(Number(n))} `)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|h[1-6]|div|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function runCase(
  c: TransferCase,
  base: string,
  token: string,
  outDir: string
): Promise<CaseResult> {
  const original = readFileSync(path.join(HERE, 'fixtures', c.fixture), 'utf8');
  const headers = { 'x-dev-auth-bypass': token, origin: 'http://localhost:3000' };
  const body = {
    messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: '' }] }],
    agentId: c.agent,
    platform: 'web',
    modelId: 'auto',
    visualBlocks: VISUAL_BLOCKS,
    attachments: [
      {
        name: 'Eingefügter Text.txt',
        type: 'text/plain',
        size: Buffer.byteLength(original, 'utf8'),
        data: Buffer.from(original, 'utf8').toString('base64'),
        isImage: false,
      },
    ],
  };

  const t0 = Date.now();
  const errors: string[] = [];
  const steps: CaseResult['steps'] = [];
  let finalText = '';
  let documentId: string | null = null;
  let rawSse = '';

  const res = await fetch(`${base}/api/chat-graph/stream`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    errors.push(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  } else {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const flush = (chunk: string) => {
      for (const ev of parseSse(chunk, Date.now())) {
        const payload = tryJson(ev.data);
        const atS = Math.round((ev.at - t0) / 100) / 10;
        if (ev.event === 'text_delta' && typeof payload?.text === 'string')
          finalText += payload.text;
        else if (ev.event === 'document_created' && typeof payload?.documentId === 'string') {
          documentId = payload.documentId;
        } else if (ev.event === 'progress_step' && typeof payload?.title === 'string') {
          steps.push({ title: payload.title, status: String(payload.status ?? ''), atS });
        } else if (ev.event === 'error') errors.push(ev.data.slice(0, 300));
        rawSse += `[+${atS}s] event: ${ev.event}\ndata: ${ev.data}\n\n`;
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const cut = buffer.lastIndexOf('\n\n');
      if (cut >= 0) {
        flush(buffer.slice(0, cut + 2));
        buffer = buffer.slice(cut + 2);
      }
    }
    if (buffer.trim() !== '') flush(buffer);
  }
  const durationS = Math.round((Date.now() - t0) / 100) / 10;

  let protocolHtml: string | null = null;
  if (documentId !== null) {
    try {
      protocolHtml = await fetchProtocol(base, headers, documentId);
    } catch (e) {
      errors.push(`Protokoll nicht abrufbar: ${String(e)}`);
    }
  }
  const protocol = protocolHtml !== null ? htmlToMarkdownish(protocolHtml) : null;
  const header = protocolHtml !== null ? parseProtocolHeader(protocolHtml) : null;
  const isLs = c.agent === 'gruenerator-leichte-sprache';

  writeFileSync(path.join(outDir, `${c.id}.final.md`), finalText);
  writeFileSync(path.join(outDir, `${c.id}.sse.txt`), rawSse);
  writeFileSync(
    path.join(outDir, `${c.id}.protocol.md`),
    protocol ?? `(kein Protokoll; documentId: ${documentId ?? 'keine'})\n`
  );

  return {
    id: c.id,
    agent: c.agent,
    origChars: original.length,
    finalChars: finalText.length,
    ratio: lengthRatio(original, finalText),
    numberRecall: numberRecall(original, finalText),
    urteil: header?.urteil ?? null,
    runden: header?.runden ?? null,
    closingOffer: hasClosingOffer(finalText),
    visualFence: hasVisualBlockFence(finalText),
    trailInMessage: hasCheckTrailInMessage(finalText),
    pageChrome: pageChromeLines(finalText),
    avgSentenceWords: isLs ? avgSentenceWords(finalText) : null,
    longSentenceShare: isLs ? longSentenceShare(finalText) : null,
    durationS,
    documentId,
    protocolFetched: protocol !== null,
    steps,
    errors,
  };
}

const f = (n: number | null, d = 2) => (n === null ? '-' : n.toFixed(d));

function summaryMd(results: CaseResult[], base: string): string {
  const head =
    '| Fall | Agent | Zeichen orig/final | Verhältnis | numberRecall | Urteil | Runden | Schlussangebot | Visual-Fence | Spur in Nachricht | Seitenrauschen | Ø Wörter/Satz | Dauer s |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map(
    (r) =>
      `| ${r.id} | ${r.agent.replace('gruenerator-', '')} | ${r.origChars}/${r.finalChars} | ${f(r.ratio)} | ${f(r.numberRecall)} | ${r.urteil ?? '-'} | ${r.runden ?? '-'} | ${r.closingOffer} | ${r.visualFence} | ${r.trailInMessage} | ${r.pageChrome} | ${f(r.avgSentenceWords, 1)} | ${r.durationS} |`
  );
  const errs = results
    .filter((r) => r.errors.length > 0)
    .map((r) => `- ${r.id}: ${r.errors.join(' / ')}`);
  return `# Übertragungs-Eval\n\nBasis: ${base}\n\n${head}\n${rows.join('\n')}\n${errs.length > 0 ? `\n## Fehler\n${errs.join('\n')}\n` : ''}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      'npx tsx apps/api/evals/transfer/runTransferEval.ts [--case id] [--agent ls|es] [--base http://localhost:3031]\n' +
        `Fälle: ${TRANSFER_CASES.map((c) => c.id).join(', ')}\nDev-Nutzer: ${DEV_USER}`
    );
    return;
  }
  const agentFilter =
    opts.agent === 'ls'
      ? 'gruenerator-leichte-sprache'
      : opts.agent === 'es'
        ? 'gruenerator-einfache-sprache'
        : null;
  const cases = TRANSFER_CASES.filter(
    (c) =>
      (opts.caseId === null || c.id === opts.caseId) &&
      (agentFilter === null || c.agent === agentFilter)
  );
  if (cases.length === 0) throw new Error('Kein Fall passt zu den Filtern');

  const token = readBypassToken();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const outDir = path.join(HERE, 'results', stamp);
  mkdirSync(outDir, { recursive: true });

  const results: CaseResult[] = [];
  for (const c of cases) {
    console.log(`> ${c.id}`);
    try {
      results.push(await runCase(c, opts.base, token, outDir));
    } catch (e) {
      console.error(`  Fehler: ${String(e)}`);
    }
  }
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));
  writeFileSync(path.join(outDir, 'summary.md'), summaryMd(results, opts.base));
  console.log(`\n${summaryMd(results, opts.base)}\nErgebnisse: ${outDir}`);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
