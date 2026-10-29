/**
 * Prüfseite für einen Eval-Lauf: baut aus `last-run.json` (und, falls vorhanden,
 * `judge-verdicts.json`) EINE eigenständige HTML-Datei `review.html` und die
 * schlanke, stabile Datenform `review-data.json`.
 *
 *   pnpm --filter @gruenerator/api eval:review
 *
 * Env:
 *   EVAL_RUN_FILE   Eingabe (Standard ./evals/last-run.json); Ausgaben und
 *                   `judge-verdicts.json` liegen im selben Ordner.
 *
 * Kein Netz, kein externes CSS/JS. Alles Fremde (Fragen, Antworten, Werkzeug-
 * argumente, Begründungen) wird beim Einsetzen HTML-escaped; `review-data.json`
 * ist die Grundlage für eine spätere Online-Prüfseite.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type Ampel,
  ampelMarke,
  bewerteFall,
  type Stufe,
  type Zusammenfassung,
  zusammenfassen,
} from './ampel.js';
import { type JudgeVerdict, noteJeFall } from './judge/verdicts.js';

import type { CaseResult } from './types.js';

export const REVIEW_DATA_VERSION = 1;

export interface ReviewTurn {
  prompt: string;
  answer: string;
  tools: { name: string; ok: boolean; args: Record<string, unknown> }[];
}

export interface ReviewCase {
  id: string;
  category: string;
  ampel: Ampel;
  /** Als bekannter offener Fehler geführt; zählt nicht in die Zusammenfassung. */
  knownFailure: boolean;
  turns: ReviewTurn[];
  verletzungen: { name: string; stufe: Stufe; detail: string }[];
  /** Richternote 1–5 (schlechtester Turn); null = kein Richter gelaufen. */
  note: number | null;
  notenBegruendung: string | null;
  /** Urteile der übrigen Rubriken — zeigen, färben die Ampel nicht. */
  richter: { rubric: string; turnIndex: number; pass: boolean | null; reason: string }[];
  latenzMs: number;
  modell: { intent: string | null; agentic: boolean };
}

export interface ReviewData {
  version: typeof REVIEW_DATA_VERSION;
  /** Zeitstempel des Laufs (Änderungszeit von last-run.json, ISO 8601). */
  runId: string;
  zusammenfassung: Pick<
    Zusammenfassung,
    'gruen' | 'gelb' | 'rot' | 'durchschnittsnote' | 'benotet'
  >;
  faelle: ReviewCase[];
}

export function buildReviewData(
  cases: readonly CaseResult[],
  verdicts: readonly JudgeVerdict[],
  runId: string
): ReviewData {
  const noten = noteJeFall(verdicts);
  const faelle: ReviewCase[] = cases.map((c) => {
    const note = noten.get(c.id) ?? null;
    const b = bewerteFall(c, note);
    const mine = verdicts.filter((v) => v.caseId === c.id);
    const worst = mine.filter((v) => v.rubric === 'antwortqualitaet' && v.note === note).at(0);
    return {
      id: c.id,
      category: c.category,
      ampel: b.ampel,
      knownFailure: c.knownFailure === true,
      turns: (c.turns ?? []).map((t) => ({
        prompt: t.prompt,
        answer: t.fullText,
        tools: t.toolCalls.map((tc) => ({ name: tc.toolName, ok: tc.ok, args: tc.args ?? {} })),
      })),
      verletzungen: b.verletzungen,
      note,
      notenBegruendung: worst?.reason ?? null,
      richter: mine
        .filter((v) => v.rubric !== 'antwortqualitaet')
        .map((v) => ({ rubric: v.rubric, turnIndex: v.turnIndex, pass: v.pass, reason: v.reason })),
      latenzMs: c.latencyMs,
      modell: { intent: c.intent, agentic: c.agentic },
    };
  });
  const z = zusammenfassen(
    faelle
      .filter((f) => !f.knownFailure)
      .map((f) => ({
        id: f.id,
        bewertung: { ampel: f.ampel, verletzungen: f.verletzungen, note: f.note },
      }))
  );
  return {
    version: REVIEW_DATA_VERSION,
    runId,
    zusammenfassung: {
      gruen: z.gruen,
      gelb: z.gelb,
      rot: z.rot,
      durchschnittsnote: z.durchschnittsnote,
      benotet: z.benotet,
    },
    faelle,
  };
}

/** Escaping für Text UND Attributwerte — Antworten sind fremder Text. */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FARBE: Record<Ampel, string> = { gruen: '#1e8e3e', gelb: '#e0a800', rot: '#c62828' };

function renderCase(f: ReviewCase): string {
  const turns = f.turns
    .map(
      (t, i) => `<section class="turn">
  <p class="label">Frage${f.turns.length > 1 ? ` (Turn ${i + 1})` : ''}</p>
  <pre class="q">${esc(t.prompt)}</pre>
  <p class="label">Antwort</p>
  <pre class="a">${esc(t.answer) || '<em>(keine Antwort)</em>'}</pre>
  <details><summary>Werkzeuge (${t.tools.length})</summary>${
    t.tools.length === 0
      ? '<p>keine</p>'
      : t.tools
          .map(
            (tc) =>
              `<p><strong>${esc(tc.name)}</strong>${tc.ok ? '' : ' (Fehler)'}</p><pre>${esc(JSON.stringify(tc.args, null, 2))}</pre>`
          )
          .join('')
  }</details>
</section>`
    )
    .join('\n');
  const viol =
    f.verletzungen.length === 0
      ? '<p>Keine verletzten Prüfungen.</p>'
      : `<ul>${f.verletzungen
          .map(
            (v) =>
              `<li class="${esc(v.stufe)}"><strong>${esc(v.name)}</strong> [${esc(v.stufe)}] — ${esc(v.detail)}</li>`
          )
          .join('')}</ul>`;
  const note =
    f.note === null
      ? '<p>Note: — (kein Richter gelaufen)</p>'
      : `<p>Note: <strong>${esc(f.note)}</strong> von 5${f.notenBegruendung ? ` — ${esc(f.notenBegruendung)}` : ''}</p>`;
  const richter =
    f.richter.length === 0
      ? ''
      : `<ul>${f.richter
          .map(
            (r) =>
              `<li>${r.pass === true ? 'ok' : r.pass === false ? 'nicht ok' : 'offen'}: ${esc(r.rubric)} (Turn ${esc(r.turnIndex)}) — ${esc(r.reason)}</li>`
          )
          .join('')}</ul>`;
  return `<article class="case" id="${esc(f.id)}" data-ampel="${esc(f.ampel)}">
<h2><span class="dot" style="background:${FARBE[f.ampel]}"></span>${esc(ampelMarke(f.ampel))} ${esc(f.id)}${f.knownFailure ? ' <small>(bekannt offen)</small>' : ''}</h2>
<p class="meta">${esc(f.category)} · ${esc(f.latenzMs)} ms · intent ${esc(f.modell.intent ?? '-')}${f.modell.agentic ? ' / agentic' : ''}</p>
${turns}
<h3>Verletzte Prüfungen</h3>
${viol}
<h3>Richter</h3>
${note}${richter}
</article>`;
}

export function renderReviewHtml(data: ReviewData): string {
  const z = data.zusammenfassung;
  const auffaellig = data.faelle.filter((f) => f.ampel !== 'gruen' && !f.knownFailure);
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Eval-Prüfseite ${esc(data.runId)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:60rem;padding:1rem;color:#1b1b1b;background:#fafafa}
.summary{background:#fff;border:1px solid #ddd;border-radius:8px;padding:1rem;margin-bottom:1.5rem}
.case{background:#fff;border:1px solid #ddd;border-radius:8px;padding:1rem;margin-bottom:1rem}
.case[data-ampel=rot]{border-left:6px solid ${FARBE.rot}}
.case[data-ampel=gelb]{border-left:6px solid ${FARBE.gelb}}
.case[data-ampel=gruen]{border-left:6px solid ${FARBE.gruen}}
.dot{display:inline-block;width:.8em;height:.8em;border-radius:50%;margin-right:.4em}
h2{font-size:1.1rem;margin:.2rem 0}.meta,.label{color:#555;margin:.2rem 0}.label{font-size:.8rem;text-transform:uppercase}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:.6rem;border-radius:6px;margin:.2rem 0 .8rem}
li.hart{color:${FARBE.rot}}li.weich{color:#8a6500}
</style></head><body>
<h1>Eval-Prüfseite</h1>
<section class="summary">
<p>Lauf: ${esc(data.runId)}</p>
<p>🟢 ${esc(z.gruen)} · 🟡 ${esc(z.gelb)} · 🔴 ${esc(z.rot)} · ${
    z.durchschnittsnote === null
      ? 'Note: — (kein Richter gelaufen)'
      : `Ø Note ${esc(z.durchschnittsnote)} (${esc(z.benotet)} benotet)`
  }</p>
${
  auffaellig.length === 0
    ? '<p>Keine gelben oder roten Fälle.</p>'
    : `<ul>${auffaellig
        .map(
          (f) =>
            `<li><a href="#${esc(f.id)}">${esc(ampelMarke(f.ampel))} ${esc(f.id)}</a>: ${esc(
              [
                ...f.verletzungen.map((v) => v.name),
                ...(f.note !== null && f.note <= 3 ? [`Note ${f.note}`] : []),
              ].join(', ')
            )}</li>`
        )
        .join('')}</ul>`
}
</section>
${data.faelle.map(renderCase).join('\n')}
</body></html>
`;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const runFile = process.env.EVAL_RUN_FILE ?? join(here, 'last-run.json');
  if (!existsSync(runFile)) {
    console.error(`No run file at ${runFile} — run eval:chat first.`);
    process.exit(1);
  }
  const dir = dirname(runFile);
  const verdictFile = join(dir, 'judge-verdicts.json');
  const cases = JSON.parse(readFileSync(runFile, 'utf8')) as CaseResult[];
  const verdicts = existsSync(verdictFile)
    ? (JSON.parse(readFileSync(verdictFile, 'utf8')) as JudgeVerdict[])
    : [];
  const data = buildReviewData(cases, verdicts, statSync(runFile).mtime.toISOString());
  writeFileSync(join(dir, 'review.html'), renderReviewHtml(data));
  writeFileSync(join(dir, 'review-data.json'), `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `${join(dir, 'review.html')} · ${join(dir, 'review-data.json')} — ${cases.length} Fälle${
      verdicts.length === 0 ? ' (ohne Richter)' : ''
    }`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
