/**
 * LLM-judge pass over last-run.json — the subjective tier the deterministic
 * assertions can't cover (groundedness, narration honesty, known-answer
 * contradiction, German quality, long-thread parity). Pure post-pass: never
 * talks to the chat backend, so it can re-run offline on any saved run.
 *
 *   pnpm --filter @gruenerator/api eval:judge
 *
 * Env:
 *   LITELLM_BASE_URL      required (verdigado LiteLLM proxy, no /v1 suffix)
 *   LITELLM_API_KEY       required
 *   EVAL_JUDGE_MODEL      default verdigado-pro (free; avoid verdigado-think — slow)
 *   EVAL_JUDGE_BLOCKING=1 fail the process on judge failures (default: report-only)
 *   EVAL_RUN_FILE         input path (default ./evals/last-run.json)
 *
 * Checks are opt-in per turn via `expect.judge: [...]` in the corpus, with one
 * exception: `narration_consistency` also auto-runs on any turn where an edit
 * event fired or zero tools ran but text was produced — those are exactly the
 * shapes the historical class-5/11 bugs took.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRubricPrompt, type RubricName } from './rubrics.js';

import type { CaseResult, TurnResult } from '../types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_FILE = process.env.EVAL_RUN_FILE ?? join(HERE, '..', 'last-run.json');
const MODEL = process.env.EVAL_JUDGE_MODEL ?? 'verdigado-pro';
const BASE_URL = (process.env.LITELLM_BASE_URL ?? '').replace(/\/$/, '');
const API_KEY = process.env.LITELLM_API_KEY ?? '';
const BLOCKING = process.env.EVAL_JUDGE_BLOCKING === '1';

export interface JudgeVerdict {
  caseId: string;
  turnIndex: number;
  rubric: RubricName;
  /** null = judge unavailable/malformed twice — reported, never failing. */
  pass: boolean | null;
  reason: string;
}

/** Tolerant JSON extraction — models may wrap the verdict in prose/fences. */
export function parseVerdict(content: string): { pass: boolean; reason: string } | null {
  const stripped = content.replace(/```(?:json)?/g, '').trim();
  const candidate = stripped.startsWith('{')
    ? stripped
    : (stripped.match(/\{[\s\S]*\}/)?.[0] ?? '');
  try {
    const parsed = JSON.parse(candidate) as { pass?: unknown; reason?: unknown };
    if (typeof parsed.pass === 'boolean') {
      return { pass: parsed.pass, reason: String(parsed.reason ?? '') };
    }
  } catch {
    // fall through
  }
  return null;
}

async function callJudge(
  system: string,
  user: string
): Promise<{ pass: boolean; reason: string } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const verdict = parseVerdict(json.choices?.[0]?.message?.content ?? '');
      if (verdict) return verdict;
    } catch {
      // retry once, then give up (verdict null)
    }
  }
  return null;
}

/** narration_consistency auto-runs where the historical bug shapes live. */
function autoRubrics(turn: TurnResult): RubricName[] {
  const wantsAuto =
    turn.editorOps ||
    turn.sharepicUpdated ||
    (turn.toolCalls.length === 0 && turn.fullText.length > 200);
  return wantsAuto ? ['narration_consistency'] : [];
}

function rubricsForTurn(turn: TurnResult): RubricName[] {
  const requested = (turn.judge ?? []) as RubricName[];
  return [...new Set([...requested, ...autoRubrics(turn)])];
}

async function main(): Promise<void> {
  if (!BASE_URL || !API_KEY) {
    console.error('LITELLM_BASE_URL / LITELLM_API_KEY not set — judge cannot run.');
    process.exit(1);
  }
  if (!existsSync(RUN_FILE)) {
    console.error(`No run file at ${RUN_FILE} — run eval:chat first.`);
    process.exit(1);
  }

  const results = JSON.parse(readFileSync(RUN_FILE, 'utf8')) as CaseResult[];
  const verdicts: JudgeVerdict[] = [];

  for (const c of results) {
    for (const turn of c.turns ?? []) {
      if (turn.error) continue;
      for (const rubric of rubricsForTurn(turn)) {
        // parity compares against the earliest turn whose answer exists.
        const firstTurn = c.turns.find((t) => t.turnIndex !== turn.turnIndex && t.fullText);
        const prompt = buildRubricPrompt(rubric, turn, {
          ...(turn.judgeFacts ? { facts: turn.judgeFacts } : {}),
          category: c.category,
          ...(firstTurn ? { firstTurn } : {}),
        });
        if (!prompt) continue;
        const verdict = await callJudge(prompt.system, prompt.user);
        verdicts.push({
          caseId: c.id,
          turnIndex: turn.turnIndex,
          rubric,
          pass: verdict?.pass ?? null,
          reason: verdict?.reason ?? 'judge unavailable or malformed output (2 attempts)',
        });
      }
    }
  }

  const failed = verdicts.filter((v) => v.pass === false);
  const nulls = verdicts.filter((v) => v.pass === null);

  console.log(`\n═══ LLM judge — ${verdicts.length} checks (${MODEL}) ═══\n`);
  for (const v of verdicts) {
    const mark = v.pass === true ? '✅' : v.pass === false ? '❌' : '⚪';
    console.log(
      `${mark} ${v.caseId} t${v.turnIndex} ${v.rubric}${v.pass !== true ? ` — ${v.reason}` : ''}`
    );
  }
  console.log(
    `\n${verdicts.length - failed.length - nulls.length}/${verdicts.length} passed · ${failed.length} failed · ${nulls.length} unavailable`
  );

  writeFileSync(
    join(dirname(RUN_FILE), 'judge-verdicts.json'),
    `${JSON.stringify(verdicts, null, 2)}\n`
  );

  if (BLOCKING && failed.length > 0) process.exitCode = 1;
}

void main();
