/**
 * What a KI-Schnitt may be made of, checked before anything is booked: every
 * item is the person's own, of the right kind, ready, and within the limits
 * of VIDEO_AI_LIMITS. Pure; the router loads the rows.
 */
import { VIDEO_AI_LIMITS, type VideoAiInput } from '@gruenerator/contracts';

import { mediaTypeFits, type MediaForInput } from './projectRepository.js';
import { assignInputIds, type StoredVideoAiInput } from './projectTypes.js';

export type MaterialCheck =
  { ok: true; inputs: StoredVideoAiInput[]; clipSeconds: number } | { ok: false; error: string };

const ROLE_NOUN: Record<VideoAiInput['role'], string> = {
  footage: 'ein Video',
  broll: 'ein Video',
  image: 'ein Bild',
  logo: 'ein Bild',
  audio: 'eine Audiodatei',
};

/**
 * `durations` holds the probed length for videos whose row has none yet;
 * a clip without any known length is refused rather than guessed.
 */
export function checkMaterial(
  inputs: readonly VideoAiInput[],
  media: readonly MediaForInput[],
  durations: ReadonlyMap<string, number> = new Map()
): MaterialCheck {
  if (new Set(inputs.map((i) => i.mediaId)).size !== inputs.length) {
    return { ok: false, error: 'Eine Datei ist doppelt ausgewählt.' };
  }
  const byId = new Map(media.map((m) => [m.id, m]));
  const stored: StoredVideoAiInput[] = [];
  let footageSeconds = 0;
  let clipSeconds = 0;
  for (const input of assignInputIds(inputs)) {
    const row = byId.get(input.mediaId);
    if (!row) return { ok: false, error: 'Eine ausgewählte Datei gibt es nicht mehr.' };
    const title = row.title?.trim() || row.original_filename?.trim() || 'Ohne Titel';
    if (!mediaTypeFits(input.role, row.media_type)) {
      return { ok: false, error: `„${title}“ ist nicht ${ROLE_NOUN[input.role]}.` };
    }
    if (row.status !== null && row.status !== 'ready') {
      return { ok: false, error: `„${title}“ wird noch verarbeitet.` };
    }
    if (input.role === 'footage' || input.role === 'broll') {
      const seconds = row.duration ?? durations.get(row.id) ?? null;
      if (seconds === null || seconds <= 0) {
        return { ok: false, error: `Die Länge von „${title}“ ist nicht lesbar.` };
      }
      clipSeconds += seconds;
      if (input.role === 'footage') footageSeconds += seconds;
    }
    stored.push({ id: input.id, mediaId: input.mediaId, role: input.role, title });
  }

  const clips = stored.filter((i) => i.role === 'footage' || i.role === 'broll').length;
  if (!stored.some((i) => i.role === 'footage')) {
    return { ok: false, error: 'Es fehlt ein Video, in dem gesprochen wird.' };
  }
  if (clips > VIDEO_AI_LIMITS.maxClips) {
    return { ok: false, error: `Höchstens ${VIDEO_AI_LIMITS.maxClips} Videos pro KI-Schnitt.` };
  }
  if (stored.length - clips > VIDEO_AI_LIMITS.maxAssets) {
    return {
      ok: false,
      error: `Höchstens ${VIDEO_AI_LIMITS.maxAssets} Bilder, Logos und Audios pro KI-Schnitt.`,
    };
  }
  if (footageSeconds > VIDEO_AI_LIMITS.maxFootageSeconds) {
    return {
      ok: false,
      error: `Das Rohmaterial ist länger als ${VIDEO_AI_LIMITS.maxFootageSeconds / 60} Minuten.`,
    };
  }
  return { ok: true, inputs: stored, clipSeconds };
}
