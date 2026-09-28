/**
 * Every reader of a Papierkorb table must hide trashed rows.
 *
 * A trashed row stays physically where it was and only carries `deleted_at`,
 * so any query that forgets the clause shows it again — in a list, a search,
 * a public link. This guard reads the SOURCE: every SQL string literal with
 * `FROM|JOIN <table>` and every Drizzle `.from(<symbol>)`/`.xxxJoin(<symbol>`
 * must name the trash state in the same statement — `deleted_at IS NULL`,
 * `deleted_at IS NOT NULL` (the trash side itself), `isNull(<t>.deleted_at)`,
 * `notTrashed(`; for `collaborative_documents` also `is_deleted = false`,
 * which the CHECK `collaborative_documents_trash_pair` makes equivalent.
 * An interpolated fragment counts when its own definition carries the clause
 * (`${docsAccessWhere(…)}`, `${CANVAS_ACCESS_WHERE}`, a local `where`).
 * Otherwise the (file, table) pair must be on the allowlist with a reason.
 *
 * The allowlist is exact in both directions: a new unfiltered reader fails,
 * and so does an entry that no longer matches anything — every task that
 * migrates a table deletes its `pending: Task N` rows.
 *
 * SQL the scan cannot see (assembled from table-name strings) is listed in
 * `FRAGMENTED_SQL` instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TRASHABLE_TABLES, type TrashableTableName } from '../../database/trash.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(apiRoot, '../..');

const SCAN_ROOTS = [
  'apps/api/routes',
  'apps/api/services',
  'apps/api/database',
  'apps/api/utils',
  'services/hocuspocus/src',
];

/**
 * `marker` narrows an entry to the statements whose SQL contains it; without
 * one the entry excuses every unfiltered reader of `table` in `file`. Permanent
 * exceptions in a file that also holds filtered readers must carry a marker, or
 * the guard goes blind for the whole file.
 */
type AllowEntry = readonly [
  file: string,
  table: TrashableTableName,
  reason: string,
  marker?: string,
];

const HOCUSPOCUS =
  'Hocuspocus stays untouched (Global Constraint 6); for collab docs auth.ts refuses is_deleted rows in code and persistence only runs after auth';
const PERMANENT_CLEANUP =
  'file/link cleanup: the row-exists check must see trashed rows so their files survive until the purge';
const PERMANENT_BACKFILL = 'backfill: writes every row, trashed ones included';
const PERMANENT_ADMIN = 'admin surface: sees trashed rows on purpose';
const PERMANENT_SYNC_DEDUPE =
  'sync dedupe: must see trashed rows, or the next sync re-imports what the user trashed';
const NOT_SQL = 'not SQL: the text only mentions the table';

const ALLOWLIST: readonly AllowEntry[] = [
  // ── permanent ──
  [
    'apps/api/services/migrations/backfillChatThreadSlugSuffixes.ts',
    'chat_threads',
    PERMANENT_BACKFILL,
  ],
  ['services/hocuspocus/src/auth.ts', 'chat_threads', HOCUSPOCUS],
  ['services/hocuspocus/src/auth.ts', 'collaborative_documents', HOCUSPOCUS],
  ['services/hocuspocus/src/persistence.ts', 'collaborative_documents', HOCUSPOCUS],
  [
    'apps/api/services/docs/CollaborativeDocumentService.ts',
    'chat_threads',
    'purge: a purged document takes its chat thread along, trashed or not',
  ],
  ['apps/api/routes/admin/chunkInspectorContractRouter.ts', 'documents', PERMANENT_ADMIN],
  ['apps/api/services/cleanup/notebookLinkCleanupService.ts', 'documents', PERMANENT_CLEANUP],
  ['apps/api/routes/notebook/wolkePendingContractRouter.ts', 'documents', PERMANENT_SYNC_DEDUPE],
  [
    'apps/api/services/document-services/PostgresDocumentService/wolkeOperations.ts',
    'documents',
    PERMANENT_SYNC_DEDUPE,
  ],
  ['apps/api/services/notebook/notebookWolkeAttach.ts', 'documents', PERMANENT_SYNC_DEDUPE],
  ['apps/api/services/notebook/wordpressSourceService.ts', 'documents', PERMANENT_SYNC_DEDUPE],
  ['apps/api/services/sync/WolkeSyncService.ts', 'documents', PERMANENT_SYNC_DEDUPE],
  ['apps/api/services/sync/WolkeWatchService.ts', 'documents', PERMANENT_SYNC_DEDUPE],
  [
    'apps/api/services/document-services/PostgresDocumentService/metadataOperations.ts',
    'documents',
    'writer: updateDocumentMetadata must still record the status of a document trashed mid-ingest',
  ],
  [
    'apps/api/services/document-services/DocumentQnAService/mistralIntegration.ts',
    'documents',
    `${NOT_SQL} (an error message)`,
  ],
  [
    'apps/api/services/notebook/__fixtures__/fakeNotebookSources.ts',
    'documents',
    `${NOT_SQL} (a test fixture matching SQL text)`,
  ],
  ['apps/api/services/migrations/backfillGroupSlugSuffixes.ts', 'groups', PERMANENT_BACKFILL],
  ['services/hocuspocus/src/auth.ts', 'groups', HOCUSPOCUS],
  ['apps/api/services/cleanup/uploadsCleanupService.ts', 'shared_media', PERMANENT_CLEANUP],
  ['apps/api/services/cleanup/uploadsCleanupService.ts', 'subtitler_projects', PERMANENT_CLEANUP],
  [
    'apps/api/services/sharedMediaService.ts',
    'shared_media',
    'quota (getLibraryUsage): trashed media keep their files on disk until the purge, so they still count',
    '${LIBRARY_ITEM_CLAUSE}',
  ],
  [
    'apps/api/services/sharedMediaService.ts',
    'shared_media',
    'countFileBearingOrphans: a bug counter over dead-status rows, trashed or not',
    'AND file_path IS NOT NULL',
  ],
  ['apps/api/routes/auth/templates/adminTemplates.ts', 'user_templates', PERMANENT_ADMIN],
  [
    'apps/api/services/canvas/canvasRepository.ts',
    'user_templates',
    "hides a Vorlage's snapshot canvas from the canvas list; a trashed Vorlage keeps it hidden until the purge removes both",
    "ut.content_data->>'canvasId'",
  ],
  [
    'apps/api/routes/auth/templates/adminVorlagenContractRouter.ts',
    'user_templates',
    PERMANENT_ADMIN,
  ],
  // ── Task 5 ──
  ['apps/api/routes/auth/groups/groupAvatar.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/auth/groups/groupsContract/content.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/auth/groups/groupsContract/core.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/auth/groups/groupsContract/discovery.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/auth/initController.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/boards/boardsContractRouter.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/chat/agents/notebookTools.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/chat/chatThreadSharingContractRouter.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/chat/services/intentHandlers/shareDoc.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/chat/threadSharingController.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/docs/docsContractRouter.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/docs/permissionsController.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/notebook/notebookAccess.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/notebook/notebookSharingContractRouter.ts', 'groups', 'pending: Task 5'],
  ['apps/api/routes/userAgents/userAgentsSharingContractRouter.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/groups/groupContent.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/groups/groupFeed.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/groups/groupMembership.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/groups/groupMutations.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/groups/groupQueries.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/groups/systemGroup.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/notebook/groupSharedNotebookListing.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/notifications/groupNotifications.ts', 'groups', 'pending: Task 5'],
  ['apps/api/services/user/textFormRepository.ts', 'groups', 'pending: Task 5'],
  ['apps/api/utils/integrations/nextcloud/shareManager.ts', 'groups', 'pending: Task 5'],
];

/** Readers and writers the literal scan cannot see; each file must still contain its marker. */
const FRAGMENTED_SQL: ReadonlyArray<readonly [...AllowEntry, marker: string]> = [
  // Ownership check before sharing to a Projekt; table from CONTENT_TABLE_NAME_MAP.
  ...(['documents', 'user_documents', 'user_templates', 'user_agents'] as const).map(
    (table) =>
      [
        'apps/api/services/groups/groupContent.ts',
        table,
        'filtered: `AND deleted_at IS NULL` is appended for every TRASHABLE_TABLES table (groupContent.vitest.ts)',
        'FROM ${tableName}',
      ] as const
  ),
  // PostgresService.update/delete(tableName, …) helpers.
  [
    'apps/api/routes/auth/content/userLibrary.ts',
    'user_documents',
    'writer: each update runs after a live-row SELECT of the same id and owner',
    "postgres.update('user_documents'",
  ],
  [
    'apps/api/routes/auth/templates/userTemplatesContractRouter.ts',
    'user_templates',
    'writer: each update runs after a live-row SELECT of the same id',
    "postgres.update('user_templates'",
  ],
  [
    'apps/api/services/document-services/PostgresDocumentService/metadataOperations.ts',
    'documents',
    'deleteDocument: hard delete for sync removals only (the WordPress post is gone at the source)',
    "postgres.delete('documents'",
  ],
  [
    'apps/api/services/document-services/PostgresDocumentService/metadataOperations.ts',
    'documents',
    'writer: see updateDocumentMetadata above',
    "postgres.update('documents'",
  ],
  [
    'apps/api/services/document-services/PostgresDocumentService/textOperations.ts',
    'documents',
    'writer: storeDocumentText reads its row through a notTrashed() select first',
    "postgres.update('documents'",
  ],
  [
    'apps/api/services/admin/GrueneratorOffboarding.ts',
    'documents',
    'account offboarding deletes everything, trashed rows included',
    "db.delete('documents'",
  ],
];

const TABLES = Object.keys(TRASHABLE_TABLES) as TrashableTableName[];

const TRASH_AWARE = /deleted_at\s+IS\s+(NOT\s+)?NULL/i;
const COLLAB_LIVE =
  /\bis_deleted\s*(=\s*false|IS\s+(NOT\s+TRUE|FALSE))|\bNOT\s+(\w+\.)?is_deleted\b/i;

function walk(dir: string, out: string[]): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|js|mjs)$/.test(entry.name) && !/\.(vitest|test|spec)\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** String and template literals of a source file, comments skipped. */
function stringLiterals(source: string): Array<{ text: string; index: number }> {
  const out: Array<{ text: string; index: number }> = [];
  const n = source.length;
  let i = 0;

  function readTemplate(): void {
    const start = i++;
    while (i < n && source[i] !== '`') {
      if (source[i] === '\\') i += 2;
      else if (source[i] === '$' && source[i + 1] === '{') {
        i += 2;
        readCode('}');
        i++;
      } else i++;
    }
    i++;
    out.push({ text: source.slice(start, i), index: start });
  }

  function readQuoted(quote: string): void {
    const start = i++;
    while (i < n && source[i] !== quote && source[i] !== '\n') i += source[i] === '\\' ? 2 : 1;
    i++;
    out.push({ text: source.slice(start, i), index: start });
  }

  function readCode(until: string | null): void {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (until && c === until && depth === 0) return;
      if (c === '{') depth++;
      else if (c === '}') depth--;
      if (c === '/' && source[i + 1] === '/') {
        while (i < n && source[i] !== '\n') i++;
      } else if (c === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
      } else if (c === '`') readTemplate();
      else if (c === "'" || c === '"') readQuoted(c);
      else i++;
    }
  }

  readCode(null);
  return out;
}

function readsTable(text: string, table: string): boolean {
  return new RegExp(
    `(?<!DELETE\\s{1,20})\\b(FROM|JOIN)\\s+(public\\.)?${table}\\b(?!\\.)`,
    'i'
  ).test(text);
}

type Filters = { trash: boolean; collab: boolean };

function filtersIn(text: string): Filters {
  return { trash: TRASH_AWARE.test(text), collab: COLLAB_LIVE.test(text) };
}

function satisfies(filters: Filters, table: TrashableTableName): boolean {
  return filters.trash || (table === 'collaborative_documents' && filters.collab);
}

/**
 * Names whose definition is a literal carrying a filter: `const X = \`…\``,
 * `const where = withCursor(\`…\``, `function X(…) { return \`…\``. Exported
 * ones apply everywhere, the rest only in their own file.
 */
function fragmentsIn(source: string): Map<string, Filters & { exported: boolean }> {
  const found = new Map<string, Filters & { exported: boolean }>();
  for (const { text, index } of stringLiterals(source)) {
    const filters = filtersIn(text);
    if (!filters.trash && !filters.collab) continue;
    const before = source.slice(Math.max(0, index - 300), index);
    const match =
      /(export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=;]*)?=\s*(?:\w+\(\s*)?$/.exec(before) ??
      /(export\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>[\]| ]+)?\s*\{\s*return\s*$/.exec(
        before
      );
    if (match) found.set(match[2], { ...filters, exported: Boolean(match[1]) });
  }
  return found;
}

/** `export const fooTable = pgTable('foo_table', …)` → symbol per trash table. */
function drizzleSymbols(): Map<string, TrashableTableName> {
  const symbols = new Map<string, TrashableTableName>();
  const schemaDir = path.join(apiRoot, 'database/schema');
  for (const file of fs.readdirSync(schemaDir)) {
    const source = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    for (const m of source.matchAll(/export const (\w+) = pgTable\(\s*'(\w+)'/g)) {
      if ((TABLES as string[]).includes(m[2])) symbols.set(m[1], m[2] as TrashableTableName);
    }
  }
  return symbols;
}

interface Offender {
  file: string;
  table: TrashableTableName;
  line: number;
  statement: string;
}

function scan(): Offender[] {
  const files = SCAN_ROOTS.flatMap((root) => walk(path.join(repoRoot, root), []));
  const sources = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')] as const));

  const exported = new Map<string, Filters>();
  const local = new Map<string, Map<string, Filters>>();
  for (const [file, source] of sources) {
    const mine = new Map<string, Filters>();
    for (const [name, f] of fragmentsIn(source)) {
      mine.set(name, f);
      if (f.exported) exported.set(name, f);
    }
    local.set(file, mine);
  }

  const symbols = drizzleSymbols();
  const offenders: Offender[] = [];

  for (const [file, source] of sources) {
    const rel = path.relative(repoRoot, file);
    const lineOf = (index: number): number => source.slice(0, index).split('\n').length;
    const fragmentFilters = (text: string): Filters => {
      const acc = filtersIn(text);
      for (const m of text.matchAll(/\$\{\s*(\w+)/g)) {
        const f = local.get(file)?.get(m[1]) ?? exported.get(m[1]);
        if (f) {
          acc.trash ||= f.trash;
          acc.collab ||= f.collab;
        }
      }
      return acc;
    };

    for (const { text, index } of stringLiterals(source)) {
      for (const table of TABLES) {
        if (readsTable(text, table) && !satisfies(fragmentFilters(text), table)) {
          offenders.push({ file: rel, table, line: lineOf(index), statement: text });
        }
      }
    }

    for (const m of source.matchAll(
      /\.(from|leftJoin|innerJoin|rightJoin|fullJoin)\(\s*(\w+)\b/g
    )) {
      const table = symbols.get(m[2]);
      if (!table) continue;
      const end = source.indexOf(';', m.index);
      const statement = source.slice(m.index, end === -1 ? undefined : end);
      const ok =
        /\bnotTrashed\(/.test(statement) ||
        new RegExp(`isNull\\(\\s*\\w+\\.deleted_at\\s*\\)`).test(statement) ||
        (table === 'collaborative_documents' &&
          new RegExp(`eq\\(\\s*\\w+\\.is_deleted\\s*,\\s*false\\s*\\)`).test(statement));
      if (!ok) offenders.push({ file: rel, table, line: lineOf(m.index), statement });
    }
  }
  return offenders;
}

const key = (file: string, table: string): string => `${file} :: ${table}`;

describe('Papierkorb readers hide trashed rows', () => {
  const offenders = scan();
  const excuses = (entry: AllowEntry, o: Offender): boolean =>
    entry[0] === o.file &&
    entry[1] === o.table &&
    (entry[3] === undefined || o.statement.includes(entry[3]));

  it('finds readers at all (the scan is not silently blind)', () => {
    expect(offenders.length + ALLOWLIST.length).toBeGreaterThan(0);
    // docsAccessWhere is the canonical filtered fragment; if the scan stopped
    // resolving it, every docs reader would show up here as an offender.
    expect(offenders.filter((o) => o.file === 'apps/api/routes/docs/docsSearch.ts')).toEqual([]);
  });

  it('every unfiltered reader is on the allowlist', () => {
    const missing = offenders
      .filter((o) => !ALLOWLIST.some((entry) => excuses(entry, o)))
      .map((o) => `${o.file}:${o.line} reads ${o.table} without deleted_at IS NULL`);
    expect(missing).toEqual([]);
  });

  it('every allowlist entry still matches an unfiltered reader', () => {
    const stale = ALLOWLIST.filter((entry) => !offenders.some((o) => excuses(entry, o))).map(
      ([file, table, , marker]) => (marker ? `${key(file, table)} [${marker}]` : key(file, table))
    );
    expect(stale).toEqual([]);
  });

  it('every allowlist entry has a reason', () => {
    for (const [file, table, reason] of [...ALLOWLIST, ...FRAGMENTED_SQL]) {
      expect(reason.trim(), key(file, table)).not.toBe('');
    }
  });

  it('every fragmented reader still exists where it is listed', () => {
    for (const [file, table, , marker] of FRAGMENTED_SQL) {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      expect(source.includes(marker), `${key(file, table)} no longer contains ${marker}`).toBe(
        true
      );
    }
  });
});
