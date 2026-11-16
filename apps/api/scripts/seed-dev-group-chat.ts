/**
 * Musterdaten für Team-Gruppenchats — NUR lokal.
 *
 * Legt das Team-Projekt „Kampagne Radweg Musterstadt" an: der Dev-Bypass-Nutzer
 * (Admin) und Lena Hoffmann (Mitglied, zweite Dev-Identität, siehe
 * `DEV_BYPASS_EXTRA_USERS`), ein Notebook, eine Datei und Projektanweisungen.
 * Lena bekommt außerdem einen eigenen Wolke-Link und einen eigenen MCP-Server
 * (Fake-URL, es verbindet sich nichts) für die Prüfung „Refs der anderen Person
 * werden übersprungen".
 *
 *   cd apps/api
 *   npx tsx --conditions=development scripts/seed-dev-group-chat.ts
 *   npx tsx --conditions=development scripts/seed-dev-group-chat.ts --reset
 *
 * Zweiter Tab als Lena: im Browser (Dev-Bypass an)
 *   sessionStorage['gr.devBypassUser'] = '00000000-0000-4000-a000-0000000000b2'
 * setzen und neu laden. Angefasst werden nur die festen Ids unten; die Profile
 * bleiben auch nach `--reset` stehen.
 */
import 'dotenv/config';

import { buildGroupSlug, generateSlugSuffix } from '@gruenerator/shared/utils';

import { DEV_BYPASS_EXTRA_USERS, DEV_BYPASS_USER_ID } from '../config/devAuthBypass.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';
import { addGroupShare } from '../services/groups/groupShareWriter.js';

const LENA = DEV_BYPASS_EXTRA_USERS[0]!;
const PROJECT_ID = '00000000-0000-4000-a000-0000000000c1';
const DOCUMENT_ID = '00000000-0000-4000-a000-0000000000c2';
const MCP_SERVER_ID = '00000000-0000-4000-a000-0000000000c3';
const WOLKE_LINK_ID = 'dev-seed-lena-wolke';
const PROJECT_NAME = 'Kampagne Radweg Musterstadt';
const NOTEBOOK_ID = 'saarland-system';

function guard(): void {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed: NODE_ENV=production');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host))
    throw new Error(`Refusing to seed: POSTGRES_HOST=${host} is not local`);
}

const db = () => getPostgresInstance();

async function reset(): Promise<void> {
  await db().query(`DELETE FROM chat_threads WHERE group_id = $1`, [PROJECT_ID]);
  await db().query(`DELETE FROM groups WHERE id = $1`, [PROJECT_ID]);
  await db().query(`DELETE FROM documents WHERE id = $1 AND user_id = $2`, [
    DOCUMENT_ID,
    DEV_BYPASS_USER_ID,
  ]);
  await db().query(`DELETE FROM mcp_servers WHERE id = $1 AND user_id = $2`, [MCP_SERVER_ID, LENA]);
  await db().query(
    `UPDATE profiles SET nextcloud_share_links = COALESCE((
       SELECT jsonb_agg(l) FROM jsonb_array_elements(COALESCE(nextcloud_share_links, '[]'::jsonb)) l
        WHERE l->>'id' <> $2), '[]'::jsonb)
      WHERE id = $1`,
    [LENA, WOLKE_LINK_ID]
  );
  console.log('reset: Projekt, Datei, Lenas MCP-Server und Wolke-Link entfernt');
}

async function seed(): Promise<void> {
  await db().query(
    `INSERT INTO profiles (id, email, display_name) VALUES ($1, 'dev@localhost', 'Development User')
     ON CONFLICT (id) DO NOTHING`,
    [DEV_BYPASS_USER_ID]
  );
  await db().query(
    `INSERT INTO profiles (id, email, display_name, first_name, ai_consent_at)
     VALUES ($1, 'lena@localhost', 'Lena Hoffmann', 'Lena', NOW())
     ON CONFLICT (id) DO UPDATE SET display_name = 'Lena Hoffmann', first_name = 'Lena',
       ai_consent_at = COALESCE(profiles.ai_consent_at, NOW())`,
    [LENA]
  );

  const suffix = generateSlugSuffix();
  await db().query(
    `INSERT INTO groups (id, name, description, created_by, group_type, slug_suffix)
     VALUES ($1, $2, 'Musterprojekt für lokale Gruppenchat-Tests', $3, 'standard', $4)`,
    [PROJECT_ID, PROJECT_NAME, DEV_BYPASS_USER_ID, suffix]
  );
  await db().query(
    `INSERT INTO group_memberships (group_id, user_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member')
     ON CONFLICT (group_id, user_id) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE`,
    [PROJECT_ID, DEV_BYPASS_USER_ID, LENA]
  );
  await db().query(
    `INSERT INTO group_instructions (group_id, custom_prompt, instructions_enabled)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (group_id) DO UPDATE SET custom_prompt = EXCLUDED.custom_prompt, instructions_enabled = TRUE`,
    [
      PROJECT_ID,
      'Wir führen eine Kampagne für einen sicheren Radweg in Musterstadt. Schreibe sachlich, freundlich und mit konkretem Ortsbezug.',
    ]
  );

  await db().query(
    `INSERT INTO documents (id, user_id, title, filename, status, ocr_text, markdown_content, document_type)
     VALUES ($1, $2, 'Radweg-Konzept', 'radweg-konzept.pdf', 'completed', $3, $3, 'upload')`,
    [
      DOCUMENT_ID,
      DEV_BYPASS_USER_ID,
      'Radweg-Konzept Musterstadt: Der Radweg entlang der Hauptstraße soll zwei Meter breit und baulich getrennt werden. Kosten: 1,2 Mio. Euro.',
    ]
  );
  // `group_content_shares` hat genau einen Schreiber (groupShareWriteGuard.vitest.ts).
  await addGroupShare({
    userId: DEV_BYPASS_USER_ID,
    groupId: PROJECT_ID,
    contentType: 'documents',
    contentId: DOCUMENT_ID,
    permissions: { read: true, write: true },
  } as never);
  await addGroupShare({
    userId: DEV_BYPASS_USER_ID,
    groupId: PROJECT_ID,
    contentType: 'system_notebooks',
    contentId: NOTEBOOK_ID,
    permissions: { read: true, write: false },
  } as never);

  // Lenas eigene Wolke-Anbindung und ihr MCP-Server — Fake-URLs, nichts verbindet sich.
  await db().query(
    `UPDATE profiles SET nextcloud_share_links = COALESCE((
       SELECT jsonb_agg(l) FROM jsonb_array_elements(COALESCE(nextcloud_share_links, '[]'::jsonb)) l
        WHERE l->>'id' <> $2), '[]'::jsonb) || $3::jsonb
      WHERE id = $1`,
    [
      LENA,
      WOLKE_LINK_ID,
      JSON.stringify([
        {
          id: WOLKE_LINK_ID,
          share_link: 'https://wolke.invalid/s/devseedlena',
          label: 'Lenas Wolke (Dev)',
          base_url: 'https://wolke.invalid',
          share_token: 'devseedlena',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ]),
    ]
  );
  await db().query(
    `INSERT INTO mcp_servers (id, user_id, name, url, auth_type)
     VALUES ($1, $2, 'Lenas Dev-Server', 'https://mcp.invalid/lena', 'none')
     ON CONFLICT (id) DO NOTHING`,
    [MCP_SERVER_ID, LENA]
  );

  console.log(`Projekt: /gruppen/${buildGroupSlug(PROJECT_NAME, suffix)}`);
  console.log(`Lena-Tab: sessionStorage['gr.devBypassUser'] = '${LENA}'`);
  console.log(`Lenas Wolke-Link-Id: ${WOLKE_LINK_ID}, MCP-Server-Id: ${MCP_SERVER_ID}`);
}

async function main(): Promise<void> {
  guard();
  await reset();
  if (!process.argv.includes('--reset')) await seed();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
