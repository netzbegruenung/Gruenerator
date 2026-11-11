/**
 * What every step after the analysis derives from a project row: transcript
 * units, take groups, the inputs of both Gemma stages, and the validation
 * context. Deterministic from the stored analysis, so a correction round sees
 * exactly the units the first cut saw.
 */
import { type VideoAiBrief } from '@gruenerator/contracts';

import { type CutInput } from './decideCut.js';
import { type DesignInput } from './decideDesign.js';
import { clipSummary, framingFor, hasBurnedInCaptions } from './framing.js';
import { type StoredVideoAiAnalysis, type StoredVideoAiInput } from './projectTypes.js';
import { findTakeGroups } from './takeGroups.js';
import { buildTranscriptUnits, type TranscriptUnit } from './transcriptUnits.js';
import { type ValidationContext } from './validateEdl.js';
import { MIN_FOOTAGE_WORDS } from './warnings.js';

export interface ProjectBasics {
  locale: 'de-DE' | 'de-AT';
  brief: VideoAiBrief;
  inputs: readonly StoredVideoAiInput[];
}

export interface PlanContext {
  units: Map<string, TranscriptUnit>;
  ordered: TranscriptUnit[];
  cutInput: CutInput;
  designBase: Omit<DesignInput, 'cut'>;
}

export function planContext(row: ProjectBasics, analysis: StoredVideoAiAnalysis): PlanContext {
  const titles = new Map(row.inputs.map((i) => [i.id, i.title]));
  const footage = analysis.clips.filter((c) => c.role === 'footage');
  const ordered = footage.flatMap((c) => buildTranscriptUnits(c.clipId, c.words));
  const units = new Map(ordered.map((u) => [u.id, u]));
  const cellsByClip = new Map(analysis.clips.map((c) => [c.clipId, c.cells]));
  const assets = analysis.assets.map((a) => ({ id: a.id, kind: a.kind }));
  const brief = {
    topic: row.brief.topic ?? null,
    format: row.brief.format,
    target: row.brief.target ?? null,
    hints: row.brief.hints ?? null,
    locale: row.locale,
  };
  return {
    units,
    ordered,
    cutInput: {
      brief,
      clips: analysis.clips.map((c) => ({
        id: c.clipId,
        role: c.role,
        duration: c.duration,
        quality: c.detectors.quality,
      })),
      units,
      takes: findTakeGroups(ordered),
      assets,
    },
    designBase: {
      brief: {
        ...brief,
        style: row.brief.style,
        person: row.brief.person
          ? { name: row.brief.person.name, role: row.brief.person.role || null }
          : null,
      },
      units,
      clips: analysis.clips.map((c) => ({
        id: c.clipId,
        role: c.role,
        duration: c.duration,
        summary: clipSummary(c.cells),
      })),
      assets: analysis.assets.map((a) => ({
        ...a,
        label: titles.get(a.id) ?? a.id,
      })),
      framing: new Map(ordered.map((u) => [u.id, framingFor(u, cellsByClip.get(u.clipId) ?? [])])),
      burnedInCaptions: hasBurnedInCaptions(footage.flatMap((c) => c.cells)),
    },
  };
}

/** The same checks as the first cut; `target: null` lets the person decide the length. */
export function validationContext(
  row: ProjectBasics,
  ctx: PlanContext,
  target: ValidationContext['target']
): ValidationContext {
  return {
    units: ctx.units,
    clips: ctx.cutInput.clips,
    assets: ctx.cutInput.assets,
    target,
    briefTexts: [row.brief.topic ?? '', row.brief.hints ?? '', row.brief.person?.name ?? ''],
  };
}

/**
 * Every uploaded video starts as footage; the page asks for no roles. After
 * the transcription, a clip in which hardly anything is said becomes b-roll —
 * but only while another clip carries the speech, so a quiet single clip is
 * not turned into a video without a speaker.
 */
export function withAutoRoles(analysis: StoredVideoAiAnalysis): StoredVideoAiAnalysis {
  const speaks = (c: StoredVideoAiAnalysis['clips'][number]) => c.words.length >= MIN_FOOTAGE_WORDS;
  if (!analysis.clips.some((c) => c.role === 'footage' && speaks(c))) return analysis;
  if (!analysis.clips.some((c) => c.role === 'footage' && !speaks(c))) return analysis;
  return {
    ...analysis,
    clips: analysis.clips.map((c) =>
      c.role === 'footage' && !speaks(c) ? { ...c, role: 'broll' as const } : c
    ),
  };
}
