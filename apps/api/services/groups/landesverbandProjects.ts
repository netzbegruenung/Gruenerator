/**
 * Ein Projekt je Landesverband, das von selbst entsteht, und wer automatisch
 * hineinkommt.
 *
 * **Zugang (Sicherheitsentscheidung 26.11.2026):** Automatisch Admin wird nur,
 * wer eine Rolle in der Landesgeschäftsstelle trägt **und** eine bestätigte
 * Mailadresse (`profiles.email_verified`) genau auf der Domain dieses
 * Landesverbands hat (`landesverbandBundeslandForEmail`, Tabelle
 * `LV_MAIL_DOMAINS` in `@gruenerator/shared/roles`). Die Rolle allein reicht
 * nicht, sie ist selbst eingetragen. Alle anderen kommen nur über den
 * Einladungslink des Projekts hinein. Umgekehrt bekommt, wer eine solche
 * bestätigte Adresse hat, die Rolle ergänzt, falls sie fehlt. Österreich hat
 * keine LV-Domains (`gruene.at` ist auch die Bundespartei) und damit keine
 * automatische Aufnahme.
 *
 * Bewusst ein gewöhnliches Projekt, kein System-Projekt: Beim Anlegen kommen
 * die Rezepte und das Notebook des Landesverbands als einzelne Freigaben hinein
 * (`group_content_shares`), danach gehört es den Admins. Sie dürfen umbenennen,
 * Rezepte entfernen, einladen und löschen. Deshalb setzt dieses Modul nach dem
 * Anlegen nichts mehr am Projekt:
 *
 * - `groups.landesverband` bleibt leer. Die Bindung mischt die LV-Rezepte im
 *   Chat immer dazu (`streamContext`), ein entferntes Rezept käme so zurück.
 *   Admins können sie in den Projekt-Einstellungen selbst setzen.
 * - Wiedergefunden wird das Projekt über `groups.auto_landesverband`
 *   (eindeutig, auch über den Papierkorb hinweg): Ein gelöschtes Projekt
 *   entsteht nicht neu, solange seine Zeile existiert.
 * - Mitgliedschaft nur per `ON CONFLICT DO NOTHING`: Wer ausgetreten ist
 *   (`is_active = false`) oder herabgestuft wurde, bleibt es.
 * - Wer Rolle oder Adresse verliert, bleibt Mitglied. Entfernen ist Sache der
 *   Admins.
 */
import crypto from 'crypto';

import {
  isLandesverbandRolle,
  LANDESVERBAENDE,
  landesverbandIdsForRoles,
  landesverbandRecipeMentions,
} from '@gruenerator/shared/agents';
import { isNotebookOfferedIn } from '@gruenerator/shared/notebooks';
import {
  landesverbandBundeslandForEmail,
  suggestedRoleForEmail,
  type UserRole,
} from '@gruenerator/shared/roles';
import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { CURRENT_INSTANCE } from '../../config/instance.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { deriveLandesverbandFromRoles } from '../landesverband/LandesverbandDerivationService.js';

const log = createLogger('landesverbandProjects');

interface RoleInput {
  ebene?: string | undefined;
  rolle?: string | undefined;
  bundesland?: string | undefined;
}

export interface LandesverbandProjectSeed {
  lvId: string;
  name: string;
  description: string;
  recipeMentions: readonly string[];
  notebookId: string;
}

/**
 * Was das Projekt eines Landesverbands beim Anlegen mitbringt, oder `null`,
 * wenn diese Instanz den Landesverband nicht anbietet (Notebook abgeschaltet
 * oder hier nicht gelistet).
 */
export function landesverbandProjectSeed(
  lvId: string,
  instanceId = CURRENT_INSTANCE
): LandesverbandProjectSeed | null {
  const lv = LANDESVERBAENDE.find((entry) => entry.id === lvId);
  if (!lv || !isNotebookOfferedIn(lv.notebookId, instanceId)) return null;
  return {
    lvId,
    name: `Grüne ${lv.title}`,
    description: `Rezepte und Notebook der Grünen ${lv.title}. Alle mit einer Rolle in der Landesgeschäftsstelle sind automatisch dabei und können das Projekt anpassen.`,
    recipeMentions: landesverbandRecipeMentions(lvId),
    notebookId: lv.notebookId,
  };
}

/**
 * Legt das Projekt an, falls es noch nie eins gab, und gibt seine Id zurück —
 * `null`, wenn es im Papierkorb liegt oder die Instanz den LV nicht anbietet.
 * Die Freigaben entstehen nur in der Transaktion, die das Projekt anlegt.
 */
async function ensureProjectFor(seed: LandesverbandProjectSeed): Promise<string | null> {
  const postgres = getPostgresInstance();
  await postgres.transaction(async (client) => {
    const created = (await postgres.transactionQueryOne(
      client,
      `INSERT INTO groups (name, description, created_by, join_token, slug_suffix, group_type, auto_landesverband)
         VALUES ($1, $2, NULL, $3, $4, 'standard', $5)
       ON CONFLICT (auto_landesverband) DO NOTHING
       RETURNING id`,
      [
        seed.name,
        seed.description,
        crypto.randomBytes(16).toString('hex'),
        generateSlugSuffix(),
        seed.lvId,
      ]
    )) as { id: string } | null;
    if (!created) return;

    const shares: Array<[string, string]> = [
      ['system_notebooks', seed.notebookId],
      ...seed.recipeMentions.map((mention): [string, string] => ['system_recipes', mention]),
    ];
    for (const [contentType, contentId] of shares) {
      await postgres.transactionExec(
        client,
        `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions)
           VALUES ($1, $2, $3, NULL, $4)
         ON CONFLICT (group_id, content_type, content_id) DO NOTHING`,
        [contentType, contentId, created.id, JSON.stringify({ read: true })]
      );
    }
    log.info(
      `[ensureProjectFor] created project for ${seed.lvId} with ${seed.recipeMentions.length} recipe(s)`
    );
  });

  const row = (await postgres.queryOne(
    'SELECT id FROM groups WHERE auto_landesverband = $1 AND deleted_at IS NULL',
    [seed.lvId],
    { table: 'groups' }
  )) as { id: string } | null;
  return row?.id ?? null;
}

export interface LandesverbandAccessInput {
  roles: readonly RoleInput[];
  locale: string | null;
  email: string | null;
  emailVerified: boolean;
}

export interface LandesverbandAccessPlan {
  /** Die LGS-Rolle, die der Person fehlt und ergänzt wird, sonst `null`. */
  addRole: UserRole | null;
  /** Die Landesverbände, in deren Projekt sie automatisch Admin wird. */
  lvIds: readonly string[];
}

/**
 * Die eine Entscheidung, rein und ohne Datenbank: welche Rolle ergänzt wird
 * und in welche Projekte die Person kommt. Ohne bestätigte Adresse auf einer
 * LV-Domain: nichts, egal welche Rollen eingetragen sind.
 */
export function planLandesverbandAccess(input: LandesverbandAccessInput): LandesverbandAccessPlan {
  const none: LandesverbandAccessPlan = { addRole: null, lvIds: [] };
  if (!input.emailVerified) return none;
  const bundesland = landesverbandBundeslandForEmail(input.email);
  if (!bundesland) return none;
  const locale = input.locale ?? 'de-DE';

  const hasRole = input.roles.some(
    (r) =>
      r.ebene != null &&
      r.rolle != null &&
      r.bundesland === bundesland &&
      isLandesverbandRolle(r.ebene, r.rolle)
  );
  const addRole = hasRole ? null : suggestedRoleForEmail(input.email, locale);
  const roles = addRole ? [...input.roles, addRole] : input.roles;

  // Nur der Landesverband der Adresse, auch wenn weitere LGS-Rollen eingetragen sind.
  const lvIds = landesverbandIdsForRoles(roles, locale).filter(
    (id) => LANDESVERBAENDE.find((lv) => lv.id === id)?.title === bundesland
  );
  return { addRole, lvIds };
}

interface ProfileAccessRow {
  roles: RoleInput[] | null;
  locale: string | null;
  email: string | null;
  email_verified: boolean | null;
}

/**
 * Ergänzt die LGS-Rolle (falls nötig) und macht die Person zur Admin im
 * Projekt ihres Landesverbands; legt das Projekt beim ersten Mal an. Liest den
 * Stand selbst aus `profiles`, damit jeder Auslöser (Login, Rollen speichern,
 * Boot) dieselbe Regel fährt. Fehler nur loggen: der Boot-Durchlauf holt es nach.
 */
export async function syncLandesverbandAccess(userId: string): Promise<void> {
  try {
    const postgres = getPostgresInstance();
    const row = (await postgres.queryOne(
      `SELECT user_defaults->'profile'->'roles' AS roles, locale, email, email_verified
         FROM profiles WHERE id = $1`,
      [userId]
    )) as ProfileAccessRow | null;
    if (!row) return;

    const roles = Array.isArray(row.roles) ? row.roles : [];
    const plan = planLandesverbandAccess({
      roles,
      locale: row.locale,
      email: row.email,
      emailVerified: row.email_verified === true,
    });

    if (plan.addRole) {
      // Atomar anhängen, ohne die übrigen Einstellungen unter `profile` anzufassen.
      // Der Boot-Durchlauf läuft in jedem Cluster-Worker gleichzeitig: die
      // `@>`-Bedingung hält das Anhängen idempotent, auch wenn zwei Worker den
      // Stand ohne Rolle gelesen haben.
      await postgres.query(
        `UPDATE profiles
            SET user_defaults = jsonb_set(
                  COALESCE(user_defaults, '{}'::jsonb),
                  '{profile}',
                  COALESCE(user_defaults->'profile', '{}'::jsonb)
                    || jsonb_build_object(
                         'roles',
                         CASE WHEN jsonb_typeof(user_defaults->'profile'->'roles') = 'array'
                              THEN user_defaults->'profile'->'roles'
                              ELSE '[]'::jsonb END || $2::jsonb
                       )
                )
          WHERE id = $1
            AND NOT COALESCE(user_defaults->'profile'->'roles' @> $2::jsonb, FALSE)`,
        [userId, JSON.stringify([plan.addRole])]
      );
      await deriveLandesverbandFromRoles(
        userId,
        [...roles, plan.addRole].map((r) => (r.bundesland ? { bundesland: r.bundesland } : {}))
      );
      log.info(`[syncLandesverbandAccess] added LGS role ${plan.addRole.bundesland} for ${userId}`);
    }

    for (const lvId of plan.lvIds) {
      const seed = landesverbandProjectSeed(lvId);
      if (!seed) continue;
      const groupId = await ensureProjectFor(seed);
      if (!groupId) continue;
      await postgres.query(
        `INSERT INTO group_memberships (group_id, user_id, role)
           VALUES ($1, $2, 'admin')
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, userId]
      );
    }
  } catch (error) {
    log.warn(`[syncLandesverbandAccess] failed for ${userId}:`, (error as Error).message);
  }
}

/**
 * Boot-Durchlauf. Vorfilter nur auf bestätigte Adressen, die nach einer
 * Grünen-Domain aussehen; was zählt, entscheidet `planLandesverbandAccess`.
 */
export async function ensureLandesverbandProjects(): Promise<void> {
  try {
    const rows = (await getPostgresInstance().query(
      `SELECT id FROM profiles WHERE email_verified = TRUE AND email ILIKE '%gruene%'`
    )) as Array<{ id: string }>;
    for (const row of rows) {
      await syncLandesverbandAccess(row.id);
    }
    log.info(`[ensureLandesverbandProjects] checked ${rows.length} profile(s)`);
  } catch (error) {
    log.warn(
      '[ensureLandesverbandProjects] failed (will retry on next boot):',
      (error as Error).message
    );
  }
}
