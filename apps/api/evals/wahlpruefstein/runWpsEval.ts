/**
 * Wahlprüfstein-Eval: echte Verbandskataloge durch den Chat, die Antwort gegen
 * die echte Antwort der Partei gemessen.
 *
 *   npx tsx apps/api/evals/wahlpruefstein/runWpsEval.ts [--mode plain|rezept|agent] [--agent id] [--case id] [--base http://localhost:3031]
 *
 * Die Fälle sind Kataloge Dritter und liegen deshalb im internen Repo:
 * `<INTERN_CONTENT_DIR>/_korpus/wahlpruefsteine/eval/<fall>/` mit
 * `question.md`, `questions.json`, `reference.json`, `meta.json`.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { htmlToStructuredText } from '../../services/scrapers/utils/htmlCleaner.js';

import {
  exclamationCount,
  genderMarks,
  hasClosingOffer,
  hasFederalTitle,
  titleNamesElection,
  hasReleaseNote,
  median,
  segmentAnswers,
  titleLine,
  wirShare,
  wordCount,
  type AnswerSegment,
  type CatalogQuestion,
} from './metrics.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const ORDER = 'Beantworte diesen Wahlprüfstein-Katalog.';

type Mode = 'plain' | 'rezept' | 'agent';

interface Meta {
  id: string;
  wahl: string;
  verband: string;
  zeichenlimit: number | null;
}
interface Reference {
  title: string | null;
  answers: { n: number; answer: string; answer_short?: string; joined_with?: number }[];
}

interface CaseResult {
  id: string;
  mode: Mode;
  agent: string;
  questions: number;
  answered: number;
  medianWords: number | null;
  refMedianWords: number | null;
  overLimit: number | null;
  title: string | null;
  federalTitle: boolean;
  rightElection: boolean;
  releaseNote: boolean;
  gender: { star: number; colon: number; binnenI: number };
  wirShare: number | null;
  refWirShare: number | null;
  exclamations: number;
  closingOffer: boolean;
  tools: string[];
  documentId: string | null;
  durationS: number;
  errors: string[];
}

function parseArgs(argv: string[]) {
  const opts = {
    mode: 'rezept' as Mode,
    agent: 'gruenerator-universal',
    caseId: null as string | null,
    base: 'http://localhost:3031',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') opts.mode = (argv[++i] ?? 'rezept') as Mode;
    else if (a === '--agent') opts.agent = argv[++i] ?? opts.agent;
    else if (a === '--case') opts.caseId = argv[++i] ?? null;
    else if (a === '--base') opts.base = argv[++i] ?? opts.base;
  }
  return opts;
}

function casesDir(): string {
  const intern = process.env.INTERN_CONTENT_DIR ?? path.join(REPO, '.external/gruenerator-intern');
  const dir = path.join(intern, '_korpus/wahlpruefsteine/eval');
  if (!existsSync(dir)) throw new Error(`Fälle fehlen: ${dir} (INTERN_CONTENT_DIR setzen)`);
  return dir;
}

function readBypassToken(): string {
  const env = readFileSync(path.resolve(HERE, '../../.env'), 'utf8');
  const m = /^DEV_AUTH_BYPASS_TOKEN\s*=\s*"?([^"\n]+)"?/m.exec(env);
  if (!m?.[1]) throw new Error('DEV_AUTH_BYPASS_TOKEN fehlt in apps/api/.env');
  return m[1].trim();
}

function tryJson(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchDocumentText(base: string, headers: Record<string, string>, id: string) {
  const res = await fetch(`${base}/api/docs/${id}`, { headers });
  if (!res.ok) return null;
  const body = tryJson(await res.text());
  if (typeof body?.content !== 'string') return null;
  // Strukturerhaltend (Überschriften, Absätze, Listen) — dieselbe Tür wie die Scraper.
  return htmlToStructuredText(body.content);
}

async function streamTurn(
  base: string,
  headers: Record<string, string>,
  body: unknown
): Promise<{
  text: string;
  tools: string[];
  documentId: string | null;
  threadId: string | null;
  sse: string;
  errors: string[];
}> {
  const res = await fetch(`${base}/api/chat-graph/stream`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
  const out = {
    text: '',
    tools: [] as string[],
    documentId: null as string | null,
    threadId: null as string | null,
    sse: '',
    errors: [] as string[],
  };
  if (!res.ok || !res.body) {
    out.errors.push(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return out;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const handle = (block: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) return;
    const raw = data.join('\n');
    const p = tryJson(raw);
    if (event === 'text_delta' && typeof p?.text === 'string') out.text += p.text;
    else if (event === 'tool_step_start') {
      const name = p?.toolName ?? p?.tool ?? p?.name;
      if (typeof name === 'string') out.tools.push(name);
    } else if (
      event === 'document_created' &&
      typeof p?.documentId === 'string' &&
      p.background !== true
    )
      out.documentId = p.documentId;
    else if (event === 'error') out.errors.push(raw.slice(0, 300));
    if ((event === 'thread_created' || event === 'done') && typeof p?.threadId === 'string')
      out.threadId = p.threadId;
    if (event !== 'text_delta' && event !== 'reasoning_delta')
      out.sse += `event: ${event}\ndata: ${raw.slice(0, 2000)}\n\n`;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const cut = buffer.lastIndexOf('\n\n');
    if (cut >= 0) {
      for (const block of buffer.slice(0, cut).split(/\r?\n\r?\n/)) handle(block);
      buffer = buffer.slice(cut + 2);
    }
  }
  if (buffer.trim() !== '') handle(buffer);
  return out;
}

function countOverLimit(segments: AnswerSegment[], limit: number | null): number | null {
  if (limit === null) return null;
  return segments.filter((s) => s.answer.length > limit).length;
}

async function runCase(
  dir: string,
  id: string,
  opts: ReturnType<typeof parseArgs>,
  token: string,
  outDir: string
): Promise<CaseResult> {
  const catalog = readFileSync(path.join(dir, id, 'question.md'), 'utf8');
  const questions = JSON.parse(
    readFileSync(path.join(dir, id, 'questions.json'), 'utf8')
  ) as CatalogQuestion[];
  const reference = JSON.parse(
    readFileSync(path.join(dir, id, 'reference.json'), 'utf8')
  ) as Reference;
  const meta = JSON.parse(readFileSync(path.join(dir, id, 'meta.json'), 'utf8')) as Meta;
  const headers = { 'x-dev-auth-bypass': token, origin: 'http://localhost:3000' };
  const body = {
    messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: ORDER }] }],
    agentId: opts.agent,
    platform: 'web',
    modelId: 'auto',
    ...(opts.mode === 'rezept' ? { activeSkillMention: 'wahlpruefstein' } : {}),
    attachments: [
      {
        name: 'Eingefügter Text.txt',
        type: 'text/plain',
        size: Buffer.byteLength(catalog, 'utf8'),
        data: Buffer.from(catalog, 'utf8').toString('base64'),
        isImage: false,
      },
    ],
  };

  const t0 = Date.now();
  const turn = await streamTurn(opts.base, headers, body);
  const durationS = Math.round((Date.now() - t0) / 100) / 10;
  let text = turn.text;
  if (turn.documentId !== null) {
    const doc = await fetchDocumentText(opts.base, headers, turn.documentId);
    if (doc !== null) text = `${doc}\n\n---\n${turn.text}`;
  }
  // Den Thread wegräumen: sonst holt der proaktive Rückgriff auf frühere Chats
  // die Antwort dieses Laufs in den nächsten Lauf desselben Katalogs.
  if (turn.threadId !== null) {
    await fetch(`${opts.base}/api/chat-service/threads?threadId=${turn.threadId}`, {
      method: 'DELETE',
      headers,
    }).catch(() => undefined);
  }
  writeFileSync(path.join(outDir, `${id}.md`), text);
  writeFileSync(path.join(outDir, `${id}.sse.txt`), turn.sse);

  const segments = segmentAnswers(text, questions, catalog);
  const refAnswers = reference.answers.filter((a) => a.joined_with === undefined);
  const refSegments: AnswerSegment[] = refAnswers.map((a) => ({ n: a.n, answer: a.answer }));
  return {
    id,
    mode: opts.mode,
    agent: opts.agent,
    questions: questions.length,
    answered: segments.filter((s) => wordCount(s.answer) >= 5).length,
    medianWords: median(segments.filter((s) => s.answer).map((s) => wordCount(s.answer))),
    refMedianWords: median(refSegments.map((s) => wordCount(s.answer))),
    overLimit: countOverLimit(segments, meta.zeichenlimit),
    title: titleLine(text),
    federalTitle: hasFederalTitle(text),
    rightElection: titleNamesElection(text, meta.wahl),
    releaseNote: hasReleaseNote(text),
    gender: genderMarks(segments.map((s) => s.answer).join('\n')),
    wirShare: wirShare(segments),
    refWirShare: wirShare(refSegments),
    exclamations: exclamationCount(segments),
    // Das Dokument-Angebot hängt das System an (artifactOffer.ts), nicht das Modell.
    closingOffer: hasClosingOffer(
      turn.text.replace(/\n*Soll ich daraus ein Dokument machen[^\n]*\s*$/, '')
    ),
    tools: turn.tools,
    documentId: turn.documentId,
    durationS,
    errors: turn.errors,
  };
}

const f = (n: number | null, d = 0) => (n === null ? '-' : n.toFixed(d));

function summaryMd(results: CaseResult[], opts: ReturnType<typeof parseArgs>): string {
  const head =
    '| Fall | beantwortet | Ø-Wörter (Median) KI/Ref | über Limit | Bund-Titel | Wahl richtig | Freigabe/Kontakt | Stern/Doppelpunkt | Wir-Anteil KI/Ref | ! | Schlussfrage | Werkzeuge | s |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map(
    (r) =>
      `| ${r.id} | ${r.answered}/${r.questions} | ${f(r.medianWords)}/${f(r.refMedianWords)} | ${r.overLimit ?? '-'} | ${r.federalTitle} | ${r.rightElection} | ${r.releaseNote} | ${r.gender.star}/${r.gender.colon} | ${f(r.wirShare, 2)}/${f(r.refWirShare, 2)} | ${r.exclamations} | ${r.closingOffer} | ${[...new Set(r.tools)].join(', ')} | ${r.durationS} |`
  );
  const errs = results
    .filter((r) => r.errors.length > 0)
    .map((r) => `- ${r.id}: ${r.errors.join(' / ')}`);
  return `# Wahlprüfstein-Eval\n\nModus: ${opts.mode}, Agent: ${opts.agent}, Basis: ${opts.base}\n\n${head}\n${rows.join('\n')}\n${errs.length > 0 ? `\n## Fehler\n${errs.join('\n')}\n` : ''}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dir = casesDir();
  const ids = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (opts.caseId === null || d.name === opts.caseId))
    .map((d) => d.name)
    .sort();
  if (ids.length === 0) throw new Error('Kein Fall passt zu den Filtern');
  const token = readBypassToken();
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
  const outDir = path.join(HERE, 'results', `${stamp}-${opts.mode}`);
  mkdirSync(outDir, { recursive: true });
  const results: CaseResult[] = [];
  for (const id of ids) {
    console.log(`> ${id}`);
    try {
      results.push(await runCase(dir, id, opts, token, outDir));
    } catch (e) {
      console.error(`  Fehler: ${String(e)}`);
    }
  }
  writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(results, null, 2));
  writeFileSync(path.join(outDir, 'summary.md'), summaryMd(results, opts));
  console.log(`\n${summaryMd(results, opts)}\nErgebnisse: ${outDir}`);
}

void main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
