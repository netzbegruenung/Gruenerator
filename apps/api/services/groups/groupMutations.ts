/**
 * Group write operations (create / join by invite token / update info / set
 * visibility), extracted from the ts-rest handlers so both the HTTP routes
 * (`groupsContract/core.ts`, `groupsContract/discovery.ts`) and the chat
 * loop's `groups` tool share ONE code path — no duplicated SQL. Read-only
 * helpers live in the sibling `groupQueries.ts`.
 */
import crypto from 'crypto';

import { type CreateGroupBody, type GroupAudience } from '@gruenerator/contracts';
import { generateSlugSuffix } from '@gruenerator/shared/utils';
import { v4 as uuidv4 } from 'uuid';

import { type GroupRow } from '../../database/schema/groups.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { notifyGroupMembers } from '../notifications/index.js';

import { getPostgresAndCheckMembership } from './groupMembership.js';

/** The columns the create insert returns; `created_at` is a raw pg value. */
export type CreatedGroupRow = Pick<
  GroupRow,
  'id' | 'name' | 'description' | 'created_by' | 'join_token' | 'slug_suffix'
> & { created_at: string | Date | null };

/** Minimal group reference (matches `groupTokenRefSchema`: `{ id, name }`). */
export interface GroupTokenRef {
  id: string;
  name: string;
}

export interface JoinGroupOutcome {
  group: GroupTokenRef;
  alreadyMember: boolean;
}

/**
 * Create a group owned by `userId`: inserts the group + the creator's admin
 * membership in one transaction. Unlike the old inline handler, the caller's
 * `description` is persisted (the handler hard-coded `null`).
 */
export async function createGroupForUser(
  userId: string,
  input: CreateGroupBody
): Promise<CreatedGroupRow> {
  const name = input.name.trim();
  const joinToken = crypto.randomBytes(16).toString('hex');
  const groupId = uuidv4();
  const slugSuffix = generateSlugSuffix();
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  // A personal Space is a solo group: hidden from team discovery, lean UI.
  const groupType = input.groupType === 'personal' ? 'personal' : 'standard';

  return postgres.transaction(async (client) => {
    const group = (await postgres.transactionQueryOne(
      client,
      `INSERT INTO groups (id, name, created_by, join_token, description, slug_suffix, group_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, created_at, created_by, join_token, slug_suffix`,
      [groupId, name, userId, joinToken, input.description ?? null, slugSuffix, groupType]
    )) as CreatedGroupRow | null;

    if (!group) throw new Error('Failed to create group');

    await postgres.transactionExec(
      client,
      'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
      [group.id, userId, 'admin']
    );

    return group;
  });
}

/** Resolve a group by its invite token (the `join_token` column). */
export async function getGroupByToken(joinToken: string): Promise<GroupTokenRef | null> {
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();
  return (await postgres.queryOne(
    'SELECT id, name FROM groups WHERE join_token = $1',
    [joinToken.trim()],
    { table: 'groups' }
  )) as GroupTokenRef | null;
}

/**
 * Join a group by invite token as `userId`. Idempotent: an existing member is
 * returned with `alreadyMember: true` and no second insert. Returns `null` when
 * the token resolves to no group. Fires a `group_member_joined` notification.
 */
export async function joinGroupByToken(
  userId: string,
  joinToken: string,
  joinerName: string
): Promise<JoinGroupOutcome | null> {
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const group = await getGroupByToken(joinToken);
  if (!group) return null;

  const existingMembership = await postgres.queryOne(
    'SELECT group_id FROM group_memberships WHERE group_id = $1 AND user_id = $2',
    [group.id, userId],
    { table: 'group_memberships' }
  );
  if (existingMembership) {
    return { group, alreadyMember: true };
  }

  await postgres.exec(
    'INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, $3)',
    [group.id, userId, 'member']
  );

  void notifyGroupMembers({
    groupId: group.id,
    excludeUserId: userId,
    type: 'group_member_joined',
    title: 'Neues Mitglied',
    body: `${joinerName} ist „${group.name}" beigetreten`,
    actionUrl: `/gruppen/${group.id}`,
  }).catch(() => {});

  return { group, alreadyMember: false };
}

// ---------------------------------------------------------------------------
// Stammdaten und Sichtbarkeit — aus `groupsContract/core.ts` (updateInfo) und
// `groupsContract/discovery.ts` (setVisibility) gezogen, damit das `groups`-
// Werkzeug im Chat, der MCP-Server und die HTTP-Route denselben Pfad fahren.
// Statuscodes und Meldungen sind die der Handler; die übersetzen nur noch.
// ---------------------------------------------------------------------------

export interface UpdateGroupInfoInput {
  name?: string | null;
  description?: string | null;
  settings?: Record<string, unknown> | null;
}

export interface UpdateGroupInfoOutcome {
  status: 200 | 400 | 403;
  success: boolean;
  message: string;
}

/**
 * Name, Beschreibung und/oder Settings eines Projekts ändern — nur Admins und
 * die Gründer*in. `description: null` leert das Feld, `undefined` lässt es in
 * Ruhe (der Handler unterscheidet die beiden über `!== undefined`).
 */
export async function updateGroupInfo(
  groupId: string,
  userId: string,
  input: UpdateGroupInfoInput
): Promise<UpdateGroupInfoOutcome> {
  const { name, description, settings } = input;
  const postgres = getPostgresInstance();
  await postgres.ensureInitialized();

  const membershipAndGroup = (await postgres.queryOne(
    `SELECT gm.role, g.created_by
       FROM group_memberships gm
       JOIN groups g ON g.id = gm.group_id
      WHERE gm.group_id = $1 AND gm.user_id = $2`,
    [groupId, userId],
    { table: 'group_memberships' }
  )) as { role: string; created_by: string } | null;

  if (!membershipAndGroup) {
    return { status: 403, success: false, message: 'Du bist nicht Mitglied dieser Gruppe.' };
  }
  if (membershipAndGroup.role !== 'admin' && membershipAndGroup.created_by !== userId) {
    return {
      status: 403,
      success: false,
      message: 'Keine Berechtigung zum Ändern der Gruppendetails.',
    };
  }

  const updateFields: string[] = [];
  const updateValues: Array<string | null> = [];
  let paramIndex = 1;

  if (name != null) {
    if (!name.trim()) {
      return { status: 400, success: false, message: 'Gruppenname darf nicht leer sein.' };
    }
    updateFields.push(`name = $${paramIndex++}`);
    updateValues.push(name.trim());
  }
  if (description !== undefined) {
    updateFields.push(`description = $${paramIndex++}`);
    updateValues.push(description?.trim() || null);
  }
  if (settings != null) {
    updateFields.push(`settings = $${paramIndex++}`);
    updateValues.push(JSON.stringify(settings));
  }

  if (updateFields.length === 0) {
    return { status: 400, success: false, message: 'Keine Änderungen angegeben.' };
  }

  updateValues.push(groupId);
  const result = await postgres.exec(
    `UPDATE groups SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
    updateValues
  );
  if (result.changes === 0) throw new Error('Group not found or no changes made');

  return { status: 200, success: true, message: 'Gruppendetails erfolgreich aktualisiert.' };
}

export interface GroupVisibility {
  is_public: boolean;
  audience: GroupAudience;
}

/**
 * Ein Projekt öffentlich listen (Beitrittsanfragen möglich) oder wieder
 * privat stellen. Die Mitgliedsprüfung wirft wie überall (Admin-Pflicht) —
 * der Handler macht daraus ein 403. `null` heißt: Gruppe nicht gefunden.
 */
export async function setGroupVisibility(
  groupId: string,
  userId: string,
  input: GroupVisibility
): Promise<GroupVisibility | null> {
  const { postgres } = await getPostgresAndCheckMembership(groupId, userId, true);
  return (await postgres.queryOne(
    `UPDATE groups SET is_public = $1, audience = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
     RETURNING is_public, audience`,
    [input.is_public, input.audience, groupId],
    { table: 'groups' }
  )) as GroupVisibility | null;
}
