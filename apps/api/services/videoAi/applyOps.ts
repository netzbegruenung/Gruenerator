/**
 * One correction round on a plan, without a model: the ops of
 * contracts/videoAi.ts in a fixed order. Sentence changes first (addressed by
 * unit id, so their order within the round does not matter), then overlay
 * changes (addressed by index in the plan before the round). Existing
 * overlays keep their sentence: removing the segment under an overlay moves
 * it to the next surviving segment.
 *
 * The result is NOT validated here — the caller runs validateEdl, exactly as
 * for the first cut, so a round can never produce what the first cut may not.
 */
import {
  videoAiOverlaySchema,
  type VideoAiEdl,
  type VideoAiOp,
  type VideoAiSegment,
} from '@gruenerator/contracts';

import { type TranscriptUnit } from './transcriptUnits.js';

export type OpsResult =
  { ok: true; edl: VideoAiEdl; omitted: Record<string, string> } | { ok: false; error: string };

export interface OpsContext {
  units: ReadonlyMap<string, TranscriptUnit>;
  /** The "Rausgeschnitten" list of the plan before the round. */
  omitted: Readonly<Record<string, string>>;
  /** Reason the round gives for a sentence it takes out. */
  removedReason: string;
}

/** `c2.s14` → [2, 14], comparable in spoken order across clips. */
function position(unitId: string): [number, number] {
  const m = /^c(\d+)\.s(\d+)$/.exec(unitId);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function spokenBefore(a: string, b: string): boolean {
  const [ac, as] = position(a);
  const [bc, bs] = position(b);
  return ac < bc || (ac === bc && as < bs);
}

/** Insert after the hook, at the unit's place in spoken order. */
function insertSpoken(segments: VideoAiSegment[], segment: VideoAiSegment): VideoAiSegment[] {
  const at = segments.findIndex((s, i) => i > 0 && spokenBefore(segment.unitId, s.unitId));
  if (at < 0) return [...segments, segment];
  return [...segments.slice(0, at), segment, ...segments.slice(at)];
}

export function applyOps(edl: VideoAiEdl, ops: readonly VideoAiOp[], ctx: OpsContext): OpsResult {
  const omitted: Record<string, string> = { ...ctx.omitted };
  const originalOrder = edl.segments.map((s) => s.unitId);
  let segments = edl.segments.map((s) => ({ ...s }));
  const find = (unitId: string) => segments.findIndex((s) => s.unitId === unitId);

  for (const op of ops) {
    if (op.kind === 'remove_segment') {
      if (find(op.unitId) < 0) return { ok: false, error: `${op.unitId} ist nicht im Schnitt.` };
      segments = segments.filter((s) => s.unitId !== op.unitId);
      omitted[op.unitId] = ctx.removedReason;
    } else if (op.kind === 'restore_unit') {
      if (!ctx.units.has(op.unitId)) return { ok: false, error: `${op.unitId} gibt es nicht.` };
      if (find(op.unitId) >= 0) continue;
      segments = insertSpoken(segments, { unitId: op.unitId, framing: null, zoom: 'normal' });
      delete omitted[op.unitId];
    } else if (op.kind === 'move_segment') {
      const i = find(op.unitId);
      if (i < 0) return { ok: false, error: `${op.unitId} ist nicht im Schnitt.` };
      const [moved] = segments.splice(i, 1);
      const at = op.before === null ? segments.length : find(op.before);
      if (at < 0) return { ok: false, error: `${op.before ?? ''} ist nicht im Schnitt.` };
      segments.splice(at, 0, moved);
    } else if (op.kind === 'swap_take') {
      const i = find(op.unitId);
      if (i < 0) return { ok: false, error: `${op.unitId} ist nicht im Schnitt.` };
      if (!ctx.units.has(op.withUnitId)) {
        return { ok: false, error: `${op.withUnitId} gibt es nicht.` };
      }
      segments[i] = { ...segments[i], unitId: op.withUnitId };
      omitted[op.unitId] = ctx.removedReason;
      delete omitted[op.withUnitId];
    } else if (op.kind === 'set_framing' || op.kind === 'set_zoom') {
      const i = find(op.unitId);
      if (i < 0) return { ok: false, error: `${op.unitId} ist nicht im Schnitt.` };
      segments[i] =
        op.kind === 'set_framing'
          ? { ...segments[i], framing: op.framing }
          : { ...segments[i], zoom: op.zoom };
    }
  }
  if (segments.length === 0) return { ok: false, error: 'Mindestens ein Satz muss bleiben.' };

  // Existing overlays follow their sentence; a removed one hands over to the
  // next surviving sentence of the old order, or the last segment.
  const swapped = new Map<string, string>();
  for (const op of ops) if (op.kind === 'swap_take') swapped.set(op.unitId, op.withUnitId);
  const newIndex = (oldSegment: number): number => {
    for (let i = oldSegment; i < originalOrder.length; i++) {
      const id = swapped.get(originalOrder[i]) ?? originalOrder[i];
      const at = find(id);
      if (at >= 0) return at;
    }
    return segments.length - 1;
  };

  const removed = new Set<number>();
  const updated = new Map<number, VideoAiEdl['overlays'][number]>();
  for (const op of ops) {
    if (op.kind !== 'remove_overlay' && op.kind !== 'update_overlay') continue;
    if (op.index >= edl.overlays.length) {
      return { ok: false, error: `Einblendung ${op.index} gibt es nicht.` };
    }
    if (op.kind === 'remove_overlay') {
      removed.add(op.index);
      continue;
    }
    const merged = videoAiOverlaySchema.safeParse({ ...edl.overlays[op.index], ...op.overlay });
    if (!merged.success) {
      return {
        ok: false,
        error: `Einblendung ${op.index}: ${merged.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`,
      };
    }
    updated.set(op.index, merged.data);
  }
  const overlays: VideoAiEdl['overlays'] = [];
  edl.overlays.forEach((o, i) => {
    if (removed.has(i)) return;
    const replacement = updated.get(i);
    const patch = ops.find(
      (op): op is Extract<VideoAiOp, { kind: 'update_overlay' }> =>
        op.kind === 'update_overlay' && op.index === i
    );
    if (
      replacement &&
      'atSegment' in replacement &&
      'atSegment' in o &&
      !('atSegment' in (patch?.overlay ?? {}))
    ) {
      // Not moved by the round: it follows its sentence like the others.
      overlays.push({ ...replacement, atSegment: newIndex(o.atSegment) });
    } else if (replacement) overlays.push(replacement);
    else overlays.push('atSegment' in o ? { ...o, atSegment: newIndex(o.atSegment) } : o);
  });
  for (const op of ops) if (op.kind === 'add_overlay') overlays.push(op.overlay);

  let captions = edl.captions;
  let music = edl.music ?? null;
  let captionFixes = [...(edl.captionFixes ?? [])];
  for (const op of ops) {
    if (op.kind === 'set_captions') {
      captions = { enabled: op.enabled, template: op.template ?? captions.template ?? null };
    } else if (op.kind === 'set_music') {
      music = op.music;
    } else if (op.kind === 'set_caption_text') {
      const unit = ctx.units.get(op.unitId);
      if (!unit?.words.some((w) => Math.abs(w.start - op.start) < 0.01)) {
        return {
          ok: false,
          error: `Bei ${op.start.toFixed(2)} s in ${op.unitId} steht kein Wort.`,
        };
      }
      captionFixes = captionFixes.filter(
        (f) => !(f.unitId === op.unitId && Math.abs(f.start - op.start) < 0.01)
      );
      captionFixes.push({ unitId: op.unitId, start: op.start, text: op.text });
    }
  }

  return {
    ok: true,
    edl: { ...edl, segments, overlays, captions, music, captionFixes },
    omitted,
  };
}
