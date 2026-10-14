/**
 * Stored content reports: what users report, the auto-hide for public studio
 * assets, and the admin queue that resolves reports per target.
 *
 * One open row per reporter and target (`uq_content_reports_open_reporter_target`),
 * so a repeated report is a no-op until the target has been resolved. Only studio assets carry a target the server
 * can act on; for the other kinds an admin action just closes the reports.
 */
import {
  type AdminReportGroup,
  type AdminReportListQuery,
  type AdminReportResolveBody,
  type AdminReportResolveResponse,
  type AdminReportStudioAssetTarget,
  type ContentReportCreate,
  type ContentReportKind,
  type ContentReportReason,
  type StudioAssetModeration,
} from '@gruenerator/contracts';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { contentReports } from '../../database/schema/contentReports.js';
import { profiles } from '../../database/schema/core.js';
import { sharedMedia } from '../../database/schema/media.js';
import { studioAssets } from '../../database/schema/studioAssets.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { notTrashed } from '../../database/trash.js';
import { buildThumbnailTileUrl, versionFromShareRow } from '../media/thumbnailUrl.js';
import { isRowId } from '../trash/ownedRowTrash.js';

/** Distinct open reporters that hide a public studio asset until an admin looks. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;
const LIST_LIMIT = 200;
const NOTES_PER_GROUP = 5;

export interface ContentReportFailure<S extends number> {
  ok: false;
  status: S;
  message: string;
}
export type ContentReportResult<T, S extends number> =
  { ok: true; value: T } | ContentReportFailure<S>;

const fail = <S extends number>(status: S, message: string): ContentReportFailure<S> => ({
  ok: false,
  status,
  message,
});

export interface RecordedReport {
  /** False when this reporter had already reported the target. */
  stored: boolean;
  /** True when this report pushed a studio asset over the threshold. */
  hidden: boolean;
}

export async function recordContentReport(
  reporterId: string,
  body: ContentReportCreate
): Promise<ContentReportResult<RecordedReport, 400 | 404>> {
  const db = getDrizzleInstance();
  const isAsset = body.kind === 'studio_asset';

  if (isAsset) {
    if (!isRowId(body.targetId)) return fail(404, 'Element nicht gefunden.');
    const [asset] = await db
      .select({
        user_id: studioAssets.user_id,
        visibility: studioAssets.visibility,
        moderation: studioAssets.moderation,
      })
      .from(studioAssets)
      .where(and(eq(studioAssets.id, body.targetId), notTrashed(studioAssets)))
      .limit(1);
    if (!asset || asset.visibility !== 'public' || asset.moderation !== 'ok') {
      return fail(404, 'Element nicht gefunden.');
    }
    if (asset.user_id === reporterId) return fail(400, 'Eigene Inhalte kannst du nicht melden.');
  }

  const inserted = await db
    .insert(contentReports)
    .values({
      kind: body.kind,
      target_id: body.targetId,
      reporter_id: reporterId,
      reason: body.reason,
      note: body.note ?? null,
      excerpt: body.excerpt ?? null,
      group_id: body.groupId && isRowId(body.groupId) ? body.groupId : null,
      thread_id: body.threadId ?? null,
    })
    .onConflictDoNothing({
      target: [contentReports.reporter_id, contentReports.kind, contentReports.target_id],
      where: sql`status = 'open'`,
    })
    .returning({ id: contentReports.id });
  const stored = inserted.length > 0;

  let hidden = false;
  if (isAsset && stored) {
    // One statement: the count and the flip cannot interleave with another
    // report's, and the last of concurrent reports always sees all of them.
    const flipped = await db
      .update(studioAssets)
      .set({ moderation: 'hidden', updated_at: new Date() })
      .where(
        and(
          eq(studioAssets.id, body.targetId),
          eq(studioAssets.visibility, 'public'),
          eq(studioAssets.moderation, 'ok'),
          notTrashed(studioAssets),
          sql`(SELECT count(DISTINCT cr.reporter_id) FROM content_reports cr
               WHERE cr.kind = 'studio_asset' AND cr.target_id = ${body.targetId}
                 AND cr.status = 'open') >= ${AUTO_HIDE_REPORT_THRESHOLD}`
        )
      )
      .returning({ id: studioAssets.id });
    hidden = flipped.length > 0;
  }

  return { ok: true, value: { stored, hidden } };
}

interface GroupRow extends Record<string, unknown> {
  kind: ContentReportKind;
  target_id: string;
  report_count: number;
  latest_at: Date | string;
  excerpt: string | null;
  group_id: string | null;
  thread_id: string | null;
  notes: Array<{ note: string; createdAt: string }> | null;
  reasons: Array<{ reason: ContentReportReason; count: number }>;
}

export async function listReportGroups(query: AdminReportListQuery): Promise<AdminReportGroup[]> {
  const db = getDrizzleInstance();
  const kindFilter = query.kind ? sql`AND kind = ${query.kind}` : sql``;
  const result = await db.execute<GroupRow>(sql`
    WITH r AS (
      SELECT * FROM content_reports WHERE status = ${query.status} ${kindFilter}
    ),
    reasons AS (
      SELECT kind, target_id,
             jsonb_agg(jsonb_build_object('reason', reason, 'count', n) ORDER BY n DESC, reason)
               AS reasons
      FROM (SELECT kind, target_id, reason, count(*)::int AS n
            FROM r GROUP BY kind, target_id, reason) per_reason
      GROUP BY kind, target_id
    )
    SELECT r.kind, r.target_id,
           count(*)::int AS report_count,
           max(r.created_at) AS latest_at,
           (array_agg(r.excerpt ORDER BY r.created_at DESC)
              FILTER (WHERE r.excerpt IS NOT NULL))[1] AS excerpt,
           (array_agg(r.group_id::text ORDER BY r.created_at DESC)
              FILTER (WHERE r.group_id IS NOT NULL))[1] AS group_id,
           (array_agg(r.thread_id ORDER BY r.created_at DESC)
              FILTER (WHERE r.thread_id IS NOT NULL))[1] AS thread_id,
           jsonb_agg(jsonb_build_object('note', r.note, 'createdAt', r.created_at)
                     ORDER BY r.created_at DESC) FILTER (WHERE r.note IS NOT NULL) AS notes,
           reasons.reasons
    FROM r JOIN reasons USING (kind, target_id)
    GROUP BY r.kind, r.target_id, reasons.reasons
    ORDER BY latest_at DESC
    LIMIT ${LIST_LIMIT}`);

  const assetIds = result.rows
    .filter((g) => g.kind === 'studio_asset' && isRowId(g.target_id))
    .map((g) => g.target_id);
  const targets = await loadStudioAssetTargets(assetIds);

  return result.rows.map((g) => ({
    kind: g.kind,
    targetId: g.target_id,
    reportCount: Number(g.report_count),
    reasons: g.reasons,
    latestAt: new Date(g.latest_at).toISOString(),
    notes: (g.notes ?? []).slice(0, NOTES_PER_GROUP).map((n) => ({
      note: n.note,
      createdAt: new Date(n.createdAt).toISOString(),
    })),
    status: query.status,
    excerpt: g.excerpt,
    groupId: g.group_id,
    threadId: g.thread_id,
    target: g.kind === 'studio_asset' ? (targets.get(g.target_id) ?? null) : null,
  }));
}

async function loadStudioAssetTargets(
  ids: string[]
): Promise<Map<string, AdminReportStudioAssetTarget>> {
  if (ids.length === 0) return new Map();
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      id: studioAssets.id,
      title: studioAssets.title,
      src: studioAssets.src,
      kind: studioAssets.kind,
      moderation: studioAssets.moderation,
      ownerId: studioAssets.user_id,
      ownerName: profiles.display_name,
      deletedAt: studioAssets.deleted_at,
      shareToken: sharedMedia.share_token,
      mediaCreatedAt: sharedMedia.created_at,
      mediaMetadata: sharedMedia.image_metadata,
    })
    .from(studioAssets)
    .leftJoin(sharedMedia, and(eq(sharedMedia.id, studioAssets.media_id), notTrashed(sharedMedia)))
    .leftJoin(profiles, eq(profiles.id, studioAssets.user_id))
    .where(inArray(studioAssets.id, ids));

  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        title: r.title,
        src: r.src,
        thumbUrl: r.shareToken
          ? buildThumbnailTileUrl(
              'media',
              r.shareToken,
              versionFromShareRow({ created_at: r.mediaCreatedAt, image_metadata: r.mediaMetadata })
            )
          : null,
        kind: r.kind,
        moderation: r.moderation,
        ownerId: r.ownerId,
        ownerName: r.ownerName?.trim() || null,
        trashed: r.deletedAt !== null,
      },
    ])
  );
}

const NO_OPEN_REPORTS = fail(404, 'Keine offenen Meldungen für diesen Inhalt.');

const ACTION_OUTCOME = {
  remove: { status: 'resolved', resolution: 'removed' },
  restore: { status: 'resolved', resolution: 'restored' },
  dismiss: { status: 'dismissed', resolution: 'dismissed' },
} as const;

export async function resolveReports(
  adminId: string,
  body: AdminReportResolveBody
): Promise<ContentReportResult<AdminReportResolveResponse, 400 | 404>> {
  const isAsset = body.kind === 'studio_asset';
  if (!isAsset && body.action === 'restore') {
    return fail(400, 'Wiederherstellen gibt es nur für Sticker und Hintergründe.');
  }
  const assetId = isAsset && isRowId(body.targetId) ? body.targetId : null;

  const db = getDrizzleInstance();
  return db.transaction(async (tx) => {
    const outcome = ACTION_OUTCOME[body.action];
    const closed = await tx
      .update(contentReports)
      .set({
        status: outcome.status,
        resolution: outcome.resolution,
        resolved_by: adminId,
        resolved_at: new Date(),
      })
      .where(
        and(
          eq(contentReports.kind, body.kind),
          eq(contentReports.target_id, body.targetId),
          eq(contentReports.status, 'open')
        )
      )
      .returning({ id: contentReports.id });

    // A stale or repeated dismiss must not lift a hide it did not decide on.
    if (body.action === 'dismiss' && closed.length === 0) return NO_OPEN_REPORTS;

    let moderation: StudioAssetModeration | null = null;
    // Trashed assets too: the owner trashing a reported asset must not dodge its removal.
    if (assetId) {
      if (body.action === 'remove' || body.action === 'restore') {
        await tx
          .update(studioAssets)
          .set({ moderation: body.action === 'remove' ? 'removed' : 'ok', updated_at: new Date() })
          .where(eq(studioAssets.id, assetId));
      } else {
        // Only the auto-hide sets 'hidden'; dismissing the reports lifts it.
        await tx
          .update(studioAssets)
          .set({ moderation: 'ok', updated_at: new Date() })
          .where(and(eq(studioAssets.id, assetId), eq(studioAssets.moderation, 'hidden')));
      }
      const [row] = await tx
        .select({ moderation: studioAssets.moderation })
        .from(studioAssets)
        .where(eq(studioAssets.id, assetId))
        .limit(1);
      moderation = row?.moderation ?? null;
    }

    if (closed.length === 0 && moderation === null) return NO_OPEN_REPORTS;
    return { ok: true as const, value: { resolved: closed.length, moderation } };
  });
}

/** Targets with at least one open report — what the admin tab badge counts. */
export async function countOpenReportTargets(): Promise<number> {
  const db = getDrizzleInstance();
  const [row] = await db
    .select({
      open: sql<number>`count(DISTINCT (${contentReports.kind}, ${contentReports.target_id}))::int`,
    })
    .from(contentReports)
    .where(eq(contentReports.status, 'open'));
  return Number(row?.open ?? 0);
}
