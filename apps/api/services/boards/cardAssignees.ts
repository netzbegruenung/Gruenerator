/**
 * Wen man einer Board-Karte zuweisen kann, und wie aus einem genannten Namen
 * eine Person wird.
 *
 * Die zuweisbaren Personen sind dieselben wie im Personen-Auswahl des Web-Boards
 * (`getAssignableMembers`): Besitzerin, direkt Berechtigte und die Mitglieder der
 * Projekte, in die das Board geteilt ist — nie das System-Projekt, das alle
 * Profile enthält. Der Chat schrieb bis 11/2026 den genannten Namen als Text in
 * die Zelle; Tagesbriefing, Benachrichtigung und Fälligkeits-Erinnerung zählen
 * aber nur Profil-Ids, solche Karten blieben für sie unsichtbar.
 */
import { type AssignableMember } from '@gruenerator/contracts';
import { type BoardAssignee } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const BOARDS_SUBTYPE = 'boards';

/** Die Personen, die das Board sehen und deshalb zuständig sein können (ohne den Bot). */
export async function listAssignableMembers(boardId: string): Promise<AssignableMember[]> {
  return getPostgresInstance().query<AssignableMember>(
    `WITH assignable AS (
         SELECT cd.created_by AS user_id, 'owner'::text AS source
         FROM collaborative_documents cd
         WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false

         UNION

         SELECT perm_key::uuid AS user_id, 'direct'::text AS source
         FROM collaborative_documents cd,
              LATERAL jsonb_object_keys(COALESCE(cd.permissions, '{}'::jsonb)) AS perm_key
         WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false
           AND perm_key ~ '^[0-9a-f-]{36}$'

         UNION

         SELECT gm.user_id, 'group'::text AS source
         FROM group_content_shares gcs
         INNER JOIN group_memberships gm
           ON gm.group_id = gcs.group_id
          AND gm.is_active = TRUE
         INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
         WHERE gcs.content_type = 'collaborative_documents'
           AND gcs.content_id = $1::text
           -- The system group holds every user; never expose them as assignees.
           AND NOT g.is_system
       )
       SELECT DISTINCT ON (a.user_id)
         a.user_id,
         a.source,
         p.first_name,
         p.display_name,
         COALESCE(p.avatar_robot_id, 1) AS avatar_robot_id
       FROM assignable a
       INNER JOIN profiles p ON p.id = a.user_id
       ORDER BY a.user_id,
                CASE a.source WHEN 'owner' THEN 0 WHEN 'direct' THEN 1 ELSE 2 END`,
    [boardId, BOARDS_SUBTYPE]
  );
}

/** Die aktiven Mitglieder eines lebenden Projekts — im Projekt-Chat gehen sie bei Namensgleichheit vor. */
export async function listActiveProjectMemberIds(groupId: string): Promise<Set<string>> {
  const rows = await getPostgresInstance().query<{ user_id: string }>(
    `SELECT gm.user_id
       FROM group_memberships gm
       JOIN groups g ON g.id = gm.group_id AND g.deleted_at IS NULL
      WHERE gm.group_id = $1::uuid AND gm.is_active = TRUE`,
    [groupId]
  );
  return new Set(rows.map((r) => r.user_id));
}

function memberName(m: AssignableMember): string {
  return (m.display_name || m.first_name || '').trim();
}

export function toBoardAssignee(m: AssignableMember): BoardAssignee {
  return { id: m.user_id, name: memberName(m) || 'Unbekannt', avatarRobotId: m.avatar_robot_id };
}

export type AssigneeMatch =
  | { kind: 'one'; assignee: BoardAssignee }
  | { kind: 'ambiguous'; candidates: BoardAssignee[] }
  | { kind: 'none' };

/**
 * Welche zuweisbare Person mit `query` gemeint ist: zuerst die Profil-Id, dann
 * der volle Anzeige- oder Vorname, dann ein Wortanfang im Anzeigenamen („Anna"
 * für „Anna Berg"). Mehrere Treffer engt `preferredIds` (die Mitglieder des
 * Projekts, in dem der Chat liegt) ein; bleiben mehrere, entscheidet die Person.
 */
export function matchAssignee(
  query: string,
  members: readonly AssignableMember[],
  preferredIds: ReadonlySet<string> | null = null
): AssigneeMatch {
  const q = query.trim().toLocaleLowerCase('de-DE');
  if (!q) return { kind: 'none' };

  const byId = members.find((m) => m.user_id === query.trim());
  if (byId) return { kind: 'one', assignee: toBoardAssignee(byId) };

  const lower = (s: string | null) => (s ?? '').trim().toLocaleLowerCase('de-DE');
  const exact = members.filter((m) => lower(m.display_name) === q || lower(m.first_name) === q);
  const hits = exact.length
    ? exact
    : members.filter((m) =>
        lower(m.display_name)
          .split(/\s+/)
          .some((word, i, words) => words.slice(i).join(' ').startsWith(q))
      );

  if (hits.length === 0) return { kind: 'none' };
  if (hits.length === 1) return { kind: 'one', assignee: toBoardAssignee(hits[0]) };
  const preferred = preferredIds ? hits.filter((m) => preferredIds.has(m.user_id)) : [];
  if (preferred.length === 1) return { kind: 'one', assignee: toBoardAssignee(preferred[0]) };
  return {
    kind: 'ambiguous',
    candidates: (preferred.length > 1 ? preferred : hits).map(toBoardAssignee),
  };
}
