/**
 * The plan without the model, when a stage gives up after its repair turn.
 * Nobody goes away empty-handed — but nothing here may put words in someone's
 * mouth, so the fallback is conservative: every statement stays, in the order
 * it was recorded, and only what is a repetition by construction goes (earlier
 * attempts of a take, stutters and long pauses — the latter two the timeline
 * removes anyway). A retracted statement is an earlier take, so it goes too.
 */
import { type VideoAiEdl, type VideoAiFraming, type VideoAiStyle } from '@gruenerator/contracts';

import { DEFAULT_SECONDS, lowerThirdSegment, segmentsFor } from './decideDesign.js';
import { type TakeGroup } from './takeGroups.js';
import { type TranscriptUnit } from './transcriptUnits.js';

export const FALLBACK_CUT_RATIONALE =
  'Die KI konnte diesmal keinen Schnitt festlegen. Das ist ein vorsichtiger Entwurf: alle ' +
  'Aussagen in der aufgenommenen Reihenfolge, nur frühere Versuche, Versprecher und lange ' +
  'Pausen sind raus. Kürze ihn mit einer Korrekturrunde oder selbst im Editor.';

export interface FallbackCut {
  unitIds: string[];
  omitted: Record<string, string>;
  rationale: string;
}

/** `units` in recording order (clip by clip, then by time). */
export function fallbackCut(
  units: readonly TranscriptUnit[],
  takes: readonly TakeGroup[]
): FallbackCut {
  const omitted: Record<string, string> = {};
  for (const take of takes) {
    for (const id of take.unitIds) {
      if (id !== take.preferred) omitted[id] = 'Früherer Versuch derselben Aussage';
    }
  }
  return {
    unitIds: units.map((u) => u.id).filter((id) => !(id in omitted)),
    omitted,
    rationale: FALLBACK_CUT_RATIONALE,
  };
}

export interface FallbackDesignInput {
  unitIds: readonly string[];
  units: ReadonlyMap<string, TranscriptUnit>;
  framing: ReadonlyMap<string, VideoAiFraming | null>;
  style: VideoAiStyle;
  format: VideoAiEdl['format'];
  person: { name: string } | null;
  burnedInCaptions: boolean;
}

/** Captions, lower third and logo — the parts that follow from rules, not taste. */
export function fallbackDesign(input: FallbackDesignInput): VideoAiEdl {
  const overlays: VideoAiEdl['overlays'] = [];
  if (input.person) {
    overlays.push({
      kind: 'bauchbinde',
      atSegment: lowerThirdSegment(input.unitIds, input.units, input.person.name),
      durationSeconds: DEFAULT_SECONDS.bauchbinde,
    });
  }
  // The official logo of the country, from the editor's catalog — not an upload.
  overlays.push({ kind: 'logo', placement: 'ecke' });
  return {
    version: 1,
    format: input.format,
    segments: segmentsFor(input.unitIds, input.units, input.framing, input.style),
    captions: input.burnedInCaptions
      ? { enabled: false, template: null }
      : { enabled: true, template: 'tanne' },
    overlays,
    music: null,
  };
}
