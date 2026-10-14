/**
 * Stored content reports and the auto-hide for public studio assets.
 *
 * One row per reporter and target (`uq_content_reports_reporter_target`), so a
 * repeated report is a no-op.
 */
import { type ContentReportCreate } from '@gruenerator/contracts';
import { and, eq, sql } from 'drizzle-orm';

import { contentReports } from '../../database/schema/contentReports.js';
import { studioAssets } from '../../database/schema/studioAssets.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { notTrashed } from '../../database/trash.js';
import { isRowId } from '../trash/ownedRowTrash.js';

/** Distinct open reporters that hide a public studio asset until an admin looks. */
export const AUTO_HIDE_REPORT_THRESHOLD = 3;

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
