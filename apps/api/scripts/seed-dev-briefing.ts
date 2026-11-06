/**
 * Musterdaten für das Tagesbriefing — NUR lokal, NUR für den Dev-Bypass-Nutzer.
 *
 * Legt für `00000000-0000-4000-a000-000000000001` Profilfelder, Rollen, ein
 * Board mit Karten, Chats und Dokumente an, damit sich jede Form des Briefings
 * reproduzierbar im Browser prüfen lässt. Die Titel sind echt (kein Präfix,
 * das in der Nachricht auftauchen würde); welche Zeilen das Skript angelegt
 * hat, steht in `.cache/dev-briefing-seed.json`, und `--reset` löscht genau die.
 *
 *   cd apps/api
 *   npx tsx scripts/seed-dev-briefing.ts --scenario=full --name=Moritz
 *   npx tsx scripts/seed-dev-briefing.ts --scenario=at
 *   npx tsx scripts/seed-dev-briefing.ts --reset
 *
 * Szenarien: full | no-todos | few | empty | at. Optionen: --name=<Vorname>,
 * --no-lagebild (kein Fixture-Lagebild), --live-lagebild (einmal echt bauen:
 * holt mit `refreshMonitor()` die echten Feeds und baut daraus das Lagebild;
 * braucht den laufenden NLP-Dienst, `services/nlp`, NLP_SERVICE_URL).
 * Danach in den Einstellungen „Tagesbriefing jetzt neu erzeugen" drücken oder
 *   curl -X POST -H "x-dev-auth-bypass: $TOKEN" localhost:3001/api/dev/briefing/rerun
 */
import 'dotenv/config';

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { gzip } from 'zlib';

import * as Y from 'yjs';

import { getPostgresInstance } from '../database/services/PostgresService.js';
import { berlinDay, shiftDay } from '../services/briefing/time.js';

import type { Lagebild } from '../services/briefing/types.js';

const gzipAsync = promisify(gzip);

const DEV_USER = '00000000-0000-4000-a000-000000000001';
const OTHER_USER = '00000000-0000-4000-a000-0000000000ff';
const SEED_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../.cache/dev-briefing-seed.json'
);

interface SeedLedger {
  threads: string[];
  documents: string[];
}

const created: SeedLedger = { threads: [], documents: [] };

function readLedger(): SeedLedger {
  try {
    const parsed = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as Partial<SeedLedger>;
    return { threads: parsed.threads ?? [], documents: parsed.documents ?? [] };
  } catch {
    return { threads: [], documents: [] };
  }
}

function writeLedger(): void {
  mkdirSync(dirname(SEED_FILE), { recursive: true });
  writeFileSync(SEED_FILE, JSON.stringify(created, null, 2));
}
const SCENARIOS = ['full', 'no-todos', 'few', 'empty', 'at'] as const;
type Scenario = (typeof SCENARIOS)[number];

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
}

function guard(): void {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Refusing to seed: NODE_ENV=production');
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host))
    throw new Error(`Refusing to seed: POSTGRES_HOST=${host} is not local`);
}

const db = () => getPostgresInstance();

async function reset(): Promise<void> {
  const ledger = readLedger();
  if (ledger.threads.length > 0)
    await db().query(`DELETE FROM chat_threads WHERE user_id = $1 AND id = ANY($2::uuid[])`, [
      DEV_USER,
      ledger.threads,
    ]);
  await db().query(
    `DELETE FROM chat_threads WHERE id IN (SELECT thread_id FROM daily_briefings WHERE user_id = $1)`,
    [DEV_USER]
  );
  await db().query(`DELETE FROM daily_briefings WHERE user_id = $1`, [DEV_USER]);
  await db().query(`DELETE FROM notifications WHERE user_id = $1 AND type = 'daily_briefing'`, [
    DEV_USER,
  ]);
  if (ledger.documents.length > 0) {
    await db().query(`DELETE FROM yjs_document_updates WHERE document_id = ANY($1::uuid[])`, [
      ledger.documents,
    ]);
    await db().query(
      `DELETE FROM collaborative_documents WHERE created_by = $1 AND id = ANY($2::uuid[])`,
      [DEV_USER, ledger.documents]
    );
  }
  writeLedger();
  console.log(
    `reset: ${ledger.threads.length} Chats, ${ledger.documents.length} Dokumente/Boards und alle Briefings des Dev-Nutzers entfernt`
  );
}

async function ensureProfile(
  name: string | null,
  locale: 'de-DE' | 'de-AT',
  roles: unknown[]
): Promise<void> {
  await db().query(
    `INSERT INTO profiles (id, email, display_name) VALUES ($1, 'dev@localhost', 'Development User')
     ON CONFLICT (id) DO NOTHING`,
    [DEV_USER]
  );
  await db().query(
    `INSERT INTO profiles (id, email, display_name) VALUES ($1, 'kolleg@localhost', 'Kim Kollegin')
     ON CONFLICT (id) DO NOTHING`,
    [OTHER_USER]
  );
  await db().query(
    `UPDATE profiles SET
       first_name = COALESCE($2, first_name),
       locale = $3,
       proactive_briefing_enabled = true,
       ai_consent_at = COALESCE(ai_consent_at, NOW()),
       user_defaults = jsonb_set(COALESCE(user_defaults, '{}'::jsonb), '{profile}',
         COALESCE(user_defaults->'profile', '{}'::jsonb) || jsonb_build_object('roles', $4::jsonb))
     WHERE id = $1`,
    [DEV_USER, name, locale, JSON.stringify(roles)]
  );
}

const STATUS_OPTIONS = [
  { id: 'status-todo', name: 'Zu erledigen', color: '#8da4bf' },
  { id: 'status-in-progress', name: 'In Arbeit', color: '#c4b08b' },
  { id: 'status-done', name: 'Erledigt', color: '#7c9885', isDone: true },
];
const FIELD_LIST = [
  ['field-title', 'Titel', 'text', {}],
  ['field-status', 'Status', 'singleSelect', { options: STATUS_OPTIONS }],
  ['field-description', 'Beschreibung', 'text', {}],
  ['field-due-date', 'Fällig', 'date', {}],
  ['field-labels', 'Labels', 'multiSelect', { options: [] }],
  ['field-assignee', 'Zuständig', 'text', {}],
  ['field-linked-docs', 'Dokumente', 'text', {}],
] as const;

async function seedBoard(today: string): Promise<void> {
  const inserted = (await db().query(
    `INSERT INTO collaborative_documents
       (title, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $2, 'boards', $3, false) RETURNING id`,
    [
      'Wahlkampf KV',
      DEV_USER,
      JSON.stringify({ [DEV_USER]: { level: 'owner', granted_at: new Date().toISOString() } }),
    ]
  )) as Array<{ id: string }>;
  const boardId = inserted[0]!.id;
  created.documents.push(boardId);
  const me = JSON.stringify([{ id: DEV_USER, name: 'Ich', avatarRobotId: 1 }]);
  const other = JSON.stringify([{ id: OTHER_USER, name: 'Kim Kollegin', avatarRobotId: 2 }]);
  const cards: Array<[string, string, string | null, string]> = [
    ['Pressemitteilung Radentscheid', 'status-in-progress', shiftDay(today, -3), me],
    ['Antrag Kitaplätze finalisieren', 'status-todo', today, me],
    ['Social-Plan KW 46', 'status-todo', shiftDay(today, 4), me],
    ['Flyer drucken lassen', 'status-done', shiftDay(today, -1), me],
    ['Saal für Mitgliederversammlung buchen', 'status-todo', shiftDay(today, 1), other],
  ];

  const doc = new Y.Doc();
  doc.transact(() => {
    const fields = doc.getArray('fields');
    FIELD_LIST.forEach(([id, name, type, typeOptions], order) =>
      fields.push([{ id, name, type, typeOptions, order }])
    );
    const rows = doc.getArray('rows');
    cards.forEach(([title, status, due, assignee], i) =>
      rows.push([
        {
          id: `row-muster-${i}`,
          cells: {
            'field-title': title,
            'field-status': status,
            'field-description': '',
            'field-due-date': due,
            'field-labels': [],
            'field-assignee': assignee,
            'field-linked-docs': '[]',
          },
          createdBy: DEV_USER,
          createdAt: new Date().toISOString(),
        },
      ])
    );
    doc.getArray('views').push([
      {
        id: 'view-kanban-default',
        name: 'Kanban',
        layout: 'kanban',
        groupByFieldId: 'field-status',
        filters: [],
        sorts: [],
        fieldSettings: FIELD_LIST.map(([fieldId]) => ({ fieldId, visible: true })),
      },
    ]);
  });
  const compressed = await gzipAsync(Buffer.from(Y.encodeStateAsUpdate(doc)));
  await db().query(
    `INSERT INTO yjs_document_updates (document_id, update_data, created_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (document_id) DO UPDATE SET update_data = EXCLUDED.update_data, created_at = EXCLUDED.created_at`,
    [boardId, compressed]
  );
  doc.destroy();
  console.log(
    `board: ${cards.length} Karten (3 offen für mich, 1 erledigt, 1 fremd) → /boards/${boardId}`
  );
}

async function seedChat(title: string, tags: string[], daysAgo: number): Promise<void> {
  const rows = (await db().query(
    `INSERT INTO chat_threads (user_id, agent_id, title, thread_type, tags, slug_suffix, updated_at)
     VALUES ($1, 'gruenerator-universal', $2, 'chat', $3::jsonb, $4, NOW() - make_interval(days => $5))
     RETURNING id`,
    [DEV_USER, title, JSON.stringify(tags), Math.random().toString(36).slice(2, 8), daysAgo]
  )) as Array<{ id: string }>;
  const threadId = rows[0]!.id;
  created.threads.push(threadId);
  await db().query(
    `INSERT INTO chat_messages (thread_id, role, content, user_id) VALUES ($1, 'user', $2, $3), ($1, 'assistant', $4, NULL)`,
    [threadId, `Hilf mir bei: ${title}`, DEV_USER, `Gerne, hier ist ein Entwurf zu „${title}“.`]
  );
}

async function seedDoc(title: string, subtype: string): Promise<void> {
  const rows = (await db().query(
    `INSERT INTO collaborative_documents (title, created_by, last_edited_by, document_subtype, permissions, is_public)
     VALUES ($1, $2, $2, $3, $4, false) RETURNING id`,
    [
      title,
      DEV_USER,
      subtype,
      JSON.stringify({ [DEV_USER]: { level: 'owner', granted_at: new Date().toISOString() } }),
    ]
  )) as Array<{ id: string }>;
  created.documents.push(rows[0]!.id);
}

function fixtureLagebild(locale: 'de' | 'at'): Lagebild {
  const at = locale === 'at';
  return {
    locale,
    generatedAt: new Date().toISOString(),
    items: [
      {
        kind: 'partei',
        topic: null,
        text: at
          ? 'Die Grünen fordern im Nationalrat einen Klimabonus für Pendler*innen.'
          : 'Die Grünen legen im Bundestag ein Papier zur Mietpreisbremse vor.',
        url: at ? 'https://www.derstandard.at/' : 'https://www.sueddeutsche.de/',
        source: at ? 'Der Standard' : 'SZ',
      },
      {
        kind: 'welt',
        topic: 'klima',
        text: 'Auf dem Klimagipfel ringen die Staaten um neue Finanzzusagen.',
        url: at ? 'https://orf.at/' : 'https://www.tagesschau.de/',
        source: at ? 'ORF' : 'tagesschau',
      },
      {
        kind: 'welt',
        topic: 'mobilitaet',
        text: 'Der Bahnverkehr bleibt nach dem Sturm in mehreren Regionen eingeschränkt.',
        url: at ? 'https://www.diepresse.com/' : 'https://www.spiegel.de/',
        source: at ? 'Die Presse' : 'Spiegel',
      },
    ],
  };
}

async function main(): Promise<void> {
  guard();
  await db().init();
  if (arg('reset') !== null) {
    await reset();
    return;
  }
  const scenario = (arg('scenario') ?? 'full') as Scenario;
  if (!SCENARIOS.includes(scenario)) throw new Error(`Unknown scenario ${scenario}`);
  const at = scenario === 'at';
  const today = berlinDay(new Date());

  await reset();
  await ensureProfile(
    arg('name') || null,
    at ? 'de-AT' : 'de-DE',
    at
      ? [{ ebene: 'land', rolle: 'Mitarbeiter*in Landesorganisation', bundesland: 'Wien' }]
      : [{ ebene: 'land', rolle: 'Mitarbeiter*in Landesgeschäftsstelle', bundesland: 'Bayern' }]
  );

  if (scenario === 'full' || scenario === 'at') await seedBoard(today);
  if (scenario === 'full' || scenario === 'at' || scenario === 'no-todos') {
    await seedChat('Antrag Kitaplätze', ['Kita', 'Kommunalpolitik'], 1);
    await seedChat('Pressemitteilung Radentscheid', ['Radverkehr', 'Presse'], 2);
    await seedChat('Instagram-Post Klimageld', ['Klima', 'Social Media'], 4);
    await seedDoc('Rede Haushaltsdebatte', 'docs');
    await seedDoc('Positionspapier Wärmewende', 'antrag');
  }
  if (scenario === 'few') await seedChat('Kurze Frage zum Mietrecht', ['Miete'], 3);

  const locale = at ? 'at' : 'de';
  if (scenario !== 'empty' && arg('no-lagebild') === null) {
    const { refreshLagebild, saveLagebild, getLagebild } =
      await import('../services/briefing/lagebild.js');
    if (arg('live-lagebild') !== null) {
      const { getLatestSnapshot, refreshMonitor, searchArticlesByKeywords } =
        await import('../services/monitor/MonitorService.js');
      const refreshed = await refreshMonitor();
      console.log(`monitor: ${refreshed.totalArticles} Artikel gesammelt und klassifiziert`);
      const { getEntityForLocale } = await import('../services/monitor/watcherEntities.js');
      const entity = getEntityForLocale(locale);
      const snapshot = await getLatestSnapshot(locale);
      const articles = await searchArticlesByKeywords(
        entity.keywords,
        locale,
        50,
        entity.excludePatterns
      );
      const built = await refreshLagebild({
        locale,
        partySummary: null, // die Medien-Zusammenfassung baut erst der Warm-Task
        partyArticles: articles,
        topics: snapshot?.topics ?? [],
      });
      console.log(
        built
          ? `lagebild: live gebaut (${built.items.length} Zeilen)`
          : 'lagebild: live nicht baubar (keine Monitor-Daten?)'
      );
    } else if (!(await getLagebild(locale))) {
      await saveLagebild(fixtureLagebild(locale));
      console.log('lagebild: Fixture geschrieben');
    } else {
      console.log('lagebild: vorhandenes frisches Lagebild bleibt');
    }
  } else {
    await db().query(`DELETE FROM monitor_lagebilder WHERE locale = $1`, [locale]);
    const { deleteCachedKey } = await import('../utils/redis/jsonCache.js');
    await deleteCachedKey(`briefing:lagebild:v1:${locale}`);
    console.log('lagebild: entfernt');
  }
  writeLedger();
  console.log(
    `scenario ${scenario} bereit — jetzt „Tagesbriefing jetzt neu erzeugen" oder /api/dev/briefing/rerun`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
