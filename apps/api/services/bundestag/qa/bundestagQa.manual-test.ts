/**
 * Live-Lauf des Bundestag-Q&A gegen DIP und die echten Modelle. Kein Unit-Test,
 * kein CI: er kostet Geld (wenige Cent) und hängt an DIP, Cortecs und Melious.
 *
 * Aufruf:
 *   cd apps/api && NODE_OPTIONS=--conditions=development npx tsx services/bundestag/qa/bundestagQa.manual-test.ts
 *   ... --probe     nur die Vorprüfung der drei Lese-Modelle
 *   ... --part=a    nur Teil A (sechs Fragen über die Fassade + Urheber-Prüfung)
 *   ... --part=b    nur Teil B (Lese-Modell-Vergleich; holt die Dokumente selbst)
 *   ... --out=<pfad> zusätzlich als Markdown in diese Datei schreiben
 *
 * Braucht `DIP_API_KEY`, `CORTECS_API_KEY`, `MELIOUS_API_KEY` in apps/api/.env.
 * Redis ist optional: der Textcache fällt bei Fehlern still auf Live-Abrufe zurück.
 *
 * Was ein Modell tatsächlich gerechnet hat, sagt nicht die Fassade: ein
 * gepinnter Aufruf, der leer zurückkommt, läuft still die generische
 * Ausweichkette hinunter. Deshalb hängt sich der Lauf an `globalThis.fetch` und
 * protokolliert je Modellaufruf das angefragte und das gemeldete Modell, den
 * Denk-Parameter auf dem Draht und die Tokens aus der Antwort.
 */
import 'dotenv/config';

import { writeFileSync } from 'node:fs';

import { type BundestagAnswerResponse, bundestagUrheberSchema } from '@gruenerator/contracts';

import { env } from '../../../config/env.js';
import { aiObject, type AiCall } from '../../ai/generate.js';
import { _resetModelHealthForTests, primeBaseline } from '../../ai/modelHealth.js';
import { DipClient } from '../dip/dipClient.js';

import { ENDPOINT_BUDGET } from './budget.js';
import { fetchTexts, resolveRefs, type FetchedDoc, type TextCache } from './fetchTexts.js';
import { type FindMcp } from './find.js';
import { keywordsFromQuestion } from './plan.js';
import { readDocuments, type ReadResult } from './read.js';

import { answerBundestagQuestion, type QaDeps } from './index.js';

// ── Ausgabe ──────────────────────────────────────────────────────────────────

const lines: string[] = [];
function out(line = ''): void {
  console.log(line);
  lines.push(line);
}

// ── Draht-Mitschrift ─────────────────────────────────────────────────────────

interface WireCall {
  tag: string;
  host: string;
  requestedModel: string;
  reasoningEffort: string | null;
  status: number;
  servedModel: string | null;
  upstream: string | null;
  inputChars: number;
  outputChars: number;
  promptTokens: number | null;
  completionTokens: number | null;
  ms: number;
}

const wire: WireCall[] = [];
let currentTag = 'setup';

function messageChars(body: Record<string, unknown>): number {
  const msgs = Array.isArray(body.messages) ? (body.messages as { content?: unknown }[]) : [];
  let n = 0;
  for (const m of msgs) {
    if (typeof m.content === 'string') n += m.content.length;
    else if (Array.isArray(m.content)) n += JSON.stringify(m.content).length;
  }
  return n;
}

interface ChatJson {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { function?: { arguments?: string } }[];
    };
  }[];
}

function outputCharsOf(json: ChatJson): number {
  const msg = json.choices?.[0]?.message;
  const text = msg?.content?.length ?? 0;
  const tools = (msg?.tool_calls ?? []).reduce(
    (n, t) => n + (t.function?.arguments?.length ?? 0),
    0
  );
  return text + tools;
}

/** Hängt sich vor jeden Modellaufruf; DIP- und PDF-Abrufe bleiben unberührt. */
function installWireTap(): void {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === 'string' && url.includes('/chat/completions')) {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    if (!body) return original(input, init);

    const startedAt = Date.now();
    const entry: WireCall = {
      tag: currentTag,
      host: new URL(url).hostname,
      requestedModel: String(body.model),
      reasoningEffort: typeof body.reasoning_effort === 'string' ? body.reasoning_effort : null,
      status: 0,
      servedModel: null,
      upstream: null,
      inputChars: messageChars(body),
      outputChars: 0,
      promptTokens: null,
      completionTokens: null,
      ms: 0,
    };
    wire.push(entry);
    const response = await original(input, init);
    entry.status = response.status;
    entry.ms = Date.now() - startedAt;
    entry.servedModel = response.headers.get('x-cortecs-model');
    entry.upstream = response.headers.get('x-cortecs-provider');
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.includes('application/json')) {
      // Auf einem Klon lesen: den Körper verbraucht das SDK.
      try {
        const json = (await response.clone().json()) as ChatJson;
        entry.servedModel = entry.servedModel ?? json.model ?? null;
        entry.promptTokens = json.usage?.prompt_tokens ?? null;
        entry.completionTokens = json.usage?.completion_tokens ?? null;
        entry.outputChars = outputCharsOf(json);
      } catch {
        // Kein lesbares JSON — dann bleiben die Felder leer.
      }
    } else if (!response.ok) {
      const text = await response.clone().text();
      console.warn(
        `[wire] ${entry.host} ${entry.requestedModel} → ${response.status}: ${text.slice(0, 300)}`
      );
    }
    return response;
  };
}

// ── Preise und Schätzung ─────────────────────────────────────────────────────

interface ModelSpec {
  key: 'a' | 'b' | 'c';
  label: string;
  target: AiCall['pinned'] | null;
  provider: 'cortecs' | 'melious';
  /** Modell, das auf dem Draht erwartet wird. */
  wireModel: string;
  priceIn: number;
  priceOut: number;
  /** Zeichen je Token deutscher Fließtext (gemessen an Füllprosa). */
  charsPerToken: number;
}

const MODELS: ModelSpec[] = [
  {
    key: 'a',
    label: 'Standard-Lane (Gemma 4 31B, Cortecs)',
    target: null,
    provider: 'cortecs',
    wireModel: 'gemma-4-31b-it',
    priceIn: 0.2,
    priceOut: 0.35,
    charsPerToken: 3.9,
  },
  {
    key: 'b',
    label: 'Kolibri-1 (Cortecs)',
    target: { provider: 'cortecs', model: 'kolibri-1' },
    provider: 'cortecs',
    wireModel: 'kolibri-1',
    priceIn: 0.15,
    priceOut: 0.55,
    charsPerToken: 5.7,
  },
  {
    key: 'c',
    label: 'Gemma 4 26B-A4B (Melious)',
    target: { provider: 'melious', model: 'gemma-4-26b-a4b' },
    provider: 'melious',
    wireModel: 'gemma-4-26b-a4b',
    priceIn: 0.25,
    priceOut: 0.5,
    charsPerToken: 3.9,
  },
];

function eur(n: number): string {
  return `${n.toFixed(4)} €`;
}

interface WireSummary {
  calls: number;
  failed: number;
  offModel: number;
  inTokens: number;
  outTokens: number;
  estIn: number;
  estOut: number;
  costMeasured: number;
  costEstimated: number;
}

function summarise(tag: string, spec: ModelSpec): WireSummary {
  const calls = wire.filter((w) => w.tag === tag);
  const s: WireSummary = {
    calls: calls.length,
    failed: calls.filter((c) => c.status !== 200).length,
    offModel: calls.filter(
      (c) =>
        c.requestedModel !== spec.wireModel ||
        (c.servedModel !== null && c.servedModel !== spec.wireModel)
    ).length,
    inTokens: calls.reduce((n, c) => n + (c.promptTokens ?? 0), 0),
    outTokens: calls.reduce((n, c) => n + (c.completionTokens ?? 0), 0),
    estIn: Math.round(calls.reduce((n, c) => n + c.inputChars, 0) / spec.charsPerToken),
    estOut: Math.round(calls.reduce((n, c) => n + c.outputChars, 0) / spec.charsPerToken),
    costMeasured: 0,
    costEstimated: 0,
  };
  s.costMeasured = (s.inTokens * spec.priceIn + s.outTokens * spec.priceOut) / 1e6;
  s.costEstimated = (s.estIn * spec.priceIn + s.estOut * spec.priceOut) / 1e6;
  return s;
}

function wireLine(w: WireCall): string {
  return (
    `  ${w.host} req=${w.requestedModel} served=${w.servedModel ?? '?'} upstream=${w.upstream ?? '-'} ` +
    `reasoning_effort=${w.reasoningEffort ?? '(fehlt)'} status=${w.status} ` +
    `tokens=${w.promptTokens ?? '?'}/${w.completionTokens ?? '?'} out=${w.outputChars}Z ${w.ms}ms`
  );
}

// ── Außenwelt ────────────────────────────────────────────────────────────────

/** Teil A/B brauchen den MCP nur im Rückfall; ein Ausfall soll den Lauf nicht kippen. */
async function makeDeps(): Promise<QaDeps> {
  if (!env.DIP_API_KEY) throw new Error('DIP_API_KEY fehlt in apps/api/.env');
  const dip = new DipClient(env.DIP_API_KEY, {
    timeoutMs: 20_000,
    maxAttempts: 2,
    pacingMs: 250,
    rateLimitCooldownMs: 5_000,
  });
  const { getBundestagMCPClient } = await import('../BundestagMCPClient.js');
  let redis: TextCache | null = null;
  try {
    const { redisClient, ensureConnected } = await import('../../../utils/redis/client.js');
    await ensureConnected();
    redis = redisClient as unknown as TextCache;
  } catch (e) {
    console.warn(`Redis nicht erreichbar, ohne Cache: ${String(e)}`);
  }
  return { dip, mcp: getBundestagMCPClient() as unknown as FindMcp, redis };
}

// ── Vorprüfung ───────────────────────────────────────────────────────────────

const PROBE_SCHEMA = {
  type: 'object',
  properties: { antwort: { type: 'string' } },
  required: ['antwort'],
};

async function probe(): Promise<boolean> {
  out('## Vorprüfung: ein kleiner gepinnter Aufruf je Modell');
  out();
  let ok = true;
  for (const spec of MODELS) {
    currentTag = `probe-${spec.key}`;
    const res = await aiObject<{ antwort: string }>({
      lane: 'bundestag_read',
      ...(spec.target ? { pinned: spec.target } : {}),
      json: true,
      temperature: 0,
      maxOutputTokens: 200,
      attempts: 1,
      prompt: 'Nenne die Hauptstadt von Frankreich in einem Wort.',
      toolName: 'antwort_melden',
      toolDescription: 'Melde die Antwort.',
      schema: PROBE_SCHEMA,
      validate: (input) => {
        const o = input as { antwort?: unknown } | null;
        return typeof o?.antwort === 'string' && o.antwort.trim()
          ? { ok: true, value: { antwort: o.antwort } }
          : { ok: false, error: 'antwort fehlt' };
      },
      label: `probe:${spec.key}`,
    });
    const calls = wire.filter((w) => w.tag === currentTag);
    const first = calls[0];
    const sameModel =
      calls.length === 1 &&
      first?.status === 200 &&
      first.requestedModel === spec.wireModel &&
      (first.servedModel === null || first.servedModel.startsWith(spec.wireModel));
    const passed = res.ok && sameModel;
    if (!passed) ok = false;
    out(`### (${spec.key}) ${spec.label}: ${passed ? 'OK' : 'FEHLER'}`);
    out(`- Ergebnis: ${res.ok ? JSON.stringify(res.data) : `FEHLER ${res.error}`}`);
    out(`- Aufrufe auf dem Draht: ${calls.length}`);
    for (const c of calls) out(wireLine(c));
    out();
  }
  return ok;
}

// ── Teil A ───────────────────────────────────────────────────────────────────

const QUESTIONS = [
  'Was sieht der Gesetzentwurf 21/1928 zur kommunalen Wärmeplanung vor?',
  'Welche Anträge hat die grüne Bundestagsfraktion in dieser Wahlperiode zu Wärmepumpen gestellt?',
  'Welche Entschließungsanträge haben die Grünen seit Januar 2026 eingebracht?',
  'Was antwortet die Bundesregierung auf die Kleine Anfrage der Grünen 21/8725?',
  "Wie wurde der Antrag 'Heizkostendeckel sofort einführen' im Plenum debattiert?",
  'Welche Drucksachen gibt es zur Rente mit 70?',
];

/** Refs je Frage aus Teil A, damit Teil B auf denselben Dokumenten liest. */
const refsByQuestion = new Map<number, string[]>();

async function partA(deps: QaDeps): Promise<void> {
  out('## Teil A: sechs Fragen über `answerBundestagQuestion` (ENDPOINT_BUDGET)');
  out();
  for (const [i, question] of QUESTIONS.entries()) {
    currentTag = `A${i + 1}`;
    out(`### A${i + 1}. ${question}`);
    out();
    let res: BundestagAnswerResponse;
    try {
      res = await answerBundestagQuestion({ question, budget: ENDPOINT_BUDGET, deps });
    } catch (e) {
      out(`FEHLER: ${e instanceof Error ? e.message : String(e)}`);
      out();
      continue;
    }
    refsByQuestion.set(
      i + 1,
      res.documents.map((d) => d.ref)
    );
    out(`- Filter: \`${JSON.stringify(res.filters)}\``);
    out(`- Notizen: ${res.notes.length ? res.notes.join(' | ') : '(keine)'}`);
    out(
      `- Kandidaten (${res.documents.length}): ${res.documents.map((d) => `${d.ref} ${d.drucksachetyp}`).join('; ')}`
    );
    out();
    out(
      '| Ref | Typ | Titel | Quelle | Fenster | relevant | Punkte ok | verworfen | übersprungen |'
    );
    out('|---|---|---|---|---|---|---|---|---|');
    for (const d of res.documents) {
      out(
        `| ${d.ref} | ${d.drucksachetyp} | ${d.titel.slice(0, 70).replace(/\|/g, '/')} | ${d.textSource} | ` +
          `${d.windowsRead}/${d.windowsTotal} | ${d.relevant ? 'ja' : 'nein'} | ${d.points.length} | ${d.droppedPoints} | ${d.skipped ?? '-'} |`
      );
    }
    out();
    out(
      `- Zeiten: gesamt ${res.stats.msTotal} ms, lesen ${res.stats.msRead} ms; gelesen ${res.stats.charsRead} Zeichen; ` +
        `Punkte belegt ${res.stats.pointsVerified}, verworfen ${res.stats.pointsDropped}; ungültige Zitate ${res.stats.invalidCitations}`
    );
    const calls = wire.filter((w) => w.tag === currentTag);
    const models = [...new Set(calls.map((c) => `${c.requestedModel}→${c.servedModel ?? '?'}`))];
    out(
      `- Modellaufrufe: ${calls.length} (${models.join(', ')}), Fehlstatus: ${calls.filter((c) => c.status !== 200).length}`
    );
    out();
    out('**Antwort:**');
    out();
    out(
      res.answer
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
    );
    out();
  }
}

async function urheberCheck(deps: QaDeps): Promise<void> {
  currentTag = 'urheber';
  out('### Urheber-Enum gegen DIP (WP 21 oder 20)');
  out();
  out('| Urheber | Drucksachen WP 21/20 | ok |');
  out('|---|---|---|');
  for (const u of bundestagUrheberSchema.options) {
    const page = await deps.dip.list('drucksache', { 'f.wahlperiode': [21, 20], 'f.urheber': u });
    out(`| ${u} | ${page.numFound} | ${page.numFound > 0 ? 'ja' : 'NEIN'} |`);
  }
  out();
}

// ── Teil B ───────────────────────────────────────────────────────────────────

interface Case {
  label: string;
  question: string;
  auftrag: 'frage' | 'zusammenfassung';
  q: number;
}

const CASES: Case[] = [
  { label: 'B1', question: QUESTIONS[0]!, auftrag: 'frage', q: 1 },
  { label: 'B2', question: QUESTIONS[1]!, auftrag: 'frage', q: 2 },
  { label: 'B4', question: QUESTIONS[3]!, auftrag: 'frage', q: 4 },
  { label: 'B5', question: QUESTIONS[4]!, auftrag: 'frage', q: 5 },
  { label: 'B1z', question: QUESTIONS[0]!, auftrag: 'zusammenfassung', q: 1 },
];

/** Feste Refs, falls Teil A nicht im selben Lauf lief. */
const FALLBACK_REFS: Record<number, string[]> = {
  1: ['21/1928'],
  4: ['21/8725'],
};

interface ModelRun {
  results: ReadResult[];
  ms: number;
}

async function docsFor(c: Case, deps: QaDeps): Promise<FetchedDoc[]> {
  const refs = refsByQuestion.get(c.q) ?? FALLBACK_REFS[c.q] ?? [];
  if (refs.length === 0) {
    // Ohne Teil A: die Fassade einmal ohne Antwort laufen lassen wäre teurer; die Refs kommen aus einem Plan-Lauf.
    const { planBundestagQuestion } = await import('./index.js');
    currentTag = `${c.label}-plan`;
    const plan = await planBundestagQuestion({
      question: c.question,
      budget: ENDPOINT_BUDGET,
      deps,
    });
    refs.push(...plan.candidates.map((x) => x.ref));
    refsByQuestion.set(c.q, refs);
  }
  const candidates = await resolveRefs(refs, deps.dip);
  return fetchTexts(candidates, {
    dip: deps.dip,
    redis: deps.redis,
    signal: AbortSignal.timeout(ENDPOINT_BUDGET.deadlineMs),
  });
}

const totals = new Map<string, { verified: number; dropped: number; ms: number; calls: number }>();

async function partB(deps: QaDeps): Promise<void> {
  out('## Teil B: Lese-Modell-Vergleich (`readDocuments` mit `target`)');
  out();
  for (const c of CASES) {
    out(`### ${c.label}. ${c.question} (${c.auftrag})`);
    out();
    let docs: FetchedDoc[];
    try {
      docs = await docsFor(c, deps);
    } catch (e) {
      out(`FEHLER beim Holen: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    out(
      `Dokumente: ${docs.map((d) => `${d.ref} (${d.textSource}, ${d.text.length} Z)`).join('; ')}`
    );
    out();
    const keywords = keywordsFromQuestion(c.question);
    const runs = new Map<string, ModelRun>();
    for (const spec of MODELS) {
      currentTag = `${c.label}-${spec.key}`;
      // Ein grosses Lesefenster drückt die gemessenen tok/s (Prefill zählt mit), `modelHealth`
      // erklärt das Modell dann für 5 min als zäh und `modelSiblings` tauscht still. Der
      // Vergleich will das angefragte Modell: frischer Zustand und eine Basislinie, unter die
      // keine Probe fallen kann. Teil A lässt den Mechanismus laufen (Produktionsverhalten).
      _resetModelHealthForTests();
      for (const m of MODELS) primeBaseline(m.provider, m.wireModel, 0.001);
      const startedAt = Date.now();
      const results = await readDocuments({
        question: c.question,
        keywords,
        auftrag: c.auftrag,
        docs,
        budget: ENDPOINT_BUDGET,
        signal: AbortSignal.timeout(ENDPOINT_BUDGET.deadlineMs),
        ...(spec.target ? { target: spec.target } : {}),
      });
      runs.set(spec.key, { results, ms: Date.now() - startedAt });
    }

    out(
      '| Modell | belegt | verworfen | Drop-Rate | relevante Dok. | Aufrufe | Fehl/fremd | Tokens in/out (gemessen) | Tokens in/out (geschätzt) | Wandzeit | Kosten gemessen | Kosten geschätzt |'
    );
    out('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const spec of MODELS) {
      const run = runs.get(spec.key)!;
      const verified = run.results.reduce((n, r) => n + r.points.length, 0);
      const dropped = run.results.reduce((n, r) => n + r.droppedPoints, 0);
      const relevant = run.results.filter((r) => r.relevant).map((r) => r.doc.ref);
      const s = summarise(`${c.label}-${spec.key}`, spec);
      const t = totals.get(spec.key) ?? { verified: 0, dropped: 0, ms: 0, calls: 0 };
      totals.set(spec.key, {
        verified: t.verified + verified,
        dropped: t.dropped + dropped,
        ms: t.ms + run.ms,
        calls: t.calls + s.calls,
      });
      const rate =
        verified + dropped > 0 ? `${Math.round((100 * dropped) / (verified + dropped))} %` : '-';
      out(
        `| (${spec.key}) ${spec.wireModel} | ${verified} | ${dropped} | ${rate} | ${relevant.length}/${docs.length} ${relevant.join(', ')} | ` +
          `${s.calls} | ${s.failed}/${s.offModel} | ${s.inTokens}/${s.outTokens} | ${s.estIn}/${s.estOut} | ${run.ms} ms | ` +
          `${eur(s.costMeasured)} | ${eur(s.costEstimated)} |`
      );
    }
    out();
    for (const spec of MODELS) {
      const odd = wire.filter(
        (w) =>
          w.tag === `${c.label}-${spec.key}` &&
          (w.status !== 200 ||
            w.requestedModel !== spec.wireModel ||
            (w.servedModel !== null && w.servedModel !== spec.wireModel))
      );
      for (const w of odd) out(`- Auffällig (${spec.key}):${wireLine(w)}`);
    }

    out();
    out('**Punkte nebeneinander**');
    for (const doc of docs) {
      out();
      out(`#### ${doc.ref} ${doc.drucksachetyp}: ${doc.titel.slice(0, 100)}`);
      for (const spec of MODELS) {
        const r = runs.get(spec.key)!.results.find((x) => x.doc.ref === doc.ref);
        out();
        out(
          `*(${spec.key}) ${spec.wireModel}* — relevant ${r?.relevant ? 'ja' : 'nein'}, Fenster ${r?.windowsRead ?? 0}/${r?.windowsTotal ?? 0}, ` +
            `verworfen ${r?.droppedPoints ?? 0}${r?.skipped ? `, übersprungen: ${r.skipped}` : ''}`
        );
        for (const p of r?.points ?? []) {
          out(
            `- ${p.aussage}  \n  „${p.zitat.slice(0, 220)}${p.zitat.length > 220 ? ' …' : ''}" (${p.method})`
          );
        }
      }
    }
    out();
  }

  out('### Teil B gesamt');
  out();
  out(
    '| Modell | belegt | verworfen | Drop-Rate | Aufrufe | Wandzeit | Kosten gemessen | Kosten geschätzt |'
  );
  out('|---|---|---|---|---|---|---|---|');
  for (const spec of MODELS) {
    const t = totals.get(spec.key) ?? { verified: 0, dropped: 0, ms: 0, calls: 0 };
    let measured = 0;
    let estimated = 0;
    for (const c of CASES) {
      const s = summarise(`${c.label}-${spec.key}`, spec);
      measured += s.costMeasured;
      estimated += s.costEstimated;
    }
    const rate =
      t.verified + t.dropped > 0
        ? `${Math.round((100 * t.dropped) / (t.verified + t.dropped))} %`
        : '-';
    out(
      `| (${spec.key}) ${spec.wireModel} | ${t.verified} | ${t.dropped} | ${rate} | ${t.calls} | ${t.ms} ms | ${eur(measured)} | ${eur(estimated)} |`
    );
  }
  out();
}

// ── Lauf ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const part = args.find((a) => a.startsWith('--part='))?.slice('--part='.length) ?? 'all';
  const outPath = args.find((a) => a.startsWith('--out='))?.slice('--out='.length) ?? null;
  installWireTap();

  out(`# Bundestag-Q&A Live-Lauf ${new Date().toISOString()}`);
  out();
  out(
    'Kosten: „gemessen" aus `usage` der Antworten, „geschätzt" aus Zeichen/Token (Gemma 3,9, Kolibri 5,7); ' +
      'Preise €/M in/out: gemma-4-31b-it 0,20/0,35, kolibri-1 0,15/0,55, gemma-4-26b-a4b 0,25/0,50.'
  );
  out();

  const probeOk = await probe();
  if (args.includes('--probe')) return finish(outPath);
  if (!probeOk)
    out(
      '**Vorprüfung nicht bestanden — der Vergleich in Teil B ist nur eingeschränkt aussagekräftig.**'
    );

  const deps = await makeDeps();
  if (part === 'all' || part === 'a') {
    await partA(deps);
    await urheberCheck(deps);
  }
  if (part === 'all' || part === 'b') await partB(deps);
  finish(outPath);
}

function finish(outPath: string | null): void {
  if (outPath) writeFileSync(outPath, `${lines.join('\n')}\n`);
}

void main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .then(() => process.exit(process.exitCode ?? 0));
