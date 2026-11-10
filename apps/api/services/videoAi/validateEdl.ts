/**
 * Checks a cut plan before anyone sees it. The schema guarantees shape; this
 * guarantees meaning — above all that the cut does not put words into
 * someone's mouth (Sinntreue):
 *
 *   - Only whole units, each at most once.
 *   - Spoken order, except that the first segment may be pulled forward as the
 *     hook. Measured 2026-11-10: the good plans move exactly one unit up front;
 *     the one that also shuffled the introduction backwards is caught here.
 *   - Numbers on screen must have been said or be in the briefing, and quoted
 *     text („…“) must have been said verbatim. The model writes no facts.
 *
 * Error strings are German on purpose: they go back to the model verbatim as
 * the repair turn (aiObject `validate`) and are shown to the person when the
 * repair fails too.
 */
import { type VideoAiEdl, type VideoAiOverlay } from '@gruenerator/contracts';

import { buildTimeline, type Timeline } from './timeline.js';
import { normalizeToken, type TranscriptUnit } from './transcriptUnits.js';

export interface ValidationClip {
  id: string;
  role: 'footage' | 'broll';
  duration: number;
}

export interface ValidationAsset {
  id: string;
  kind: 'image' | 'logo' | 'audio';
}

export interface ValidationContext {
  units: ReadonlyMap<string, TranscriptUnit>;
  clips: readonly ValidationClip[];
  assets: readonly ValidationAsset[];
  /** Null in correction rounds: there the person decides the length. */
  target: { minSeconds: number; maxSeconds: number } | null;
  /** Briefing texts the person wrote; numbers there may appear on screen. */
  briefTexts: readonly string[];
}

export type ValidationResult = { ok: true; timeline: Timeline } | { ok: false; errors: string[] };

export const LENGTH_TOLERANCE = 0.15;

export function validateEdl(edl: VideoAiEdl, ctx: ValidationContext): ValidationResult {
  const errors: string[] = [];
  const clipById = new Map(ctx.clips.map((c) => [c.id, c]));

  const unitErrors = checkUnits(edl, ctx, clipById);
  errors.push(...unitErrors);

  // Order and length need valid units; reporting them on top of a broken id
  // would only confuse the repair turn.
  let timeline: Timeline | null = null;
  if (unitErrors.length === 0) {
    errors.push(...checkOrder(edl));
    timeline = buildTimeline({
      unitIds: edl.segments.map((s) => s.unitId),
      units: ctx.units,
      clipDurations: new Map(ctx.clips.map((c) => [c.id, c.duration])),
    });
    if (ctx.target) errors.push(...checkLength(timeline.duration, ctx.target));
  }

  errors.push(...checkOverlays(edl, ctx, clipById));
  errors.push(...checkMusic(edl, ctx));

  if (errors.length > 0 || timeline === null) return { ok: false, errors };
  return { ok: true, timeline };
}

function checkUnits(
  edl: VideoAiEdl,
  ctx: ValidationContext,
  clipById: ReadonlyMap<string, ValidationClip>
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const { unitId } of edl.segments) {
    const unit = ctx.units.get(unitId);
    if (!unit) {
      errors.push(`Satz ${unitId} gibt es nicht. Verwende nur IDs aus dem Rohmaterial.`);
      continue;
    }
    if (clipById.get(unit.clipId)?.role !== 'footage') {
      errors.push(`Satz ${unitId} stammt aus B-Roll. B-Roll nur als Overlay "broll" einsetzen.`);
    }
    if (seen.has(unitId)) errors.push(`Satz ${unitId} kommt doppelt vor.`);
    seen.add(unitId);
  }
  return errors;
}

/** `c2.s14` → [2, 14], comparable in spoken order across clips. */
function position(unitId: string): [number, number] {
  const m = /^c(\d+)\.s(\d+)$/.exec(unitId);
  return m ? [Number(m[1]), Number(m[2])] : [0, 0];
}

function checkOrder(edl: VideoAiEdl): string[] {
  const rest = edl.segments.slice(1).map((s) => s.unitId);
  for (let i = 1; i < rest.length; i++) {
    const [ac, as] = position(rest[i - 1]);
    const [bc, bs] = position(rest[i]);
    if (bc < ac || (bc === ac && bs < as)) {
      return [
        `Reihenfolge: ${rest[i]} steht hinter ${rest[i - 1]}, wurde aber früher gesagt. ` +
          'Nur der erste Satz (Hook) darf vorgezogen werden, alle anderen bleiben in gesprochener Reihenfolge.',
      ];
    }
  }
  return [];
}

function checkLength(
  duration: number,
  target: { minSeconds: number; maxSeconds: number }
): string[] {
  const min = target.minSeconds * (1 - LENGTH_TOLERANCE);
  const max = target.maxSeconds * (1 + LENGTH_TOLERANCE);
  if (duration < min) {
    return [`Zu kurz: ${duration.toFixed(1)} s, Ziel ${target.minSeconds}–${target.maxSeconds} s.`];
  }
  if (duration > max) {
    return [
      `Zu lang: ${duration.toFixed(1)} s, Ziel ${target.minSeconds}–${target.maxSeconds} s. Lass weniger wichtige Sätze weg.`,
    ];
  }
  return [];
}

function checkOverlays(
  edl: VideoAiEdl,
  ctx: ValidationContext,
  clipById: ReadonlyMap<string, ValidationClip>
): string[] {
  const errors: string[] = [];
  const assetById = new Map(ctx.assets.map((a) => [a.id, a]));
  const spoken = ctx.briefTexts.concat([...ctx.units.values()].map((u) => u.text));
  const spokenNumbers = new Set(spoken.flatMap(numbersIn));
  const spokenText = spoken.map(normalizeText).join(' ');
  let lowerThirds = 0;
  const logoPlacements = new Set<string>();

  edl.overlays.forEach((o: VideoAiOverlay, i) => {
    const label = `Overlay ${i + 1} (${o.kind})`;
    if ('atSegment' in o && o.atSegment >= edl.segments.length) {
      errors.push(
        `${label}: Stück ${o.atSegment} gibt es nicht (nur 0–${edl.segments.length - 1}).`
      );
    }
    if (o.kind === 'titel') {
      for (const n of numbersIn(o.text)) {
        if (!spokenNumbers.has(n)) {
          errors.push(`${label}: Die Zahl ${n} wurde weder gesagt noch im Briefing genannt.`);
        }
      }
      for (const q of quotesIn(o.text)) {
        if (!spokenText.includes(normalizeText(q))) {
          errors.push(`${label}: Das Zitat „${q}“ wurde so nicht gesagt.`);
        }
      }
    } else if (o.kind === 'bauchbinde') {
      lowerThirds++;
    } else if (o.kind === 'asset') {
      const asset = assetById.get(o.assetId);
      if (!asset || asset.kind === 'audio') {
        errors.push(`${label}: Bild ${o.assetId} gibt es nicht.`);
      }
    } else if (o.kind === 'broll') {
      const clip = clipById.get(o.clipId);
      if (!clip || clip.role !== 'broll') {
        errors.push(`${label}: ${o.clipId} ist kein B-Roll-Clip.`);
      } else if (o.sourceStart + o.durationSeconds > clip.duration + 0.05) {
        errors.push(`${label}: ${o.clipId} ist nur ${clip.duration.toFixed(1)} s lang.`);
      }
    } else if (o.kind === 'logo') {
      if (logoPlacements.has(o.placement)) errors.push(`${label}: Logo "${o.placement}" doppelt.`);
      logoPlacements.add(o.placement);
    }
  });

  if (lowerThirds > 1) errors.push('Höchstens eine Bauchbinde.');
  return errors;
}

function checkMusic(edl: VideoAiEdl, ctx: ValidationContext): string[] {
  if (!edl.music) return [];
  const asset = ctx.assets.find((a) => a.id === edl.music?.assetId);
  return asset?.kind === 'audio' ? [] : [`Musik ${edl.music.assetId} gibt es nicht.`];
}

/** "1.000", "1000" and "70,5" compare as 1000 and 70.5. Thousands dots go. */
export function numbersIn(text: string): string[] {
  const matches = text.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return matches.map((m) => {
    const decimal = /,\d{1,2}$/.test(m);
    const digits = m.replace(/\.(?=\d{3}(?:\D|$))/g, '');
    return decimal ? digits.replace(',', '.') : digits.replace(/,/g, '');
  });
}

function quotesIn(text: string): string[] {
  return [...text.matchAll(/[„"»«“]([^„"»«“”]{3,})[“”"«»]/g)].map((m) => m[1].trim());
}

function normalizeText(text: string): string {
  return text.split(/\s+/).map(normalizeToken).filter(Boolean).join(' ');
}
