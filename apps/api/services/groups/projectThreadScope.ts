/**
 * Wem das Material eines Projekts im Chat zusteht: aktiven Mitgliedern des
 * Projekts, in dem der Thread liegt, und nur dann, wenn der Thread ihnen gehört
 * ODER ein Team-Chat ist (Freigabe des Threads ins Projekt mit Schreibrecht).
 * Ein privater Chat eines anderen Mitglieds öffnet das Projekt nicht.
 *
 * Reiner String-Baustein mit `$n`-Parameternamen, damit die Leser einzelne
 * Statements bleiben. Die Verknüpfung endet bei `group_memberships gm`; der
 * Aufrufer hängt weitere JOINs und sein WHERE an.
 */

/** EXISTS-Bedingung: der Thread `t` ist ein Team-Chat des Projekts (lesen + schreiben). */
export function teamChatShareExistsSql(threadAlias = 't', groupIdExpr = 'g.id'): string {
  return `EXISTS (
           SELECT 1 FROM group_content_shares tcs
            WHERE tcs.content_type = 'chat_threads'
              AND tcs.content_id = ${threadAlias}.id::text
              AND tcs.group_id = ${groupIdExpr}
              AND COALESCE((tcs.permissions->>'read')::boolean, true) = true
              AND COALESCE((tcs.permissions->>'write')::boolean, true) = true
         )`;
}

export function projectThreadScopeSql(threadParam: string, userParam: string): string {
  return `chat_threads t
       JOIN groups g ON g.id = t.group_id AND g.deleted_at IS NULL
         AND COALESCE(g.is_active, TRUE) = TRUE
       JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = ${userParam}::uuid
         AND gm.is_active = TRUE
         AND t.id = ${threadParam}::uuid AND t.deleted_at IS NULL
         AND (t.user_id::text = ${userParam}::text OR ${teamChatShareExistsSql('t', 'g.id')})`;
}
