/**
 * Blind pairwise judge for the reranker answer-eval.
 *
 *   pnpm --filter @gruenerator/api eval:answer:judge [answers-file.json]
 *
 * Reads an `answers-<date>.json` from `generateAnswers.ts` (the newest one in
 * this directory by default), and for every case runs the two comparisons in
 * `COMPARISONS` (`filter vs today`, `filter vs none`): both answers go to the
 * judge as A/B in a randomised order (mapping recorded, never shown to the
 * judge), together with their citation lists and a German rubric. The judge
 * never sees which variant produced which side.
 *
 * The judge is `aiObject` pinned to `{ provider: 'mistral', model:
 * 'mistral-medium-2604' }` (`AiCall.pinned` in `services/ai/generate.ts`) —
 * a fixed target rather than the routing table, so the judge's own answer
 * quality does not move if `AI_LANES` changes later.
 *
 * Writes `judgments-<date>.json` (one `JudgmentRecord` per case×comparison)
 * and `answer-eval-<date>.md` (win rates with ties, mean judge scores per
 * variant, the cases where `filter` lost with the rationale, and near-topic
 * cases reported separately — they are not part of any win rate).
 *
 * Resumable like `generateAnswers.ts`: a case×comparison already present in
 * today's `judgments-<date>.json` is not re-judged — a judge call is a real
 * model turn and losing an in-progress run's judgments to a crash would mean
 * re-spending all of them.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

dotenv.config();

const { aiObject } = await import('../../services/ai/generate.js');

import { ANSWER_CASES, type AnswerCase, type AnswerCaseGroup } from './answerCases.js';
import {
  COMPARISONS,
  buildAbMapping,
  judgeJsonSchema,
  judgeResultSchema,
  mean,
  resolveWinner,
  tally,
  today,
  answerKey,
  type AbMapping,
  type AnswerCitation,
  type AnswerRecord,
  type AnswerVariant,
  type JudgeResult,
  type JudgmentRecord,
} from './answerEvalCore.js';

import type { StructuredValidation } from '../../services/ai/structuredParsing.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function findLatest(prefix: string, suffix: string): string | null {
  const matches = readdirSync(HERE)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .sort();
  const last = matches.at(-1);
  return last ? join(HERE, last) : null;
}

function validateJudgeResult(input: unknown): StructuredValidation<JudgeResult> {
  const parsed = judgeResultSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, error: issues.join('; ') };
}

function citationLines(label: string, citations: readonly AnswerCitation[]): string {
  if (citations.length === 0) return `${label}: (keine Quellenangaben)`;
  const lines = citations.map(
    (c, i) => `  [${i + 1}] ${c.title || '(ohne Titel)'}${c.url ? ` — ${c.url}` : ''}`
  );
  return `${label}:\n${lines.join('\n')}`;
}

function buildJudgePrompt(
  question: string,
  a: Pick<AnswerRecord, 'answer' | 'citations'>,
  b: Pick<AnswerRecord, 'answer' | 'citations'>
): string {
  return [
    'Frage:',
    question,
    '',
    'Antwort A:',
    a.answer || '(keine Antwort)',
    '',
    citationLines('Quellen A', a.citations),
    '',
    'Antwort B:',
    b.answer || '(keine Antwort)',
    '',
    citationLines('Quellen B', b.citations),
    '',
    'Bewerte NUR anhand von Frage, den beiden Antworten und ihren Quellenangaben.',
    'Du weißt nicht, welches Verfahren A oder B erzeugt hat — bewerte allein das Ergebnis.',
    '',
    'Kriterien:',
    '- answersQuestion (0-3 je Antwort): Wie direkt und vollständig beantwortet sie die Frage?',
    '- groundedInSources (0-3 je Antwort): Wie gut stützen die genannten Quellen die Aussagen?',
    '- inventedSource (je Antwort, ja/nein): Erfindet die Antwort eine Quelle oder eine Aussage, die die Quellen nicht hergeben?',
    '- missingImportant (je Antwort, ja/nein): Fehlt ein wichtiger Aspekt, den die Quellen hergegeben hätten?',
    '- winner: "A", "B" oder "tie" — insgesamt bessere Antwort.',
    '- rationale: kurze Begründung auf Deutsch (1-3 Sätze).',
  ].join('\n');
}

const JUDGE_SYSTEM =
  'Du bist ein strenger, neutraler Gutachter für Antworten eines Notebook-Assistenten, ' +
  'der über Parteidokumente antwortet (RAG). Du kennst nur die Frage, zwei Antworten und ' +
  'ihre Quellenangaben — nicht, welches technische Verfahren sie erzeugt hat.';

async function judgeOne(
  question: string,
  a: Pick<AnswerRecord, 'answer' | 'citations'>,
  b: Pick<AnswerRecord, 'answer' | 'citations'>
): Promise<JudgeResult | null> {
  const result = await aiObject({
    lane: 'notebook_answer_eval_judge',
    pinned: { provider: 'mistral', model: 'mistral-medium-2604' },
    system: JUDGE_SYSTEM,
    prompt: buildJudgePrompt(question, a, b),
    temperature: 0.1,
    schema: judgeJsonSchema,
    toolName: 'submit_judgment',
    toolDescription: 'Gibt das strukturierte Urteil über die beiden Antworten zurück.',
    validate: validateJudgeResult,
    label: 'answer-eval-judge',
  });
  if (!result.ok) {
    console.error(`judge call failed: ${result.error}`);
    return null;
  }
  return result.data;
}

function loadJudgments(path: string): JudgmentRecord[] {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JudgmentRecord[];
  } catch {
    return [];
  }
}

function persistJudgments(path: string, records: readonly JudgmentRecord[]): void {
  writeFileSync(path, `${JSON.stringify(records, null, 2)}\n`);
}

interface VariantStats {
  answersQuestion: number[];
  groundedInSources: number[];
  invented: number;
  missing: number;
}

function collectVariantStats(
  judgments: readonly JudgmentRecord[],
  caseGroup: ReadonlyMap<string, AnswerCaseGroup>
): Map<AnswerVariant, VariantStats> {
  const stats = new Map<AnswerVariant, VariantStats>();
  const bucket = (v: AnswerVariant): VariantStats => {
    let s = stats.get(v);
    if (!s) {
      s = { answersQuestion: [], groundedInSources: [], invented: 0, missing: 0 };
      stats.set(v, s);
    }
    return s;
  };
  for (const j of judgments) {
    if (caseGroup.get(j.caseId) === 'near-topic') continue;
    for (const side of ['A', 'B'] as const) {
      const s = bucket(j.mapping[side]);
      s.answersQuestion.push(j.result.answersQuestion[side]);
      s.groundedInSources.push(j.result.groundedInSources[side]);
      if (j.result.inventedSource[side]) s.invented++;
      if (j.result.missingImportant[side]) s.missing++;
    }
  }
  return stats;
}

function renderReport(
  answersPath: string,
  cases: readonly AnswerCase[],
  judgments: readonly JudgmentRecord[]
): string {
  const caseGroup = new Map(cases.map((c) => [c.id, c.group]));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const lines: string[] = [];

  lines.push(`# Answer eval — ${today()}`, '', `Input: ${answersPath}`, '');

  lines.push('## Gewinnraten (notebook + qa, Unentschieden zählen im Nenner)', '');
  for (const comparison of COMPARISONS) {
    const winners = judgments
      .filter((j) => j.comparisonId === comparison.id && caseGroup.get(j.caseId) !== 'near-topic')
      .map((j) => j.winnerVariant);
    const t = tally(winners, comparison.challenger);
    lines.push(
      `### ${comparison.challenger} vs ${comparison.baseline}`,
      `n=${t.n}  ${comparison.challenger}: ${t.wins} (${(t.winRate * 100).toFixed(1)}%)  ` +
        `tie: ${t.ties} (${(t.tieRate * 100).toFixed(1)}%)  ` +
        `${comparison.baseline}: ${t.losses} (${(t.lossRate * 100).toFixed(1)}%)`,
      ''
    );
  }

  lines.push('## Mittlere Richterwerte je Variante (notebook + qa)', '');
  lines.push(
    '| Variante | n | beantwortet (0-3) | belegt (0-3) | erfundene Quelle | fehlt Wichtiges |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- |');
  const stats = collectVariantStats(judgments, caseGroup);
  for (const [variant, s] of stats) {
    const n = s.answersQuestion.length;
    lines.push(
      `| ${variant} | ${n} | ${mean(s.answersQuestion).toFixed(2)} | ${mean(s.groundedInSources).toFixed(2)} | ` +
        `${n === 0 ? '0.0' : ((s.invented / n) * 100).toFixed(1)}% | ` +
        `${n === 0 ? '0.0' : ((s.missing / n) * 100).toFixed(1)}% |`
    );
  }
  lines.push('');

  lines.push('## Fälle, in denen `filter` verloren hat', '');
  for (const comparison of COMPARISONS) {
    const losses = judgments.filter(
      (j) =>
        j.comparisonId === comparison.id &&
        j.challenger === 'filter' &&
        j.winnerVariant === j.baseline &&
        caseGroup.get(j.caseId) !== 'near-topic'
    );
    lines.push(`### filter vs ${comparison.baseline}`, '');
    if (losses.length === 0) {
      lines.push('(keine)', '');
      continue;
    }
    for (const j of losses) {
      const c = caseById.get(j.caseId);
      lines.push(`- **${j.caseId}** — ${c?.question ?? '?'}`, `  - ${j.result.rationale}`);
    }
    lines.push('');
  }

  lines.push(
    '## Near-topic (nicht in den Gewinnraten — die richtige Antwort ist "dazu steht im Notebook wenig")',
    ''
  );
  const nearTopicJudgments = judgments.filter((j) => caseGroup.get(j.caseId) === 'near-topic');
  if (nearTopicJudgments.length === 0) {
    lines.push('(keine)', '');
  } else {
    for (const j of nearTopicJudgments) {
      const c = caseById.get(j.caseId);
      lines.push(
        `- **${j.caseId}** (${j.challenger} vs ${j.baseline}) — ${c?.question ?? '?'}`,
        `  - Gewinner: ${j.winnerVariant}. ${j.result.rationale}`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const argPath = process.argv[2];
  const answersPath = argPath ? join(HERE, argPath) : findLatest('answers-', '.json');
  if (!answersPath || !existsSync(answersPath)) {
    console.error('No answers-<date>.json found. Run eval:answer:generate first.');
    process.exit(1);
    return;
  }

  const answers = JSON.parse(readFileSync(answersPath, 'utf8')) as AnswerRecord[];
  const byKey = new Map(answers.map((r) => [answerKey(r.caseId, r.variant), r]));

  const judgmentsPath = join(HERE, `judgments-${today()}.json`);
  const existing = loadJudgments(judgmentsPath);
  const alreadyJudged = new Set(existing.map((j) => `${j.caseId}::${j.comparisonId}`));

  const results: JudgmentRecord[] = [...existing];
  let done = 0;
  let skippedMissing = 0;

  for (const c of ANSWER_CASES) {
    for (const comparison of COMPARISONS) {
      if (alreadyJudged.has(`${c.id}::${comparison.id}`)) continue;

      const challengerRecord = byKey.get(answerKey(c.id, comparison.challenger));
      const baselineRecord = byKey.get(answerKey(c.id, comparison.baseline));
      if (!challengerRecord || !baselineRecord) {
        skippedMissing++;
        continue;
      }

      const mapping: AbMapping = buildAbMapping(
        comparison.challenger,
        comparison.baseline,
        Math.random()
      );
      const sideA = mapping.A === comparison.challenger ? challengerRecord : baselineRecord;
      const sideB = mapping.B === comparison.challenger ? challengerRecord : baselineRecord;

      const judgeResult = await judgeOne(c.question, sideA, sideB);
      if (!judgeResult) continue;

      const record: JudgmentRecord = {
        caseId: c.id,
        comparisonId: comparison.id,
        challenger: comparison.challenger,
        baseline: comparison.baseline,
        mapping,
        winnerVariant: resolveWinner(mapping, judgeResult.winner),
        result: judgeResult,
      };
      results.push(record);
      done++;
      persistJudgments(judgmentsPath, results);
      console.log(`[${done}] ${c.id} :: ${comparison.id} → ${record.winnerVariant}`);
    }
  }

  if (skippedMissing > 0) {
    console.warn(
      `${skippedMissing} case×comparison pair(s) had no answer on one side — ` +
        `run eval:answer:generate to completion first.`
    );
  }

  const reportPath = join(HERE, `answer-eval-${today()}.md`);
  writeFileSync(reportPath, renderReport(answersPath, ANSWER_CASES, results));
  console.log(`Done. Wrote ${judgmentsPath} and ${reportPath}`);
}

main().catch((error) => {
  console.error('judgeAnswers failed:', error);
  process.exit(1);
});
