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

export interface MembershipCheckResult {
  postgres: ReturnType<typeof getPostgresInstance>;
  membership: { role: string };
}

/**
 * Get the PostgreSQL instance and verify the user's membership in a group.
 * Throws when the user is not a member, or (when `requireAdmin`) not an
 * admin/creator. Callers map the throw to an HTTP 403.
 */
export async function getPostgresAndCheckMembership(
  groupId: string,
  userId: string,
  requireAdmin: boolean = false
): Promise<MembershipCheckResult> {
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const membership = (await postgres.queryOne(
    'SELECT role FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [groupId, userId],
    { table: 'group_memberships' }
  )) as { role: string } | null;

  if (!membership) {
    throw new Error('Du bist nicht Mitglied dieser Gruppe.');
  }

  if (requireAdmin && membership.role !== 'admin') {
    const group = await postgres.queryOne(
      'SELECT created_by FROM groups WHERE id = $1',
      [groupId],
      { table: 'groups' }
    );

    if (!group || group.created_by !== userId) {
      throw new Error('Keine Berechtigung für diese Aktion.');
    }
  }

  return { postgres, membership };
}
