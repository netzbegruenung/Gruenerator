/**
 * Group write operations (create / join by invite token), extracted from the
 * ts-rest handlers so both the HTTP routes (`groupsContract/core.ts`) and the
 * chat loop's `groups` tool share ONE code path — no duplicated SQL. Read-only
 * helpers live in the sibling `groupQueries.ts`.
 */
import crypto from 'crypto';

import { type CreateGroupBody } from '@gruenerator/contracts';
import { generateSlugSuffix } from '@gruenerator/shared/utils';
import { v4 as uuidv4 } from 'uuid';

import { type GroupRow } from '../../database/schema/groups.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { notifyGroupMembers } from '../notifications/index.js';

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

  return postgres.transaction(async (client) => {
    const group = (await postgres.transactionQueryOne(
      client,
      `INSERT INTO groups (id, name, created_by, join_token, description, slug_suffix)
         VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, created_at, created_by, join_token, slug_suffix`,
      [groupId, name, userId, joinToken, input.description ?? null, slugSuffix]
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
