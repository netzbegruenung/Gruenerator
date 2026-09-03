/**
 * Human sanity check against the model judge — a small blind sample of
 * challenger-vs-baseline pairs (the first configured comparison, default
 * `cut vs today`) a person scores by eye, then compared against
 * `judgeAnswers.ts`'s verdict on the SAME pairs.
 *
 * No dotenv, no service imports, no model calls — this reads and writes the
 * files the other two scripts already produced, same as `compareOutcomes.ts`
 * in `evals/retrieval/`.
 *
 * Sample mode (default):
 *   pnpm --filter @gruenerator/api eval:answer:sample [answers-file.json]
 *
 *   Writes `blind-sample-<date>.md` — 10 pairs of the configured comparison, random A/B,
 *   a blank `winner:` line per case for a human to fill in (A, B, or tie) —
 *   and `blind-sample-<date>.key.json`, the A/B↔variant mapping, NOT printed
 *   in the `.md`.
 *
 * Score mode:
 *   pnpm --filter @gruenerator/api eval:answer:sample -- --score <filled.md>
 *
 *   Reads the filled-in `winner:` lines, joins them with the matching
 *   `.key.json` (same basename) to resolve each to a variant, and with
 *   `judgments-<date>.json` (same date, from `judgeAnswers.ts`) to print
 *   human/judge agreement on the first configured comparison (default
 *   `cut-vs-today`; `EVAL_ANSWER_COMPARISONS` picks another).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  answerKey,
  buildAbMapping,
  resolveComparisons,
  resolveWinner,
  today,
} from './answerEvalCore.js';
import {
  type AbMapping,
  type AnswerRecord,
  type AnswerVariant,
  type JudgeWinner,
  type JudgmentRecord,
} from './answerEvalCore.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLE_SIZE = 10;
// Die Stichprobe folgt dem ersten konfigurierten Vergleich (Default cut-vs-today).
const SAMPLE_COMPARISON = resolveComparisons(process.env)[0];
if (!SAMPLE_COMPARISON) throw new Error('no comparison configured');
const CHALLENGER: AnswerVariant = SAMPLE_COMPARISON.challenger;
const BASELINE: AnswerVariant = SAMPLE_COMPARISON.baseline;

function findLatest(prefix: string, suffix: string): string | null {
  const matches = readdirSync(HERE)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .sort();
  const last = matches.at(-1);
  return last ? join(HERE, last) : null;
}

/** Fisher-Yates on a copy — local to this file, `shuffleVariants` in
 *  `answerEvalCore.ts` is typed to the fixed variant tuple, not a generic
 *  array. */
function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function citationLines(citations: readonly { title: string; url: string | null }[]): string {
  if (citations.length === 0) return '(keine Quellenangaben)';
  return citations
    .map((c, i) => `  [${i + 1}] ${c.title || '(ohne Titel)'}${c.url ? ` — ${c.url}` : ''}`)
    .join('\n');
}

interface SampleKey {
  date: string;
  comparisonId: string;
  mapping: Record<string, AbMapping>;
}

function runSample(answersPath: string): void {
  const answers = JSON.parse(readFileSync(answersPath, 'utf8')) as AnswerRecord[];
  const byKey = new Map(answers.map((r) => [answerKey(r.caseId, r.variant), r]));

  const caseIds = [...new Set(answers.map((r) => r.caseId))].filter(
    (id) => byKey.has(answerKey(id, CHALLENGER)) && byKey.has(answerKey(id, BASELINE))
  );
  const picked = shuffle(Math.random, caseIds).slice(0, SAMPLE_SIZE);
  if (picked.length < SAMPLE_SIZE) {
    console.warn(
      `Only ${picked.length} case(s) have both '${CHALLENGER}' and '${BASELINE}' answers ` +
        `(wanted ${SAMPLE_SIZE}).`
    );
  }

  const date = today();
  const mapping: Record<string, AbMapping> = {};
  const lines: string[] = [
    `# Blind sample — ${date}`,
    '',
    `${CHALLENGER} vs ${BASELINE}, ${picked.length} Fälle.`,
    '',
    'Für jeden Fall A und B lesen, dann in der Zeile "winner:" darunter A, B oder tie eintragen und speichern.',
    'Score anschließend mit: eval:answer:sample -- --score <diese Datei>',
    '',
  ];

  for (const caseId of picked) {
    const a = byKey.get(answerKey(caseId, CHALLENGER));
    const b = byKey.get(answerKey(caseId, BASELINE));
    if (!a || !b) continue;
    const ab = buildAbMapping(CHALLENGER, BASELINE, Math.random());
    mapping[caseId] = ab;
    const sideA = ab.A === CHALLENGER ? a : b;
    const sideB = ab.B === CHALLENGER ? a : b;

    lines.push(
      `## ${caseId}`,
      '',
      `Frage: ${sideA.question}`,
      '',
      '**Antwort A:**',
      sideA.answer || '(keine Antwort)',
      '',
      'Quellen A:',
      citationLines(sideA.citations),
      '',
      '**Antwort B:**',
      sideB.answer || '(keine Antwort)',
      '',
      'Quellen B:',
      citationLines(sideB.citations),
      '',
      'winner: ',
      ''
    );
  }

  const mdPath = join(HERE, `blind-sample-${date}.md`);
  const keyPath = join(HERE, `blind-sample-${date}.key.json`);
  const key: SampleKey = { date, comparisonId: SAMPLE_COMPARISON.id, mapping };

  writeFileSync(mdPath, lines.join('\n'));
  writeFileSync(keyPath, `${JSON.stringify(key, null, 2)}\n`);
  console.log(`Wrote ${mdPath} and ${keyPath}`);
}

/** `## <caseId>` ... `winner: <value>` — the only two lines that round-trip. */
function parseFilledSample(md: string, caseIds: readonly string[]): Map<string, string> {
  // The answers carry their own `## ` headings, so the file cannot be split
  // on `## ` — locate each known case heading and the first `winner:` after it.
  const winners = new Map<string, string>();
  for (const caseId of caseIds) {
    const start = md.indexOf(`\n## ${caseId}\n`);
    if (start < 0) continue;
    const match = md.slice(start).match(/^winner:\s*(.*)$/m);
    winners.set(caseId, (match?.[1] ?? '').trim().toLowerCase());
  }
  return winners;
}

function toJudgeWinner(raw: string): JudgeWinner | null {
  if (raw === 'a') return 'A';
  if (raw === 'b') return 'B';
  if (raw === 'tie') return 'tie';
  return null;
}

function runScore(filledPath: string): void {
  const dateMatch = basename(filledPath).match(/blind-sample-(\d{4}-\d{2}-\d{2})/);
  if (!dateMatch?.[1]) {
    console.error(
      `Cannot read a date out of "${basename(filledPath)}" — expected blind-sample-<date>*.md`
    );
    process.exit(1);
    return;
  }
  const date = dateMatch[1];
  const keyPath = join(HERE, `blind-sample-${date}.key.json`);
  const judgmentsPath = join(HERE, `judgments-${date}.json`);
  if (!existsSync(keyPath)) {
    console.error(`Missing ${keyPath} — the key that was generated alongside this sample.`);
    process.exit(1);
    return;
  }
  if (!existsSync(judgmentsPath)) {
    console.error(`Missing ${judgmentsPath} — run eval:answer:judge for ${date} first.`);
    process.exit(1);
    return;
  }

  const key = JSON.parse(readFileSync(keyPath, 'utf8')) as SampleKey;
  const judgments = JSON.parse(readFileSync(judgmentsPath, 'utf8')) as JudgmentRecord[];
  const judgmentByCase = new Map(
    judgments.filter((j) => j.comparisonId === key.comparisonId).map((j) => [j.caseId, j])
  );

  const humanWinners = parseFilledSample(
    readFileSync(filledPath, 'utf8'),
    Object.keys(key.mapping)
  );

  let agree = 0;
  let scored = 0;
  let blank = 0;
  let noJudgment = 0;

  for (const [caseId, mapping] of Object.entries(key.mapping)) {
    const raw = humanWinners.get(caseId);
    if (raw === undefined || raw === '') {
      blank++;
      continue;
    }
    const parsed = toJudgeWinner(raw);
    if (!parsed) {
      console.warn(`${caseId}: unreadable winner "${raw}" (expected A, B, or tie) — skipped`);
      continue;
    }
    const judgment = judgmentByCase.get(caseId);
    if (!judgment) {
      noJudgment++;
      continue;
    }
    const humanVariant = resolveWinner(mapping, parsed);
    scored++;
    if (humanVariant === judgment.winnerVariant) agree++;
  }

  console.log(`Blind sample: ${date}`);
  console.log(
    `Scored: ${scored}  Agree with judge: ${agree} (${scored === 0 ? '0.0' : ((agree / scored) * 100).toFixed(1)}%)`
  );
  if (blank > 0) console.log(`Blank (no winner filled in): ${blank}`);
  if (noJudgment > 0) console.log(`No matching judgment found: ${noJudgment}`);
}

function main(): void {
  const args = process.argv.slice(2);
  const scoreIdx = args.indexOf('--score');
  if (scoreIdx !== -1) {
    const filledPath = args[scoreIdx + 1];
    if (!filledPath) {
      console.error('Usage: eval:answer:sample -- --score <filled-blind-sample.md>');
      process.exit(1);
      return;
    }
    runScore(filledPath);
    return;
  }

  const argPath = args[0];
  const answersPath = argPath ? join(HERE, argPath) : findLatest('answers-', '.json');
  if (!answersPath || !existsSync(answersPath)) {
    console.error('No answers-<date>.json found. Run eval:answer:generate first.');
    process.exit(1);
    return;
  }
  runSample(answersPath);
}

main();
