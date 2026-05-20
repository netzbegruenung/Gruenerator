/**
 * Group membership helper + (now-empty) legacy core router.
 *
 * All group CRUD / join / leave / members / role / link routes were migrated to
 * the ts-rest contract router (`groupsContract/`). This module retains
 * only the shared membership-check helper — used by the contract router, the
 * content router, and the avatar router — and an empty Express router that is
 * kept mounted for composition compatibility (`groups/index.ts`).
 */

import express, { type Router } from 'express';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';

const router: Router = express.Router();

interface MembershipCheckResult {
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

export default router;
