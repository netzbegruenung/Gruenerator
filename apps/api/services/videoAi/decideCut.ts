/**
 * Stage A of the KI-Schnitt: which units, in which order.
 *
 * Measured 2026-11-10 on synthetic raw takes (spike, section 5): with
 * reasoning, Gemma picked the right takes in every set, including a statement
 * the speaker explicitly withdrew; without reasoning it chose the same units
 * but pushed the introduction behind the content or dropped it. Reasoning is
 * therefore on (8–11 s, 1–3.5k reasoning tokens).
 *
 * The model's answer passes through validateEdl before anyone sees it; a
 * violation goes back verbatim as the repair turn.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type VideoAiEdl, type VideoAiFormat } from '@gruenerator/contracts';
import { z } from 'zod';

import { aiObject } from '../ai/generate.js';

import { renderFootageBrief, type BriefClip } from './footageBrief.js';
import { type TakeGroup } from './takeGroups.js';
import { type TranscriptUnit } from './transcriptUnits.js';
import { validateEdl, type ValidationAsset, type ValidationResult } from './validateEdl.js';

export interface CutBrief {
  /** What the video is about, in the person's words. */
  topic: string;
  format: VideoAiFormat;
  target: { minSeconds: number; maxSeconds: number };
  /** Free notes for the cut ("Vorstellung weglassen, Bauchbinde reicht"). */
  hints: string | null;
  locale: 'de-DE' | 'de-AT';
}

export interface CutInput {
  brief: CutBrief;
  clips: readonly BriefClip[];
  units: ReadonlyMap<string, TranscriptUnit>;
  takes: readonly TakeGroup[];
  assets: readonly ValidationAsset[];
}

export interface CutDecision {
  unitIds: string[];
  /** Unit id → short reason, for the "Rausgeschnitten" list. */
  omitted: Record<string, string>;
  rationale: string;
  validation: Extract<ValidationResult, { ok: true }>;
}

const PROMPT_FILE = path.join(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/video-ai/schnitt.md'
);
let cachedPrompt: string | null = null;

function systemPrompt(locale: CutBrief['locale']): string {
  cachedPrompt ??= readFileSync(PROMPT_FILE, 'utf8');
  if (locale !== 'de-AT') return cachedPrompt;
  return (
    `${cachedPrompt}\n## LÄNDERKONTEXT: ÖSTERREICH\n\n` +
    'Die Person spricht österreichisches Deutsch. Neuansätze klingen oft wie „na, anders“ oder ' +
    '„passt, nochmal“; behandle sie wie jede andere Selbstanweisung.\n'
  );
}

const answerSchema = z.object({
  segmente: z.array(z.string()).min(1),
  ausgelassen: z
    .array(z.object({ id: z.string(), grund: z.string() }))
    .nullish()
    .transform((v) => v ?? []),
  begruendung: z.string().nullish(),
});

/** Loose on purpose: strictness lives in `validate` (see AiObjectCall.schema). */
const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    segmente: {
      type: 'array',
      items: { type: 'string' },
      description: 'Satz-IDs (z. B. "c1.s5") in der Reihenfolge des fertigen Videos',
    },
    ausgelassen: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, grund: { type: 'string' } },
        required: ['id', 'grund'],
      },
    },
    begruendung: { type: 'string', description: 'Höchstens zwei Sätze' },
  },
  required: ['segmente', 'ausgelassen'],
};

export function buildCutPrompt(input: CutInput): string {
  const { brief } = input;
  const footage = renderFootageBrief(input.clips, [...input.units.values()], input.takes);
  return [
    '# Briefing',
    `Thema: ${brief.topic}`,
    `Format: ${brief.format}`,
    `Ziellänge: ${brief.target.minSeconds}–${brief.target.maxSeconds} s`,
    brief.hints ? `Hinweise: ${brief.hints}` : null,
    '',
    '# Rohmaterial',
    footage,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');
}

/** The plan Stage A produces: segments only, everything else is Stage B. */
function cutOnlyEdl(unitIds: readonly string[], format: VideoAiFormat): VideoAiEdl {
  return {
    version: 1,
    format,
    segments: unitIds.map((unitId) => ({ unitId })),
    captions: { enabled: true },
    overlays: [],
  };
}

export async function decideCut(
  input: CutInput,
  signal: AbortSignal | null = null
): Promise<CutDecision> {
  const ctx = {
    units: input.units,
    clips: input.clips,
    assets: input.assets,
    target: input.brief.target,
    briefTexts: [input.brief.topic, input.brief.hints ?? ''],
  };
  const result = await aiObject<z.infer<typeof answerSchema>>({
    lane: 'video_ai_cut',
    system: systemPrompt(input.brief.locale),
    prompt: buildCutPrompt(input),
    toolName: 'schnitt_festlegen',
    toolDescription: 'Legt fest, welche Sätze in welcher Reihenfolge ins fertige Video kommen.',
    schema: TOOL_SCHEMA,
    reasoning: 'medium',
    temperature: 0.2,
    // Reasoning tokens count against the output budget (generate.ts).
    maxOutputTokens: 8000,
    timeoutMs: 120_000,
    ...(signal !== null && { signal }),
    label: 'video_ai_cut',
    validate: (raw) => {
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      const checked = validateEdl(cutOnlyEdl(parsed.data.segmente, input.brief.format), ctx);
      if (!checked.ok) return { ok: false, error: checked.errors.join('\n') };
      return { ok: true, value: parsed.data };
    },
  });

  if (!result.ok) throw result.cause ?? new Error(result.error);
  // Deterministic and cheap: recomputed rather than smuggled out of `validate`.
  const validation = validateEdl(cutOnlyEdl(result.data.segmente, input.brief.format), ctx);
  if (!validation.ok) throw new Error(`video_ai_cut: ${validation.errors.join('; ')}`);
  return {
    unitIds: result.data.segmente,
    omitted: Object.fromEntries(result.data.ausgelassen.map((o) => [o.id, o.grund])),
    rationale: result.data.begruendung ?? '',
    validation,
  };
}
