/**
 * Mitgliedsprüfung für Gruppen — aus `routes/auth/groups/groupCore.ts`
 * hierher gezogen, damit die Dienste unter `services/groups/` (Inhalte teilen,
 * Sichtbarkeit, Stammdaten) nicht in die Routen-Schicht zurückgreifen müssen.
 * `groupCore.ts` re-exportiert sie, die bestehenden Router-Importe bleiben
 * unverändert.
 *
 * Wirft statt zurückzugeben: die ts-rest-Handler übersetzen den Wurf über
 * `groupErrorResponse` in ein 403 mit genau dieser Meldung — die Texte sind
 * deshalb Teil des Vertrags und dürfen sich nicht ändern.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { isInstanceAdmin } from '../../utils/adminAuthz.js';

/** Shown whenever a write hits an archived project. */
export const ARCHIVED_PROJECT_READ_ONLY =
  'Dieses Projekt ist archiviert und nur noch lesbar. Stelle es wieder her, um etwas hinzuzufügen.';

export interface MembershipCheckResult {
  postgres: ReturnType<typeof getPostgresInstance>;
  membership: { role: string };
  /** Admin in this group: role/creator, or — in the system group — instance admin only. */
  isAdmin: boolean;
  isSystem: boolean;
  /** Archived by an admin: readable, but no new content goes in. */
  isArchived: boolean;
}

/**
 * Get the PostgreSQL instance and verify the user's membership in a group.
 * Throws when the user is not a member, or (when `requireAdmin`) not an
 * admin/creator. In the system group, group roles and `created_by` carry no
 * rights; only instance admins count as admins there. Callers map the throw
 * to an HTTP 403.
 */
export async function getPostgresAndCheckMembership(
  groupId: string,
  userId: string,
  requireAdmin: boolean = false
): Promise<MembershipCheckResult> {
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const row = (await postgres.queryOne(
    `SELECT gm.role, g.created_by, g.is_system, g.archived_at
     FROM group_memberships gm JOIN groups g ON g.id = gm.group_id
     WHERE gm.group_id = $1 AND gm.user_id = $2 AND g.deleted_at IS NULL`,
    [groupId, userId],
    { table: 'group_memberships' }
  )) as {
    role: string;
    created_by: string | null;
    is_system: boolean | null;
    archived_at: string | Date | null;
  } | null;

  if (!row) {
    throw new Error('Du bist nicht Mitglied dieses Projekts.');
  }

  const isSystem = Boolean(row.is_system);
  const isAdmin = isSystem
    ? await isInstanceAdmin(userId)
    : row.role === 'admin' || row.created_by === userId;

  if (requireAdmin && !isAdmin) {
    throw new Error('Keine Berechtigung für diese Aktion.');
  }

  return {
    postgres,
    membership: { role: row.role },
    isAdmin,
    isSystem,
    isArchived: row.archived_at != null,
  };
}

/**
 * Gate for every write that puts content into a group (`group_content_shares`,
 * filing a chat into a Projekt). Members may share — except in the system
 * group, where only instance admins may. `groupShareWriteGuard.vitest.ts`
 * checks that every share INSERT goes through here.
 */
export async function assertCanShareToGroup(
  groupId: string,
  userId: string
): Promise<MembershipCheckResult> {
  const result = await getPostgresAndCheckMembership(groupId, userId);
  if (result.isSystem && !result.isAdmin) {
    throw new Error('Keine Berechtigung für diese Aktion.');
  }
  if (result.isArchived) throw new Error(ARCHIVED_PROJECT_READ_ONLY);
  return result;
}

export interface ShareTargetGroup {
  id: string;
  name: string;
  role: string;
  /** Projekt (nicht das System-Projekt): Docs gehen dort mit Schreibrecht hinein. */
  team: boolean;
}

/**
 * The groups a user may pick as a share target, for the share dialogs. Leaves
 * out the system group unless the user is an instance admin — the same rule
 * `assertCanShareToGroup` enforces on the write.
 */
export async function listShareTargetGroups(userId: string): Promise<ShareTargetGroup[]> {
  const postgres = getPostgresInstance();
  const rows = (await postgres.query(
    `SELECT g.id, g.name, gm.role, g.is_system
       FROM groups g
       INNER JOIN group_memberships gm ON gm.group_id = g.id
      WHERE gm.user_id = $1 AND gm.is_active = TRUE AND g.deleted_at IS NULL
        AND g.archived_at IS NULL
      ORDER BY g.name ASC`,
    [userId]
  )) as Array<Omit<ShareTargetGroup, 'team'> & { is_system: boolean | null }>;
  const canShareToSystem = rows.some((r) => r.is_system) && (await isInstanceAdmin(userId));
  return rows
    .filter((r) => !r.is_system || canShareToSystem)
    .map((r) => ({
      id: String(r.id),
      name: String(r.name),
      role: String(r.role ?? 'member'),
      team: !r.is_system,
    }));
}
