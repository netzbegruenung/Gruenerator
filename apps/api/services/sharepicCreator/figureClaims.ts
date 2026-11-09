/**
 * Does the source say what a sharepic's figures claim? (#5480)
 *
 * `validateDraft` knows a number came from the brief and, through
 * `unbackedDirections`, that „weniger“ next to it is not invented. It cannot
 * see a rewording: „Kein Unfallschwerpunkt mehr“, „Takt verbessert“, a demand
 * shown as done („50 Bäume gepflanzt“), the wrong payer. A decision model can,
 * in one request for the whole draft (`aiDecide`, one question per text).
 *
 * Measured in `evals/metis/` (sharepicFigureClaim, #5504): 97–100 % on 34
 * cases, 16/16 on a holdout, 48/50 batched; the regex alone 71 %, with no
 * false alarm — so the regex runs first and stays a hard check, this one is
 * the second net. Only texts that carry a figure are asked: a headline's
 * opinion („Radweg jetzt!“) is no claim about the source and would be flagged.
 *
 * Fail-open: a timeout, a rate limit or an unusable answer passes the draft.
 */
import { stripInlineMarks, type SharepicSpec } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import {
  aiDecide,
  DECISION_MAX_QUESTIONS,
  DECISION_MAX_REQUEST_BYTES,
  type ChoiceQuestion,
} from '../ai/decide.js';

import { digits, NUMBER } from './briefFacts.js';
import { textsOf } from './slideTexts.js';

const log = createLogger('sharepicCreator:figureClaims');

/** Below this margin the model is unsure, and an unsure model sends no draft back. */
const FLAG_CONFIDENCE = 0.5;
/** How much source around each figure the model sees. */
const SOURCE_WINDOW = 250;
const TIMEOUT_MS = 1_500;
/** Room the questions and labels take in the request, so the source gets the rest. */
const SOURCE_BUDGET = DECISION_MAX_REQUEST_BYTES - 4_000;

const CRITERIA = {
  gedeckt: 'die Quelle sagt das so oder gleichbedeutend',
  verfaelscht:
    'die Quelle sagt das nicht: Richtung umgedreht (mehr/weniger, gestiegen/gesunken), Forderung als Tatsache, Geplantes als erledigt, anderer Zahler oder erfunden',
};

interface Claim {
  slide: number;
  text: string;
}

function claimsOf(spec: SharepicSpec): Claim[] {
  const seen = new Set<string>();
  return spec.slides.flatMap((slide, s) =>
    textsOf(slide).flatMap((raw) => {
      const text = stripInlineMarks(raw).replace(/\s+/g, ' ').trim();
      if (!text.match(NUMBER) || seen.has(text)) return [];
      seen.add(text);
      return [{ slide: s, text }];
    })
  );
}

/** Whether the draft states a figure at all — without one there is nothing to ask. */
export function hasFigureClaims(spec: SharepicSpec): boolean {
  return claimsOf(spec).length > 0;
}

/**
 * The parts of the source around the claims' figures — the source can be a
 * whole press release plus conversation material, the model takes 12 kB.
 */
function excerptFor(claims: readonly Claim[], source: string): string {
  const wanted = new Set(claims.flatMap((c) => (c.text.match(NUMBER) ?? []).map(digits)));
  const spans: [number, number][] = [];
  for (const m of source.matchAll(NUMBER)) {
    if (!wanted.has(digits(m[0]))) continue;
    const span: [number, number] = [
      Math.max(0, m.index - SOURCE_WINDOW),
      Math.min(source.length, m.index + m[0].length + SOURCE_WINDOW),
    ];
    const last = spans.at(-1);
    if (last && span[0] <= last[1]) last[1] = span[1];
    else spans.push(span);
  }
  const excerpt = spans.map(([from, to]) => source.slice(from, to)).join(' … ');
  return Buffer.byteLength(excerpt) > SOURCE_BUDGET ? '' : excerpt;
}

/**
 * The repair note for every figure text the source contradicts, or null.
 * `source` is what the person gave — the request and its material, not the
 * current draft: a revision's own tile is no evidence for itself.
 */
export async function falsifiedFigureClaims(
  spec: SharepicSpec,
  source: string
): Promise<string | null> {
  const claims = claimsOf(spec).slice(0, DECISION_MAX_QUESTIONS);
  if (!claims.length) return null;
  const excerpt = excerptFor(claims, source);
  if (!excerpt) return null;

  const state = `QUELLE:\n${excerpt}\n\nBEHAUPTUNGEN AUF DEM SHAREPIC:\n${claims
    .map((c, i) => `${i + 1}. ${c.text}`)
    .join('\n')}`;
  const questions = Object.fromEntries(
    claims.map((_, i): [string, ChoiceQuestion] => [
      `b${i + 1}`,
      {
        type: 'choice',
        instructions: `Stimmt BEHAUPTUNG ${i + 1} mit der QUELLE überein?`,
        criteria: CRITERIA,
      },
    ])
  );

  try {
    const answers = await aiDecide({
      label: 'sharepic-claims',
      state,
      questions,
      timeoutMs: TIMEOUT_MS,
    });
    const falsified = claims.filter((_, i) => {
      const a = answers[`b${i + 1}`];
      return a?.choice === 'verfaelscht' && a.confidence >= FLAG_CONFIDENCE;
    });
    if (!falsified.length) return null;
    const multi = spec.slides.length > 1;
    log.info(`falsified: ${falsified.map((c) => `"${c.text}"`).join(', ')}`);
    return falsified
      .map(
        (c) =>
          `${multi ? `Slide ${c.slide + 1}: ` : ''}"${c.text}" sagt etwas anderes als der Auftrag – übernimm, was der Auftrag über diese Zahl sagt (Richtung, gefordert oder erledigt, wer was tut). Nichts dazudichten.`
      )
      .join(' ');
  } catch (error) {
    log.warn(`check skipped: ${(error as Error).message}`);
    return null;
  }
}
