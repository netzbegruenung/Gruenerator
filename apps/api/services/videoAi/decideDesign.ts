/**
 * Stage B of the KI-Schnitt: what is shown and heard on top of the cut.
 *
 * The model decides only what needs taste: caption look, the words of the
 * titles, where pictures and b-roll go, logo, music. What follows from the
 * footage is computed instead:
 *   - framing per segment from the contact sheets (framing.ts);
 *   - punch-in zooms on every second jump cut, style "dynamisch" only.
 *
 * Both gates run on the answer: the design rules from the prompt (checkDesign)
 * and the meaning rules of validateEdl. A violation is the repair turn.
 */
import { readFileSync } from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  videoAiCaptionTemplateSchema,
  videoAiOverlaySchema,
  type VideoAiEdl,
  type VideoAiFraming,
  type VideoAiOverlay,
  type VideoAiSegment,
  type VideoAiStyle,
} from '@gruenerator/contracts';
import { z } from 'zod';

import { aiObject } from '../ai/generate.js';

import { type CutBrief, type CutDecision } from './decideCut.js';
import { type Timeline } from './timeline.js';
import { normalizeToken, type TranscriptUnit } from './transcriptUnits.js';
import {
  validateEdl,
  type ValidationAsset,
  type ValidationClip,
  type ValidationResult,
} from './validateEdl.js';

export interface DesignAsset extends ValidationAsset {
  /** What the person called it, or the file name. */
  label: string;
  /** Vision description for images; null for audio. */
  description: string | null;
  durationSeconds: number | null;
}

export interface DesignClip extends ValidationClip {
  /** One line from the contact sheets, for b-roll. */
  summary: string;
}

export interface DesignInput {
  brief: CutBrief & {
    style: VideoAiStyle;
    /** For the lower third; null hides it. */
    person: { name: string; role: string | null } | null;
  };
  cut: CutDecision;
  units: ReadonlyMap<string, TranscriptUnit>;
  clips: readonly DesignClip[];
  assets: readonly DesignAsset[];
  framing: ReadonlyMap<string, VideoAiFraming | null>;
  /** The footage already carries captions; ours would sit on top of them. */
  burnedInCaptions: boolean;
}

export const MAX_TITLES = 2;

const PROMPT_DIR = path.join(dirname(fileURLToPath(import.meta.url)), '../../prompts/video-ai');
const prompts = new Map<string, string>();
function promptFile(file: string): string {
  let text = prompts.get(file);
  if (text === undefined) {
    text = readFileSync(path.join(PROMPT_DIR, file), 'utf8');
    prompts.set(file, text);
  }
  return text;
}

/** Punch-in on every second jump cut (same clip back to back), dynamic style only. */
export function segmentsFor(
  unitIds: readonly string[],
  units: ReadonlyMap<string, TranscriptUnit>,
  framing: ReadonlyMap<string, VideoAiFraming | null>,
  style: VideoAiStyle
): VideoAiSegment[] {
  let punched = false;
  return unitIds.map((unitId, i) => {
    const clip = units.get(unitId)?.clipId;
    const jumpCut = i > 0 && clip !== undefined && clip === units.get(unitIds[i - 1])?.clipId;
    punched = style === 'talking-head-dynamisch' && jumpCut ? !punched : false;
    return { unitId, framing: framing.get(unitId) ?? null, zoom: punched ? 'nah' : 'normal' };
  });
}

/**
 * One list per kind, every field of a kind required. The first version had a
 * single overlay object with all fields optional, and Gemma left out
 * `atSegment`, `durationSeconds` and `assetId` on every overlay, twice in a
 * row (10.11.2026). Missing seconds fall back to DEFAULT_SECONDS.
 */
const stueck = z.number().int();
const sekunden = z.number().nullish();
const answerSchema = z.object({
  untertitel: z.string(),
  titel: z
    .array(z.object({ art: z.enum(['hook', 'statement']), text: z.string(), stueck, sekunden }))
    .nullish(),
  bilder: z
    .array(
      z.object({
        id: z.string(),
        darstellung: z.enum(['vollbild', 'bild-im-bild', 'sticker']),
        stueck,
        sekunden,
      })
    )
    .nullish(),
  broll: z
    .array(z.object({ clip: z.string(), ab_sekunde: z.number(), stueck, sekunden }))
    .nullish(),
  logo: z.enum(['ecke', 'abspann', 'keins']).nullish(),
  musik: z.object({ id: z.string(), lautstaerke: z.enum(['leise', 'mittel']) }).nullish(),
});
type Answer = z.infer<typeof answerSchema>;

export const DEFAULT_SECONDS = { titel: 3, bauchbinde: 4, bild: 3, broll: 2.5 } as const;

const STUECK = { type: 'integer', description: 'Nummer des Stücks (#) in der Zeitleiste' };
const SEKUNDEN = { type: 'number', description: 'Wie lange sichtbar' };
const TOOL_SCHEMA = {
  type: 'object',
  properties: {
    untertitel: {
      type: 'string',
      description: `Eine Vorlage (${videoAiCaptionTemplateSchema.options.join(', ')}) oder "aus"`,
    },
    titel: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          art: { type: 'string', enum: ['hook', 'statement'] },
          text: { type: 'string', description: 'Höchstens sechs Wörter' },
          stueck: STUECK,
          sekunden: SEKUNDEN,
        },
        required: ['art', 'text', 'stueck', 'sekunden'],
      },
    },
    bilder: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID aus "Material", z. B. a1' },
          darstellung: { type: 'string', enum: ['vollbild', 'bild-im-bild', 'sticker'] },
          stueck: STUECK,
          sekunden: SEKUNDEN,
        },
        required: ['id', 'darstellung', 'stueck', 'sekunden'],
      },
    },
    broll: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          clip: { type: 'string', description: 'B-Roll-Clip, z. B. c2' },
          ab_sekunde: { type: 'number', description: 'Startsekunde im B-Roll-Clip' },
          stueck: STUECK,
          sekunden: SEKUNDEN,
        },
        required: ['clip', 'ab_sekunde', 'stueck', 'sekunden'],
      },
    },
    logo: { type: 'string', enum: ['ecke', 'abspann', 'keins'] },
    musik: {
      type: 'object',
      description: 'Nur wenn Musik hochgeladen ist, sonst weglassen',
      properties: {
        id: { type: 'string' },
        lautstaerke: { type: 'string', enum: ['leise', 'mittel'] },
      },
      required: ['id', 'lautstaerke'],
    },
  },
  required: ['untertitel', 'titel', 'bilder', 'broll', 'logo'],
};

/**
 * Where the lower third goes: the segment in which the person says their
 * surname, else the second segment (right after the hook). Gemma left it out
 * in three of three runs although the briefing named the person (10.11.2026);
 * it is a rule, not a matter of taste.
 */
export function lowerThirdSegment(
  unitIds: readonly string[],
  units: ReadonlyMap<string, TranscriptUnit>,
  name: string
): number {
  const surname = normalizeToken(name.trim().split(/\s+/).at(-1) ?? '');
  const said = unitIds.findIndex((id) =>
    (units.get(id)?.words ?? []).some((w) => surname !== '' && normalizeToken(w.word) === surname)
  );
  if (said >= 0) return said;
  return Math.min(1, unitIds.length - 1);
}

/** The model's lists, in the EDL's overlay shape. */
export function overlaysFrom(answer: Answer): unknown[] {
  return [
    ...(answer.titel ?? []).map((t) => ({
      kind: 'titel',
      preset: t.art,
      text: t.text,
      atSegment: t.stueck,
      durationSeconds: t.sekunden ?? DEFAULT_SECONDS.titel,
    })),
    ...(answer.bilder ?? []).map((b) => ({
      kind: 'asset',
      assetId: b.id,
      layout: b.darstellung,
      atSegment: b.stueck,
      durationSeconds: b.sekunden ?? DEFAULT_SECONDS.bild,
    })),
    ...(answer.broll ?? []).map((b) => ({
      kind: 'broll',
      clipId: b.clip,
      sourceStart: b.ab_sekunde,
      atSegment: b.stueck,
      durationSeconds: b.sekunden ?? DEFAULT_SECONDS.broll,
    })),
    ...(answer.logo && answer.logo !== 'keins' ? [{ kind: 'logo', placement: answer.logo }] : []),
  ];
}

function segmentText(timeline: Timeline, index: number): string {
  return timeline.words
    .filter((w) => w.segmentIndex === index)
    .map((w) => w.word)
    .join(' ');
}

export function buildDesignPrompt(input: DesignInput): string {
  const { brief, cut } = input;
  const timeline = cut.validation.timeline;
  const lines = [
    '# Briefing',
    brief.topic ? `Thema: ${brief.topic}` : null,
    `Format: ${brief.format}`,
    brief.person
      ? `Person: ${brief.person.name}${brief.person.role ? `, ${brief.person.role}` : ''} (Bauchbinde setzt die Technik)`
      : null,
    brief.hints ? `Hinweise: ${brief.hints}` : null,
    input.burnedInCaptions ? 'Das Material hat schon eingebrannte Untertitel.' : null,
    '',
    '# Zeitleiste',
  ];
  timeline.pieces.forEach((p, i, all) => {
    if (all.findIndex((q) => q.segmentIndex === p.segmentIndex) !== i) return;
    const last = all.filter((q) => q.segmentIndex === p.segmentIndex).at(-1) ?? p;
    lines.push(
      `#${p.segmentIndex} [${p.outStart.toFixed(1)}–${last.outEnd.toFixed(1)} s] „${segmentText(timeline, p.segmentIndex)}“`
    );
  });
  lines.push(`Gesamtlänge: ${timeline.duration.toFixed(1)} s`, '', '# Material');

  const images = input.assets.filter((a) => a.kind !== 'audio');
  const music = input.assets.filter((a) => a.kind === 'audio');
  const broll = input.clips.filter((c) => c.role === 'broll');
  if (images.length + music.length + broll.length === 0) lines.push('Keins.');
  for (const a of images) {
    lines.push(
      `${a.id}: ${a.kind === 'logo' ? 'Logo' : 'Bild'} „${a.label}“ – ${a.description ?? 'ohne Beschreibung'}`
    );
  }
  for (const c of broll)
    lines.push(`${c.id}: B-Roll, ${c.duration.toFixed(1)} s – ${c.summary || 'ohne Beschreibung'}`);
  for (const m of music) {
    lines.push(
      `${m.id}: Musik „${m.label}“${m.durationSeconds ? `, ${Math.round(m.durationSeconds)} s` : ''}`
    );
  }
  return lines.filter((l): l is string => l !== null).join('\n');
}

/** The prompt's design rules, enforced. German: they go back as the repair turn. */
export function checkDesign(
  edl: VideoAiEdl,
  input: Pick<DesignInput, 'burnedInCaptions'>
): string[] {
  const errors: string[] = [];
  const titles = edl.overlays.filter((o) => o.kind === 'titel').length;
  if (titles > MAX_TITLES) errors.push(`Höchstens ${MAX_TITLES} Titel, nicht ${titles}.`);
  for (const o of edl.overlays) {
    const coversHook =
      'atSegment' in o &&
      o.atSegment === 0 &&
      (o.kind === 'broll' || (o.kind === 'asset' && o.layout === 'vollbild'));
    if (coversHook) errors.push('Im Stück #0 (Hook) kein Vollbild und keine B-Roll.');
  }
  if (input.burnedInCaptions && edl.captions.enabled) {
    errors.push('Untertitel "aus": Das Material hat schon eingebrannte Untertitel.');
  }
  return errors;
}

function toEdl(
  answer: Answer,
  input: DesignInput
): { ok: true; edl: VideoAiEdl } | { ok: false; error: string } {
  const errors: string[] = [];
  let template: VideoAiEdl['captions']['template'] = null;
  if (answer.untertitel !== 'aus') {
    const parsed = videoAiCaptionTemplateSchema.safeParse(answer.untertitel);
    if (parsed.success) template = parsed.data;
    else errors.push(`Untertitel "${answer.untertitel}" gibt es nicht.`);
  }
  const overlays: VideoAiOverlay[] = [];
  overlaysFrom(answer).forEach((raw, i) => {
    const parsed = videoAiOverlaySchema.safeParse(raw);
    if (parsed.success) overlays.push(parsed.data);
    else
      errors.push(
        `Overlay ${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`
      );
  });
  if (errors.length > 0) return { ok: false, error: errors.join('\n') };
  return {
    ok: true,
    edl: {
      version: 1,
      format: input.brief.format,
      segments: segmentsFor(input.cut.unitIds, input.units, input.framing, input.brief.style),
      captions: { enabled: answer.untertitel !== 'aus', template },
      overlays: input.brief.person
        ? [
            ...overlays,
            {
              kind: 'bauchbinde',
              atSegment: lowerThirdSegment(input.cut.unitIds, input.units, input.brief.person.name),
              durationSeconds: DEFAULT_SECONDS.bauchbinde,
            },
          ]
        : overlays,
      music: answer.musik ? { assetId: answer.musik.id, volume: answer.musik.lautstaerke } : null,
    },
  };
}

export interface DesignDecision {
  edl: VideoAiEdl;
  validation: Extract<ValidationResult, { ok: true }>;
}

export async function decideDesign(
  input: DesignInput,
  signal: AbortSignal | null = null
): Promise<DesignDecision> {
  const ctx = {
    units: input.units,
    clips: input.clips,
    assets: input.assets,
    target: input.brief.target ?? null,
    briefTexts: [input.brief.topic ?? '', input.brief.hints ?? ''],
  };
  const check = (answer: Answer) => {
    const built = toEdl(answer, input);
    if (!built.ok) return built;
    const errors = [...checkDesign(built.edl, input)];
    const validation = validateEdl(built.edl, ctx);
    if (!validation.ok) errors.push(...validation.errors);
    return errors.length > 0
      ? ({ ok: false, error: errors.join('\n') } as const)
      : ({ ok: true, edl: built.edl, validation } as const);
  };

  const result = await aiObject<Answer>({
    lane: 'video_ai_design',
    system: `${promptFile('gestaltung.md')}\n\n${promptFile(`stile/${input.brief.style}.md`)}`,
    prompt: buildDesignPrompt(input),
    toolName: 'gestaltung_festlegen',
    toolDescription:
      'Legt Untertitel, Einblendungen, Logo und Musik für das geschnittene Video fest.',
    schema: TOOL_SCHEMA,
    reasoning: 'medium',
    temperature: 0.3,
    maxOutputTokens: 8000,
    timeoutMs: 120_000,
    ...(signal !== null && { signal }),
    label: 'video_ai_design',
    validate: (raw) => {
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.message };
      const checked = check(parsed.data);
      return checked.ok ? { ok: true, value: parsed.data } : checked;
    },
  });
  if (!result.ok) throw result.cause ?? new Error(result.error);

  const final = check(result.data);
  if (!final.ok) throw new Error(`video_ai_design: ${final.error}`);
  if (!final.validation.ok) throw new Error('video_ai_design: unreachable');
  return { edl: final.edl, validation: final.validation };
}
