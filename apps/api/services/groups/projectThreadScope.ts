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

/**
 * Der Thread `threadAlias` ist ein Team-Chat eines Projekts, in dem die Person
 * (`userParam`) aktives Mitglied ist. Für Leser, die einzelne Threads laden,
 * deren Id aus dem Projekt-Scope kommt (Recall, Tiefenlesen).
 */
export function teamChatMemberSql(threadAlias: string, userParam: string): string {
  return `EXISTS (
           SELECT 1 FROM groups tg
             JOIN group_memberships tgm ON tgm.group_id = tg.id
              AND tgm.user_id = ${userParam}::uuid AND tgm.is_active = TRUE
            WHERE tg.id = ${threadAlias}.group_id AND tg.deleted_at IS NULL
              AND COALESCE(tg.is_active, TRUE) = TRUE
              AND ${teamChatShareExistsSql(threadAlias, 'tg.id')}
         )`;
}

/**
 * Besitz eines Threads: `user_id` ist die Person UND sie ist nicht aus dem
 * Projekt ausgetreten, dem der Thread als Team-Chat gehört. Ein Team-Chat
 * bleibt beim Projekt — wer geht, verliert ihn samt Besitzerrechten, sonst
 * läse die Person weiter mit, was das Team schreibt (#5678). Ein privater
 * Projekt-Chat bleibt dagegen bei seiner Besitzerin, auch nach dem Austritt;
 * ein gelöschtes oder stillgelegtes Projekt macht den Chat wieder privat.
 *
 * Vergleiche laufen über `::text`, damit der Baustein neben `user_id = $n`
 * (varchar) im selben Statement stehen kann. Hocuspocus spiegelt die Regel in
 * `services/hocuspocus/src/auth.ts`.
 */
export function ownsThreadSql(threadAlias: string, userParam: string): string {
  return `(${threadAlias}.user_id::text = ${userParam}::text AND NOT EXISTS (
           SELECT 1 FROM groups lg2
            WHERE lg2.id = ${threadAlias}.group_id AND lg2.deleted_at IS NULL
              AND COALESCE(lg2.is_active, TRUE) = TRUE
              AND ${teamChatShareExistsSql(threadAlias, 'lg2.id')}
              AND NOT EXISTS (
                SELECT 1 FROM group_memberships lgm
                 WHERE lgm.group_id = lg2.id AND lgm.user_id::text = ${userParam}::text
                   AND lgm.is_active = TRUE
              )
         ))`;
}
