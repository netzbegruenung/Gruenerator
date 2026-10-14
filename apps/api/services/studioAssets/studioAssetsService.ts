/**
 * The Studio shop: user-uploaded Sticker and Hintergründe.
 *
 * The bytes are a `shared_media` row (upload source 'studio-asset'); a
 * `studio_assets` row adds the shop metadata. `src` is always built here as
 * `/api/share/<token>/download` — the purge reads the token back from it.
 */
import {
  type GroupAudience,
  type StudioAssetCreateBody,
  type StudioAssetItem,
  type StudioAssetKind,
  type StudioAssetListQuery,
  type StudioAssetListResponse,
  type StudioAssetUpdateBody,
} from '@gruenerator/contracts';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';

import { profiles } from '../../database/schema/core.js';
import { sharedMedia } from '../../database/schema/media.js';
import { studioAssets, type StudioAssetRow } from '../../database/schema/studioAssets.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { notTrashed } from '../../database/trash.js';
import { buildThumbnailTileUrl, versionFromShareRow } from '../media/thumbnailUrl.js';
import { isRowId, isUniqueViolation } from '../trash/ownedRowTrash.js';

import { trashStudioAssets } from './studioAssetTrash.js';

export const STUDIO_ASSET_QUOTA = 300;
export const STUDIO_ASSET_MIN_SIDE = 64;
export const STUDIO_ASSET_MAX_SIDE: Record<StudioAssetKind, number> = {
  sticker: 1024,
  background: 2160,
};
const ALLOWED_MIME_TYPES = ['image/png', 'image/webp'];

export interface StudioAssetFailure<S extends number> {
  ok: false;
  status: S;
  message: string;
}
export type StudioAssetResult<T, S extends number> = { ok: true; value: T } | StudioAssetFailure<S>;

const fail = <S extends number>(status: S, message: string): StudioAssetFailure<S> => ({
  ok: false,
  status,
  message,
});

const NOT_FOUND = fail(404, 'Element nicht gefunden.');
const MEDIA_IN_USE = fail(409, 'Dieses Bild wird schon verwendet.');
const RIGHTS_REQUIRED = fail(
  400,
  'Bitte bestätige, dass du die Rechte an dem Bild hast, bevor du es öffentlich teilst.'
);

const isPublicOk = (): SQL =>
  and(eq(studioAssets.visibility, 'public'), eq(studioAssets.moderation, 'ok'))!;

/** Public and unmoderated, or the caller's own. */
const visibleTo = (userId: string): SQL => or(isPublicOk(), eq(studioAssets.user_id, userId))!;

const likesCountSql = sql<number>`(SELECT count(*)::int FROM entity_likes el
  WHERE el.entity_type = 'studio_asset' AND el.entity_id = ${studioAssets.id}::text)`;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

async function selectItems(
  userId: string,
  where: SQL,
  opts: { orderBy: SQL[]; limit: number; offset?: number }
): Promise<StudioAssetItem[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      asset: studioAssets,
      shareToken: sharedMedia.share_token,
      mediaCreatedAt: sharedMedia.created_at,
      mediaMetadata: sharedMedia.image_metadata,
      authorName: profiles.display_name,
      likesCount: likesCountSql,
      liked: sql<boolean>`EXISTS (SELECT 1 FROM entity_likes el
        WHERE el.user_id = ${userId} AND el.entity_type = 'studio_asset'
          AND el.entity_id = ${studioAssets.id}::text)`,
      favorited: sql<boolean>`EXISTS (SELECT 1 FROM entity_favorites ef
        WHERE ef.user_id = ${userId} AND ef.entity_type = 'studio_asset'
          AND ef.entity_id = ${studioAssets.id}::text)`,
    })
    .from(studioAssets)
    .leftJoin(sharedMedia, and(eq(sharedMedia.id, studioAssets.media_id), notTrashed(sharedMedia)))
    .leftJoin(profiles, eq(profiles.id, studioAssets.user_id))
    .where(and(where, notTrashed(studioAssets)))
    .orderBy(...opts.orderBy)
    .limit(opts.limit)
    .offset(opts.offset ?? 0);

  return rows.map((r) => toItem(r, userId));
}

function toItem(
  r: {
    asset: StudioAssetRow;
    shareToken: string | null;
    mediaCreatedAt: Date | null;
    mediaMetadata: unknown;
    authorName: string | null;
    likesCount: number;
    liked: boolean;
    favorited: boolean;
  },
  userId: string
): StudioAssetItem {
  const a = r.asset;
  return {
    id: a.id,
    kind: a.kind,
    title: a.title,
    tags: a.tags,
    src: a.src,
    thumbUrl: r.shareToken
      ? buildThumbnailTileUrl(
          'media',
          r.shareToken,
          versionFromShareRow({ created_at: r.mediaCreatedAt, image_metadata: r.mediaMetadata })
        )
      : null,
    width: a.width,
    height: a.height,
    source: a.source,
    visibility: a.visibility,
    audience: a.audience,
    moderation: a.moderation,
    isOwn: a.user_id === userId,
    authorName: r.authorName?.trim() || null,
    likesCount: Number(r.likesCount) || 0,
    liked: r.liked === true,
    favorited: r.favorited === true,
    createdAt: a.created_at.toISOString(),
  };
}

async function getItem(userId: string, id: string): Promise<StudioAssetItem | null> {
  const [item] = await selectItems(userId, and(eq(studioAssets.id, id), visibleTo(userId))!, {
    orderBy: [desc(studioAssets.created_at)],
    limit: 1,
  });
  return item ?? null;
}

export async function listStudioAssets(
  userId: string,
  locale: Exclude<GroupAudience, 'all'>,
  query: StudioAssetListQuery
): Promise<StudioAssetListResponse> {
  const conditions: SQL[] = [eq(studioAssets.kind, query.kind)];

  if (query.scope === 'shop') {
    conditions.push(isPublicOk(), inArray(studioAssets.audience, [locale, 'all']));
  } else if (query.scope === 'mine') {
    conditions.push(eq(studioAssets.user_id, userId));
  } else {
    conditions.push(
      visibleTo(userId),
      sql`EXISTS (SELECT 1 FROM entity_favorites ef
        WHERE ef.user_id = ${userId} AND ef.entity_type = 'studio_asset'
          AND ef.entity_id = ${studioAssets.id}::text)`
    );
  }

  const q = query.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      or(
        sql`${studioAssets.title} ILIKE ${pattern}`,
        sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${studioAssets.tags}) tag
          WHERE tag ILIKE ${pattern})`
      )!
    );
  }

  const orderBy =
    query.sort === 'popular'
      ? [desc(likesCountSql), desc(studioAssets.created_at), desc(studioAssets.id)]
      : [desc(studioAssets.created_at), desc(studioAssets.id)];

  const items = await selectItems(userId, and(...conditions)!, {
    orderBy,
    limit: query.limit + 1,
    offset: query.offset,
  });
  return { items: items.slice(0, query.limit), hasMore: items.length > query.limit };
}

export async function createStudioAsset(
  userId: string,
  body: StudioAssetCreateBody
): Promise<StudioAssetResult<StudioAssetItem, 400 | 404 | 409>> {
  if (body.visibility === 'public' && body.rightsConfirmed !== true) return RIGHTS_REQUIRED;

  const db = getDrizzleInstance();
  const [media] = await db
    .select({
      id: sharedMedia.id,
      share_token: sharedMedia.share_token,
      image_metadata: sharedMedia.image_metadata,
    })
    .from(sharedMedia)
    .where(
      and(
        eq(sharedMedia.share_token, body.shareToken),
        eq(sharedMedia.user_id, userId),
        notTrashed(sharedMedia),
        eq(sharedMedia.upload_source, 'studio-asset'),
        eq(sharedMedia.media_type, 'image'),
        inArray(sharedMedia.mime_type, ALLOWED_MIME_TYPES)
      )
    )
    .limit(1);
  if (!media) return fail(404, 'Bild nicht gefunden.');

  const width = Number(media.image_metadata.width) || 0;
  const height = Number(media.image_metadata.height) || 0;
  if (width === 0 || height === 0) return fail(400, 'Das Bild konnte nicht gelesen werden.');
  if (Math.min(width, height) < STUDIO_ASSET_MIN_SIDE) {
    return fail(400, `Das Bild ist zu klein (mindestens ${STUDIO_ASSET_MIN_SIDE} px pro Seite).`);
  }
  const maxSide = STUDIO_ASSET_MAX_SIDE[body.kind];
  if (Math.max(width, height) > maxSide) {
    return fail(400, `Das Bild ist zu groß (höchstens ${maxSide} px an der längeren Seite).`);
  }

  // Trashed assets count: until the purge, they still own their image file.
  const [used] = await db
    .select({ id: studioAssets.id })
    .from(studioAssets)
    .where(eq(studioAssets.media_id, media.id))
    .limit(1);
  if (used) return MEDIA_IN_USE;

  const [quota] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(studioAssets)
    .where(and(eq(studioAssets.user_id, userId), notTrashed(studioAssets)));
  if ((quota?.count ?? 0) >= STUDIO_ASSET_QUOTA) {
    return fail(
      409,
      `Du hast das Limit von ${STUDIO_ASSET_QUOTA} Stickern und Hintergründen erreicht. Lösche zuerst ältere.`
    );
  }

  let insertedId: string | null = null;
  try {
    const [inserted] = await db
      .insert(studioAssets)
      .values({
        user_id: userId,
        kind: body.kind,
        title: body.title,
        tags: normalizeTags(body.tags),
        media_id: media.id,
        src: `/api/share/${media.share_token}/download`,
        width,
        height,
        source: body.source,
        visibility: body.visibility,
        was_public: body.visibility === 'public',
        audience: body.audience,
      })
      .returning({ id: studioAssets.id });
    insertedId = inserted?.id ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return MEDIA_IN_USE;
    throw error;
  }

  const item = insertedId ? await getItem(userId, insertedId) : null;
  if (!item) throw new Error('studio asset vanished after insert');
  return { ok: true, value: item };
}

async function getOwnRow(userId: string, id: string): Promise<StudioAssetRow | null> {
  if (!isRowId(id)) return null;
  const db = getDrizzleInstance();
  const [row] = await db
    .select()
    .from(studioAssets)
    .where(and(eq(studioAssets.id, id), eq(studioAssets.user_id, userId), notTrashed(studioAssets)))
    .limit(1);
  return row ?? null;
}

export async function updateStudioAsset(
  userId: string,
  id: string,
  body: StudioAssetUpdateBody
): Promise<StudioAssetResult<StudioAssetItem, 400 | 403 | 404>> {
  const row = await getOwnRow(userId, id);
  if (!row) return NOT_FOUND;

  const goesPublic = body.visibility === 'public' && row.visibility !== 'public';
  if (body.visibility === 'public' && row.moderation === 'removed') {
    return fail(403, 'Dieses Element wurde entfernt und kann nicht mehr veröffentlicht werden.');
  }
  if (goesPublic && body.rightsConfirmed !== true) return RIGHTS_REQUIRED;

  const patch: Partial<StudioAssetRow> = { updated_at: new Date() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.tags !== undefined) patch.tags = normalizeTags(body.tags);
  if (body.audience !== undefined) patch.audience = body.audience;
  if (body.visibility !== undefined) patch.visibility = body.visibility;
  if (goesPublic) patch.was_public = true;

  const db = getDrizzleInstance();
  await db
    .update(studioAssets)
    .set(patch)
    .where(
      and(eq(studioAssets.id, id), eq(studioAssets.user_id, userId), notTrashed(studioAssets))
    );

  const item = await getItem(userId, id);
  return item ? { ok: true, value: item } : NOT_FOUND;
}

export async function removeStudioAsset(userId: string, id: string): Promise<boolean> {
  const moved = await trashStudioAssets(userId, [id]);
  return moved.length > 0;
}

/** Can the caller like or save this asset? Public and unmoderated, or their own. */
export async function isStudioAssetVisible(userId: string, id: string): Promise<boolean> {
  if (!isRowId(id)) return false;
  const db = getDrizzleInstance();
  const [row] = await db
    .select({ id: studioAssets.id })
    .from(studioAssets)
    .where(and(eq(studioAssets.id, id), visibleTo(userId), notTrashed(studioAssets)))
    .limit(1);
  return Boolean(row);
}
