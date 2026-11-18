/**
 * Live-Eval „Rezeptauswahl“: welche Rezepte lädt der Chat bei welchem Auftrag?
 * Messinstrument und Tor für die Tasks A1–A5 („Rezepte als Skills“).
 *
 *   npx tsx evals/recipes/runRecipeSelectionEval.ts --runs 3 --label <name> [--baseline <md>] [--base http://localhost:3001] [--case <id>] [--dry]
 *
 * Request: derselbe Rumpf wie der Web-Chat (`buildRequestBody`, Modus chat) an
 * `POST /api/chat-graph/stream`, je Fall und Lauf OHNE threadId (der Server legt
 * einen frischen Thread an). Auth über `x-dev-auth-bypass` aus `apps/api/.env`.
 *
 * Geladene Rezepte: SSE `tool_step_start` mit `toolName === 'rezept_laden'`
 * (`args.rezept`), das `done`-Feld `metadata.recipesUsed[].mention` (Prompt-Tür
 * und Loop) und der gesetzte `activeSkillMention` des Falls. Das Entscheidungs-
 * journal wird bewusst nicht gelesen.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RECIPE_SELECTION_CASES, type RecipeSelectionCase } from './recipeSelectionCases.js';
import { gate, scoreCase, type ByGroup, type RunResult } from './recipeSelectionScore.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GROUPS: RecipeSelectionCase['group'][] = ['wortliste', 'katalog', 'negativ', 'kombi'];
const BYGROUP_MARK = /<!-- by-group: (.+?) -->/;

function parseArgs(argv: string[]) {
  const o = {
    runs: 3,
    label: 'run',
    baseline: null as string | null,
    base: 'http://localhost:3001',
    caseId: null as string | null,
    dry: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') o.runs = Number(argv[++i] ?? 3);
    else if (a === '--label') o.label = argv[++i] ?? o.label;
    else if (a === '--baseline') o.baseline = argv[++i] ?? null;
    else if (a === '--base') o.base = argv[++i] ?? o.base;
    else if (a === '--case') o.caseId = argv[++i] ?? null;
    else if (a === '--dry') o.dry = true;
  }
  return o;
}

function readBypassToken(): string {
  if (process.env.DEV_AUTH_BYPASS_TOKEN) return process.env.DEV_AUTH_BYPASS_TOKEN;
  const env = readFileSync(path.resolve(HERE, '../../.env'), 'utf8');
  const m = /^DEV_AUTH_BYPASS_TOKEN\s*=\s*"?([^"\n]+)"?/m.exec(env);
  if (!m?.[1]) throw new Error('DEV_AUTH_BYPASS_TOKEN fehlt (Umgebung oder apps/api/.env)');
  return m[1].trim();
}

/** Rumpf wie `buildRequestBody` im Modus `chat` — leere Listen fehlen auf dem Draht. */
function buildBody(c: RecipeSelectionCase): Record<string, unknown> {
  return {
    messages: [{ id: `eval-${c.id}`, role: 'user', parts: [{ type: 'text', text: c.prompt }] }],
    agentId: null,
    platform: 'web',
    ...(c.body?.activeSkillMention ? { activeSkillMention: c.body.activeSkillMention } : {}),
  };
}

function tryJson(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function runOnce(
  base: string,
  token: string,
  c: RecipeSelectionCase,
  run: number
): Promise<RunResult> {
  const started = Date.now();
  const loaded = new Set<string>();
  if (c.body?.activeSkillMention) loaded.add(c.body.activeSkillMention);
  let lane: string | null = null;

  const res = await fetch(`${base}/api/chat-graph/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      'x-dev-auth-bypass': token,
    },
    body: JSON.stringify(buildBody(c)),
  });
  if (!res.ok || !res.body)
    throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);

  const decoder = new TextDecoder();
  let buf = '';
  let event = '';
  const onLine = (line: string) => {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) {
      const data = tryJson(line.slice(5).trim());
      if (!data) return;
      if (event === 'tool_step_start' && data.toolName === 'rezept_laden') {
        const args = data.args as { rezept?: unknown } | undefined;
        if (typeof args?.rezept === 'string') loaded.add(args.rezept);
      } else if (event === 'done') {
        const meta = data.metadata as
          { recipesUsed?: { mention?: string }[]; lane?: string; model?: string } | undefined;
        for (const r of meta?.recipesUsed ?? []) if (r.mention) loaded.add(r.mention);
        lane = meta?.lane ?? meta?.model ?? lane;
      } else if (event === 'error') {
        throw new Error(`SSE error: ${JSON.stringify(data).slice(0, 200)}`);
      }
    } else if (line === '') event = '';
  };
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    lines.forEach(onLine);
  }
  if (buf) onLine(buf);

  return { caseId: c.id, run, loaded: [...loaded].sort(), lane, ms: Date.now() - started };
}

function readBaseline(file: string | null): ByGroup | null {
  if (!file) return null;
  const m = BYGROUP_MARK.exec(readFileSync(file, 'utf8'));
  if (!m?.[1]) throw new Error(`Baseline ohne by-group-Marke: ${file}`);
  return JSON.parse(m[1]) as ByGroup;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cases = RECIPE_SELECTION_CASES.filter((c) => !opts.caseId || c.id === opts.caseId);
  if (cases.length === 0) throw new Error(`Kein Fall ${opts.caseId}`);

  if (opts.dry) {
    const first = cases[0];
    console.log(`POST ${opts.base}/api/chat-graph/stream`);
    console.log('x-dev-auth-bypass: <DEV_AUTH_BYPASS_TOKEN aus apps/api/.env>');
    console.log(JSON.stringify(buildBody(first), null, 2));
    return;
  }

  const token = readBypassToken();
  const baseline = readBaseline(opts.baseline);
  const results = new Map<string, RunResult[]>();
  const errors: string[] = [];

  for (const c of cases) {
    const runs: RunResult[] = [];
    for (let n = 1; n <= opts.runs; n++) {
      try {
        const r = await runOnce(opts.base, token, c, n);
        runs.push(r);
        console.log(`${c.id} #${n}: [${r.loaded.join(', ')}] ${r.ms} ms`);
      } catch (e) {
        // Ein Fehllauf zählt als Fehlschlag (leer geladen), steht aber im Bericht.
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${c.id} #${n}: ${msg}`);
        runs.push({ caseId: c.id, run: n, loaded: ['(fehler)'], lane: null, ms: 0 });
        console.log(`${c.id} #${n}: FEHLER ${msg}`);
      }
    }
    results.set(c.id, runs);
  }

  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, { hits: 0, total: 0 }])) as ByGroup;
  const rows: string[] = [];
  for (const c of cases) {
    const runs = results.get(c.id) ?? [];
    const s = scoreCase(c, runs);
    byGroup[c.group].hits += s.hits;
    byGroup[c.group].total += s.total;
    for (const r of runs) {
      rows.push(
        `| ${c.group} | ${c.id} | ${r.run} | ${r.loaded.join(', ') || '–'} | ${r.lane ?? '–'} | ${r.ms} |`
      );
    }
  }
  const verdict = gate(byGroup, baseline);

  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(HERE, `recipe-selection-${date}-${opts.label}.md`);
  const md = [
    `# Rezeptauswahl-Eval ${date} (${opts.label})`,
    '',
    `Läufe je Fall: ${opts.runs} · Basis: ${opts.base}${opts.caseId ? ` · nur Fall ${opts.caseId}` : ''}`,
    '',
    '## Treffer je Gruppe',
    '',
    '| Gruppe | Treffer |',
    '|---|---|',
    ...GROUPS.map((g) => `| ${g} | ${byGroup[g].hits}/${byGroup[g].total} |`),
    '',
    `## Tor: ${verdict.pass ? 'BESTANDEN' : 'NICHT BESTANDEN'}`,
    '',
    ...(verdict.reasons.length
      ? verdict.reasons.map((r) => `- ${r}`)
      : ['- alle Schwellen erfüllt']),
    baseline ? `\nBaseline-Vergleich: wortliste muss ≥ ${baseline.wortliste.hits}.` : '',
    '',
    '## Läufe',
    '',
    '| Gruppe | Fall | Lauf | geladen | Lane | ms |',
    '|---|---|---|---|---|---|',
    ...rows,
    ...(errors.length ? ['', '## Fehler', '', ...errors.map((e) => `- ${e}`)] : []),
    '',
    `<!-- by-group: ${JSON.stringify(byGroup)} -->`,
    '',
  ].join('\n');
  writeFileSync(out, md);
  console.log(
    `\n${verdict.pass ? 'BESTANDEN' : 'NICHT BESTANDEN'} ${verdict.reasons.join('; ')}\n→ ${out}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
