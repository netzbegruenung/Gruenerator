/**
 * A correction round with Gemma: the person's words (and the preview times
 * they pointed at) become ops on the current plan. Ops, not a new plan, so
 * nothing the person did not mention drifts. The result passes applyOps and
 * the same validation as the first cut; a violation goes back as the repair
 * turn. Length is not enforced here — in a correction the person decides.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { videoAiOpSchema, type VideoAiEdl, type VideoAiOp } from '@gruenerator/contracts';
import { z } from 'zod';

import { aiObject } from '../ai/generate.js';

import { applyOps } from './applyOps.js';
import { checkDesign } from './decideDesign.js';
import { type PlanContext } from './projectContext.js';
import { type StoredVideoAiVersion } from './projectTypes.js';
import { outputToSource, type Timeline } from './timeline.js';
import { validateEdl, type ValidationContext } from './validateEdl.js';

const PROMPT_FILE = path.join(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/video-ai/korrektur.md'
);
let cachedPrompt: string | null = null;

export const REVISED_REASON = 'In der Korrektur entfernt';

export interface ReviseInput {
  current: StoredVideoAiVersion;
  /** The current plan compiled; segment times and texts for the prompt. */
  timeline: Timeline;
  ctx: PlanContext;
  validation: ValidationContext;
  feedback: string;
  times: readonly number[];
  locale: 'de-DE' | 'de-AT';
}

export interface Revision {
  edl: VideoAiEdl;
  omitted: Record<string, string>;
  summary: string;
  reply: string;
  /** False when the round found nothing to change; then no version is stored. */
  changed: boolean;
}

const answerSchema = z.object({
  ops: z.array(z.unknown()).max(20),
  zusammenfassung: z.string().min(1),
  antwort: z.string().min(1),
});
type Answer = z.infer<typeof answerSchema>;

/** Loose on purpose: the strict op shapes live in `validate`. */
const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: videoAiOpSchema.options.map((o) => o.shape.kind.value),
          },
          unitId: { type: 'string', description: 'Satz-ID wie c1.s12' },
          before: { type: ['string', 'null'], description: 'move_segment: Satz-ID oder null' },
          withUnitId: { type: 'string', description: 'swap_take: der andere Anlauf' },
          framing: { type: 'string', enum: ['links', 'mitte', 'rechts'] },
          zoom: { type: 'string', enum: ['normal', 'nah'] },
          index: { type: 'integer', description: 'Nummer der Einblendung' },
          overlay: {
            type: 'object',
            description:
              'Die vollständige Einblendung wie in der Liste, immer mit "kind". Beim Ändern das ' +
              'Objekt aus der Liste übernehmen und nur die Felder ändern.',
            properties: {
              kind: { type: 'string', enum: ['titel', 'bauchbinde', 'asset', 'broll', 'logo'] },
              preset: { type: 'string', enum: ['hook', 'statement'] },
              text: { type: 'string' },
              atSegment: { type: 'integer' },
              durationSeconds: { type: 'number' },
              assetId: { type: 'string' },
              layout: { type: 'string', enum: ['vollbild', 'bild-im-bild', 'sticker'] },
              clipId: { type: 'string' },
              sourceStart: { type: 'number' },
              placement: { type: 'string', enum: ['ecke', 'abspann'] },
            },
            required: ['kind'],
          },
          enabled: { type: 'boolean' },
          template: { type: 'string' },
          music: {
            type: ['object', 'null'],
            properties: { assetId: { type: 'string' }, volume: { type: 'string' } },
          },
        },
        required: ['kind'],
      },
    },
    zusammenfassung: { type: 'string' },
    antwort: { type: 'string' },
  },
  required: ['ops', 'zusammenfassung', 'antwort'],
};

function segmentText(timeline: Timeline, index: number): string {
  return timeline.words
    .filter((w) => w.segmentIndex === index)
    .map((w) => w.word)
    .join(' ');
}

export function buildRevisePrompt(input: ReviseInput): string {
  const { current, timeline, ctx } = input;
  const edl = current.edl;
  const lines = [`# Aktueller Schnitt (${timeline.duration.toFixed(1)} s)`];
  edl.segments.forEach((s, i) => {
    const pieces = timeline.pieces.filter((p) => p.segmentIndex === i);
    const from = pieces[0]?.outStart ?? 0;
    const to = pieces.at(-1)?.outEnd ?? from;
    lines.push(
      `#${i} ${s.unitId} [${from.toFixed(1)}–${to.toFixed(1)} s] „${segmentText(timeline, i)}“` +
        ` (Ausschnitt ${s.framing ?? 'mitte'}, Zoom ${s.zoom ?? 'normal'})`
    );
  });

  lines.push('', '# Einblendungen');
  if (edl.overlays.length === 0) lines.push('Keine.');
  edl.overlays.forEach((o, i) => lines.push(`[${i}] ${JSON.stringify(o)}`));
  lines.push(
    `Untertitel: ${edl.captions.enabled ? (edl.captions.template ?? 'tanne') : 'aus'}`,
    `Musik: ${edl.music ? `${edl.music.assetId} (${edl.music.volume})` : 'keine'}`
  );

  lines.push('', '# Rausgeschnitten');
  const omitted = Object.entries(current.omitted);
  if (omitted.length === 0) lines.push('Nichts.');
  for (const [id, reason] of omitted) {
    lines.push(`${id} „${ctx.units.get(id)?.text ?? ''}“ – ${reason}`);
  }
  if (ctx.cutInput.takes.length > 0) {
    lines.push('', '# Anläufe derselben Aussage');
    for (const t of ctx.cutInput.takes) lines.push(t.unitIds.join(', '));
  }

  lines.push('', '# Material');
  const material = [
    ...ctx.designBase.assets.map(
      (a) =>
        `${a.id}: ${a.kind === 'audio' ? 'Musik' : a.kind === 'logo' ? 'Logo' : 'Bild'} „${a.label}“` +
        (a.description ? ` – ${a.description}` : '')
    ),
    ...ctx.designBase.clips
      .filter((c) => c.role === 'broll')
      .map(
        (c) => `${c.id}: B-Roll, ${c.duration.toFixed(1)} s – ${c.summary || 'ohne Beschreibung'}`
      ),
  ];
  lines.push(...(material.length > 0 ? material : ['Keins.']));

  if (input.times.length > 0) {
    lines.push('', '# Die Person zeigt auf');
    for (const t of input.times) {
      const hit = outputToSource(timeline, t);
      lines.push(
        hit
          ? `${t.toFixed(1)} s → #${hit.piece.segmentIndex} ${hit.piece.unitId} „${segmentText(timeline, hit.piece.segmentIndex)}“`
          : `${t.toFixed(1)} s → hinter dem Ende`
      );
    }
  }
  lines.push('', '# Wunsch', input.feedback);
  return lines.join('\n');
}

function systemPrompt(locale: ReviseInput['locale']): string {
  cachedPrompt ??= readFileSync(PROMPT_FILE, 'utf8');
  if (locale !== 'de-AT') return cachedPrompt;
  return `${cachedPrompt}\n## LÄNDERKONTEXT: ÖSTERREICH\n\nDie Person schreibt österreichisches Deutsch; antworte ebenso.\n`;
}

type Checked = { ok: true; revision: Revision } | { ok: false; error: string };

export function checkRevision(answer: Answer, input: ReviseInput): Checked {
  const ops: VideoAiOp[] = [];
  const errors: string[] = [];
  answer.ops.forEach((raw, i) => {
    const parsed = videoAiOpSchema.safeParse(raw);
    if (parsed.success) ops.push(parsed.data);
    else
      errors.push(
        `Änderung ${i + 1} (${JSON.stringify(raw)}): ` +
          parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ') +
          (parsed.error.issues.some((x) => x.path[0] === 'overlay')
            ? '. Gib die Einblendung vollständig an, mit "kind" und allen Feldern wie in der Liste.'
            : '')
      );
  });
  if (errors.length > 0) return { ok: false, error: errors.join('\n') };

  const applied = applyOps(input.current.edl, ops, {
    units: input.ctx.units,
    omitted: input.current.omitted,
    removedReason: REVISED_REASON,
  });
  if (!applied.ok) return { ok: false, error: applied.error };
  const problems = [
    ...checkDesign(applied.edl, input.ctx.designBase),
    ...(() => {
      const v = validateEdl(applied.edl, input.validation);
      return v.ok ? [] : v.errors;
    })(),
  ];
  if (problems.length > 0) return { ok: false, error: problems.join('\n') };
  return {
    ok: true,
    revision: {
      edl: applied.edl,
      omitted: applied.omitted,
      summary: answer.zusammenfassung.trim().slice(0, 80),
      reply: answer.antwort.trim(),
      changed: ops.length > 0,
    },
  };
}

export async function reviseEdl(input: ReviseInput): Promise<Revision> {
  const result = await aiObject<Answer>({
    lane: 'video_ai_revise',
    system: systemPrompt(input.locale),
    prompt: buildRevisePrompt(input),
    toolName: 'schnitt_aendern',
    toolDescription: 'Ändert den bestehenden Schnitt so wenig wie möglich.',
    schema: TOOL_SCHEMA,
    reasoning: 'medium',
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 90_000,
    label: 'video_ai_revise',
    validate: (raw) => {
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      const checked = checkRevision(parsed.data, input);
      return checked.ok ? { ok: true, value: parsed.data } : checked;
    },
  });
  if (!result.ok) throw result.cause ?? new Error(result.error);
  const final = checkRevision(result.data, input);
  if (!final.ok) throw new Error(`video_ai_revise: ${final.error}`);
  return final.revision;
}
