/**
 * Reports on project content — feed posts, shares and their comments (#5948).
 *
 * A project is closed, so these kinds get no auto-hide: the report reaches the
 * project's admins, who can delete the item themselves. Before it is stored,
 * the server checks what the client cannot be trusted with: the item exists in
 * a live project the reporter is an active member of, and it is not their own.
 * The project comes from the item, never from the request body.
 */
import { type ContentReportKind, type ContentReportReason } from '@gruenerator/contracts';
import { CONTENT_REPORT_REASON_LABELS } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { notifyGroupAdmins } from '../notifications/index.js';
import { isRowId } from '../trash/ownedRowTrash.js';

export const PROJECT_REPORT_KINDS = [
  'group_post',
  'group_share',
  'group_comment',
] as const satisfies readonly ContentReportKind[];
export type ProjectReportKind = (typeof PROJECT_REPORT_KINDS)[number];

export function isProjectReportKind(kind: ContentReportKind): kind is ProjectReportKind {
  return (PROJECT_REPORT_KINDS as readonly string[]).includes(kind);
}

export interface ProjectReportTarget {
  groupId: string;
  groupName: string;
  /** The author or sharer; null once the person is gone. */
  ownerId: string | null;
}

/** The live project the reporter belongs to, joined to the reported row. */
const MEMBER_SCOPE = `
  JOIN groups g ON g.id = t.group_id AND g.deleted_at IS NULL
  JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $2::uuid AND gm.is_active = TRUE
  WHERE t.id = $1::uuid`;

const TARGET_SQL: Record<ProjectReportKind, string> = {
  group_post: `SELECT g.id::text AS group_id, g.name, t.author_id::text AS owner_id
                 FROM group_posts t ${MEMBER_SCOPE}`,
  group_share: `SELECT g.id::text AS group_id, g.name, t.shared_by_user_id::text AS owner_id
                  FROM group_content_shares t ${MEMBER_SCOPE}`,
  group_comment: `SELECT g.id::text AS group_id, g.name, t.user_id::text AS owner_id
                    FROM group_share_comments t ${MEMBER_SCOPE}`,
};

export async function loadProjectReportTarget(
  kind: ProjectReportKind,
  targetId: string,
  reporterId: string
): Promise<ProjectReportTarget | null> {
  if (!isRowId(targetId)) return null;
  const row = (await getPostgresInstance().queryOne(TARGET_SQL[kind], [targetId, reporterId])) as {
    group_id: string;
    name: string | null;
    owner_id: string | null;
  } | null;
  if (!row) return null;
  return { groupId: row.group_id, groupName: row.name ?? 'Projekt', ownerId: row.owner_id };
}

const NOUN: Record<ProjectReportKind, string> = {
  group_post: 'Ein Beitrag',
  group_share: 'Eine Freigabe',
  group_comment: 'Ein Kommentar',
};

/**
 * Tells the project's admins. Neither the reporter nor the author is named,
 * and the author is not told — the admins decide what happens next.
 */
export async function notifyProjectAdminsOfReport(params: {
  kind: ProjectReportKind;
  targetId: string;
  reason: ContentReportReason;
  reporterId: string;
  target: ProjectReportTarget;
}): Promise<void> {
  const { kind, targetId, reason, reporterId, target } = params;
  await notifyGroupAdmins({
    groupId: target.groupId,
    excludeUserId: reporterId,
    skipUserIds: target.ownerId ? [target.ownerId] : [],
    type: 'group_content_reported',
    title: 'Inhalt gemeldet',
    body: `${NOUN[kind]} in „${target.groupName}" wurde gemeldet: ${CONTENT_REPORT_REASON_LABELS[reason]}`,
    actionUrl: `/gruppen/${target.groupId}`,
    metadata: { reportKind: kind, targetId },
  });
}
