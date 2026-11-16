import { type ConventionSummary } from '@gruenerator/contracts';
import { shareLinkKey, slugifyName } from '@gruenerator/shared/utils';
import { and, asc, count, desc, eq, or } from 'drizzle-orm';

import {
  conventionAccess,
  conventions,
  conventionSpeeches,
  type ConventionRow,
  type ConventionSpeechRow,
} from '../../database/schema/parteitage.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

import { type ConventionViewer, isConventionVisible } from './access.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const buildConventionSlug = (slugName: string, suffix: string): string =>
  `${slugifyName(slugName, 'parteitag')}-${suffix}`;

export const conventionSlug = (c: Pick<ConventionRow, 'slug_name' | 'slug_suffix'>): string =>
  buildConventionSlug(c.slug_name, c.slug_suffix);

export const speechSlug = (
  s: Pick<ConventionSpeechRow, 'first_name' | 'last_name' | 'slug_suffix'>
): string => `${slugifyName(`${s.first_name} ${s.last_name}`, 'rede')}-${s.slug_suffix}`;

export async function listConventions(viewer: ConventionViewer): Promise<ConventionSummary[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ convention: conventions, speechCount: count(conventionSpeeches.id) })
    .from(conventions)
    .leftJoin(conventionSpeeches, eq(conventionSpeeches.convention_id, conventions.id))
    .groupBy(conventions.id)
    .orderBy(desc(conventions.starts_on));

  const grants = new Set(
    (
      await db
        .select({ id: conventionAccess.convention_id })
        .from(conventionAccess)
        .where(eq(conventionAccess.user_id, viewer.userId))
    ).map((g) => g.id)
  );

  return rows
    .filter((r) => isConventionVisible(viewer, r.convention))
    .map(({ convention: c, speechCount }) => ({
      id: c.id,
      slug: conventionSlug(c),
      title: c.title,
      shortTitle: c.short_title,
      organizer: c.organizer,
      startsOn: c.starts_on,
      endsOn: c.ends_on,
      location: c.location,
      locked: c.access_password_hash !== null && !grants.has(c.id) && !viewer.isAdmin,
      speechCount: Number(speechCount),
    }));
}

export async function getConventionBySlug(slugOrId: string): Promise<ConventionRow | null> {
  const key = shareLinkKey(slugOrId);
  if (!key) return null;
  const [row] = await getDrizzleInstance()
    .select()
    .from(conventions)
    .where('id' in key ? eq(conventions.id, key.id) : eq(conventions.slug_suffix, key.slugSuffix))
    .limit(1);
  return row ?? null;
}

export async function getConventionById(id: string): Promise<ConventionRow | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await getDrizzleInstance()
    .select()
    .from(conventions)
    .where(eq(conventions.id, id))
    .limit(1);
  return row ?? null;
}

/** Speech by uuid or by `<name>-<suffix>` slug. */
export async function getSpeech(slugOrId: string): Promise<ConventionSpeechRow | null> {
  const key = shareLinkKey(slugOrId);
  if (!key) return null;
  const [row] = await getDrizzleInstance()
    .select()
    .from(conventionSpeeches)
    .where(
      'id' in key
        ? eq(conventionSpeeches.id, key.id)
        : eq(conventionSpeeches.slug_suffix, key.slugSuffix)
    )
    .limit(1);
  return row ?? null;
}

export async function listSpeeches(conventionId: string): Promise<ConventionSpeechRow[]> {
  return getDrizzleInstance()
    .select()
    .from(conventionSpeeches)
    .where(eq(conventionSpeeches.convention_id, conventionId))
    .orderBy(asc(conventionSpeeches.list_place));
}

/** Who owns a media row: a speech's reel/poster, or a convention's report. */
export async function findOwnerOfMedia(
  mediaId: string
): Promise<{ convention: ConventionRow; speech: ConventionSpeechRow | null } | null> {
  if (!UUID_RE.test(mediaId)) return null;
  const db = getDrizzleInstance();
  const [speech] = await db
    .select()
    .from(conventionSpeeches)
    .where(
      or(
        eq(conventionSpeeches.reel_media_id, mediaId),
        eq(conventionSpeeches.poster_media_id, mediaId)
      )
    )
    .limit(1);
  if (speech) {
    const convention = await getConventionById(speech.convention_id);
    return convention ? { convention, speech } : null;
  }
  const [convention] = await db
    .select()
    .from(conventions)
    .where(eq(conventions.report_media_id, mediaId))
    .limit(1);
  return convention ? { convention, speech: null } : null;
}

export async function hasGrant(userId: string, conventionId: string): Promise<boolean> {
  const [row] = await getDrizzleInstance()
    .select({ u: conventionAccess.user_id })
    .from(conventionAccess)
    .where(
      and(eq(conventionAccess.user_id, userId), eq(conventionAccess.convention_id, conventionId))
    )
    .limit(1);
  return Boolean(row);
}

export async function grant(userId: string, conventionId: string): Promise<void> {
  await getDrizzleInstance()
    .insert(conventionAccess)
    .values({ user_id: userId, convention_id: conventionId })
    .onConflictDoNothing();
}
