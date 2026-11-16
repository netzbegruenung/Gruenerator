/** Row → response mapping for the Parteitage routes (URLs, numeric columns, admin list). */
import {
  type ConventionEditorData,
  type ConventionSpeechPublic,
  type ConventionStatus,
} from '@gruenerator/contracts';
import { count, desc, eq } from 'drizzle-orm';

import {
  conventions,
  conventionSpeeches,
  systemMedia,
  type ConventionRow,
  type ConventionSpeechRow,
  type SystemMediaRow,
} from '../../database/schema/parteitage.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

import { conventionSlug, speechSlug } from './parteitageRepository.js';

export const mediaUrl = (mediaId: string): string => `/api/parteitage/media/${mediaId}`;

export async function getMedia(mediaId: string): Promise<SystemMediaRow | null> {
  const [row] = await getDrizzleInstance()
    .select()
    .from(systemMedia)
    .where(eq(systemMedia.id, mediaId))
    .limit(1);
  return row ?? null;
}

/** `<Nachname>-<Vorname>_KV-<KV>` for a speech, the short title for a convention. */
export function downloadBaseName(
  convention: Pick<ConventionRow, 'short_title'>,
  speech: Pick<ConventionSpeechRow, 'first_name' | 'last_name' | 'kv'> | null
): string {
  const clean = (v: string) =>
    v
      .trim()
      // eslint-disable-next-line no-control-regex -- strip control chars from file names
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
      .replace(/\s+/g, '-');
  return speech
    ? `${clean(speech.last_name)}-${clean(speech.first_name)}_KV-${clean(speech.kv)}`
    : clean(convention.short_title);
}

export function toPublicSpeech(s: ConventionSpeechRow): ConventionSpeechPublic {
  return {
    id: s.id,
    slug: speechSlug(s),
    key: s.speech_key,
    day: s.day,
    dayLabel: s.day_label,
    listPlace: s.list_place,
    seatType: s.seat_type,
    firstName: s.first_name,
    lastName: s.last_name,
    kv: s.kv,
    area: s.area,
    contested: s.contested,
    elected: s.elected,
    resultPercent: s.result_percent === null ? null : Number(s.result_percent),
    deliveredBy: s.delivered_by,
    topic: s.topic,
    durationS: Number(s.duration_s),
    wordCount: s.word_count,
    analysis: s.analysis,
    reelUrl: mediaUrl(s.reel_media_id),
    posterUrl: mediaUrl(s.poster_media_id),
  };
}

export async function buildEditorData(
  convention: ConventionRow,
  speech: ConventionSpeechRow
): Promise<ConventionEditorData> {
  const reel = await getMedia(speech.reel_media_id);
  const ext = reel?.storage_key.split('.').pop() ?? 'mp4';
  return {
    speechId: speech.id,
    streamUrl: mediaUrl(speech.reel_media_id),
    width: reel?.width ?? 0,
    height: reel?.height ?? 0,
    durationS: Number(speech.duration_s),
    fileName: `${downloadBaseName(convention, speech)}.${ext}`,
    words: speech.words,
  };
}

export async function listAllConventions() {
  const rows = await getDrizzleInstance()
    .select({ convention: conventions, speechCount: count(conventionSpeeches.id) })
    .from(conventions)
    .leftJoin(conventionSpeeches, eq(conventionSpeeches.convention_id, conventions.id))
    .groupBy(conventions.id)
    .orderBy(desc(conventions.starts_on));
  return rows.map(({ convention: c, speechCount }) => ({
    id: c.id,
    slug: conventionSlug(c),
    key: c.key,
    status: c.status as ConventionStatus,
    audience: c.audience,
    title: c.title,
    shortTitle: c.short_title,
    organizer: c.organizer,
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    location: c.location,
    locked: c.access_password_hash !== null,
    speechCount: Number(speechCount),
  }));
}
