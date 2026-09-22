/**
 * Die schreibenden Aktionen von `notebook_quellen` — Quellen entfernen,
 * verschieben, kopieren, umbenennen, verschlagworten, eine Notiz anlegen und
 * EINE Webseite importieren.
 *
 * Alle direkt, ohne Karte: sie sind privat und umkehrbar (entfernt wird nur
 * die Verknüpfung, das Dokument bleibt in der Bibliothek). Jede Aktion prüft
 * zuerst `refuseForbiddenAction`, dann `canEdit` aufs Notebook; umbenennen und
 * verschlagworten zusätzlich, dass die Quelle der Person selbst gehört — ein
 * Mitglied eines geteilten Notebooks ändert keine fremden Uploads. Verschieben
 * und kopieren nehmen ebenfalls nur eigene Dokumente mit, wie `add_documents`
 * und die REST-Route: sonst zöge ein Mitglied fremde Uploads in eigene
 * Freigaben.
 *
 * Nach jeder Änderung der Mitgliedschaft wird `document_count` aus der
 * Verknüpfungssammlung neu gezählt, wie `removeDocument` im
 * Contract-Router — Rechnen auf einem Schnappschuss driftet.
 *
 * `add_url` geht über denselben Weg wie die REST-Route `crawl-url-manual`
 * (`urlCrawlerService.crawlUrl` → `processUrlContent`); geholt wird nur die
 * von `validateUrlForFetch` zurückgegebene URL.
 */
import { NOTEBOOK_MAX_DOCUMENTS } from '@gruenerator/contracts';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../../database/services/QdrantService/index.js';
import { setPayload } from '../../../database/services/QdrantService/operations/batchOperations.js';
import { getDocumentProcessingService } from '../../../services/document-services/DocumentProcessingService/index.js';
import { resolveSourceInNotebook } from '../../../services/notebook/notebookSources.js';
import { createLogger } from '../../../utils/logger.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import { checkNotebookAccess } from '../../notebook/notebookAccess.js';

import { groundNote, refuseForbiddenAction } from './personalDataTools.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../../database/services/NotebookQdrantHelper.js';
import type { PostgresService } from '../../../database/services/PostgresService.js';
import type { NotebookAccess } from '../../notebook/notebookAccess.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';

const log = createLogger('notebookSourceWriteActions');

export const WRITE_ACTIONS = [
  'remove',
  'move',
  'copy',
  'rename',
  'tag',
  'add_note',
  'add_url',
] as const;

export type WriteAction = (typeof WRITE_ACTIONS)[number];

export function isWriteAction(action: string): action is WriteAction {
  return (WRITE_ACTIONS as readonly string[]).includes(action);
}

/** Fester Text je Aktion, wenn ein Dienst ausfällt — nie als Erfolg. */
export const WRITE_FAILURE_BY_ACTION: Record<WriteAction, string> = {
  remove:
    'Die Quellen ließen sich gerade nicht entfernen — es wurde nichts bestätigt, bitte später erneut versuchen.',
  move: 'Die Quellen ließen sich gerade nicht verschieben — es wurde nichts bestätigt, bitte später erneut versuchen.',
  copy: 'Die Quellen ließen sich gerade nicht kopieren — es wurde nichts bestätigt, bitte später erneut versuchen.',
  rename:
    'Die Quelle ließ sich gerade nicht umbenennen — es wurde nichts bestätigt, bitte später erneut versuchen.',
  tag: 'Die Schlagwörter ließen sich gerade nicht speichern — es wurde nichts bestätigt, bitte später erneut versuchen.',
  add_note:
    'Die Notiz ließ sich gerade nicht anlegen — es wurde nichts bestätigt, bitte später erneut versuchen.',
  add_url:
    'Die Seite ließ sich gerade nicht importieren — es wurde nichts bestätigt, bitte später erneut versuchen.',
};

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';
const NO_EDIT = 'Keine Berechtigung, dieses Notebook zu bearbeiten.';
const TARGET_NOT_FOUND = 'Ziel-Notebook nicht gefunden oder kein Zugriff.';
const TARGET_NO_EDIT = 'Keine Berechtigung, das Ziel-Notebook zu bearbeiten.';
const NOT_OWN_UPLOAD =
  'Umbenennen und Verschlagworten geht nur bei Quellen, die du selbst hochgeladen hast.';
const FULL = `Ein Notebook fasst höchstens ${NOTEBOOK_MAX_DOCUMENTS} Dokumente.`;
const REMOVE_NOTE =
  'Aus dem Notebook entfernt — die Dokumente bleiben in der Bibliothek (rückgängig mit notebooks add_documents).';

const TAG_MAX_CHARS = 40;
const TAG_MAX_COUNT = 20;
const NOTE_MIN_CHARS = 20;

export interface CrawledPage {
  success: boolean;
  data?: { title?: string | undefined; content?: string | undefined } | undefined;
  error?: string | undefined;
}

export interface NotebookSourceWriteDeps {
  db: Pick<PostgresService, 'query'>;
  helper: Pick<
    NotebookQdrantHelper,
    | 'getNotebookCollection'
    | 'getCollectionDocuments'
    | 'isDocumentInCollection'
    | 'addDocumentsToCollection'
    | 'removeDocumentsFromCollection'
    | 'updateNotebookCollection'
  >;
  access: (notebookId: string, userId: string) => Promise<NotebookAccess>;
  processText: (
    userId: string,
    title: string,
    content: string,
    sourceType: string
  ) => Promise<{ id: string; title: string }>;
  processUrl: (
    userId: string,
    url: string,
    title: string,
    content: string,
    sourceType: string
  ) => Promise<{ id: string; title: string }>;
  crawlUrl: (url: string) => Promise<CrawledPage>;
  validateUrl: (raw: string) => Promise<{ isValid: boolean; error?: string; url?: URL }>;
  /** Titel in den Chunk-Nutzlasten nachziehen — nur Anzeige, darf scheitern. */
  setChunkTitle: (documentId: string, ownerUserId: string, title: string) => Promise<void>;
}

let helperSingleton: NotebookQdrantHelper | null = null;

async function setChunkTitleInQdrant(
  documentId: string,
  ownerUserId: string,
  title: string
): Promise<void> {
  const qdrant = getQdrantInstance();
  await qdrant.ensureConnected();
  await setPayload(
    qdrant.client!,
    qdrant.collections.documents,
    { title },
    {
      must: [
        { key: 'document_id', match: { value: documentId } },
        { key: 'user_id', match: { value: ownerUserId } },
      ],
    }
  );
}

export function resolveWriteDeps(
  partial: Partial<NotebookSourceWriteDeps> | undefined
): NotebookSourceWriteDeps {
  return {
    db: partial?.db ?? getPostgresInstance(),
    helper: partial?.helper ?? (helperSingleton ??= new NotebookQdrantHelper()),
    access: partial?.access ?? checkNotebookAccess,
    processText:
      partial?.processText ??
      ((userId, title, content, sourceType) =>
        getDocumentProcessingService().processTextContent(userId, title, content, sourceType)),
    processUrl:
      partial?.processUrl ??
      ((userId, url, title, content, sourceType) =>
        getDocumentProcessingService().processUrlContent(userId, url, title, content, sourceType)),
    crawlUrl:
      partial?.crawlUrl ??
      (async (url) => {
        // Dynamisch wie in `manualController.ts`: der Crawler zieht Crawlee nach.
        const { urlCrawlerService } =
          await import('../../../services/scrapers/implementations/UrlCrawler/index.js');
        return urlCrawlerService.crawlUrl(url);
      }),
    validateUrl: partial?.validateUrl ?? ((raw) => validateUrlForFetch(raw)),
    setChunkTitle: partial?.setChunkTitle ?? setChunkTitleInQdrant,
  };
}

export interface WriteArgs {
  action: WriteAction;
  notebookId?: string | undefined;
  sourceId?: string | undefined;
  sourceIds?: string[] | undefined;
  targetNotebookId?: string | undefined;
  title?: string | undefined;
  add?: string[] | undefined;
  remove?: string[] | undefined;
  text?: string | undefined;
  url?: string | undefined;
}

export interface WriteContext {
  state: ChatGraphState;
  sourceRegistry: SourceRegistry;
  userId: string;
  deps: NotebookSourceWriteDeps;
  /** Die Notebook-Auflösung des Werkzeugs — ausdrückliche id oder die Chat-Auswahl. */
  resolveNotebook: (
    explicit: string | undefined
  ) => Promise<{ collection: NotebookCollection } | { error: string }>;
}

type Outcome = Record<string, unknown>;

/**
 * Führt eine schreibende Aktion aus. Wirft bei Dienstausfällen — der Aufrufer
 * setzt dann `WRITE_FAILURE_BY_ACTION` ein.
 */
export async function runWriteAction(args: WriteArgs, ctx: WriteContext): Promise<Outcome> {
  const forbidden = refuseForbiddenAction(ctx.state);
  if (forbidden) return forbidden;

  const target = await ctx.resolveNotebook(args.notebookId);
  if ('error' in target) return target;
  const { collection } = target;

  const access = await ctx.deps.access(collection.id, ctx.userId);
  if (!access.exists || !access.canRead) return { error: NOT_FOUND };
  if (!access.canEdit) return { error: NO_EDIT };

  switch (args.action) {
    case 'remove':
      return await removeSources(collection, args, ctx);
    case 'move':
    case 'copy':
      return await transferSources(collection, args, ctx);
    case 'rename':
      return await renameSource(collection, args, ctx);
    case 'tag':
      return await tagSource(collection, args, ctx);
    case 'add_note':
      return await addNote(collection, args, ctx);
    case 'add_url':
      return await addUrl(collection, args, ctx);
  }
}

// ---------------------------------------------------------------------------
// Mitgliedschaft
// ---------------------------------------------------------------------------

async function memberIds(
  deps: NotebookSourceWriteDeps,
  collectionId: string
): Promise<Set<string>> {
  // `rethrow`: ohne ihn läse sich ein Qdrant-Ausfall als leeres Notebook —
  // jede Quelle wäre dann „nicht im Notebook", der Zähler fiele auf 0.
  const links = await deps.helper.getCollectionDocuments(collectionId, { rethrow: true });
  return new Set(links.map((l) => l.document_id));
}

async function recount(deps: NotebookSourceWriteDeps, collectionId: string): Promise<number> {
  const count = (await memberIds(deps, collectionId)).size;
  await deps.helper.updateNotebookCollection(collectionId, { document_count: count });
  return count;
}

function cleanIds(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).map((i) => i.trim()).filter(Boolean))];
}

async function removeSources(
  collection: NotebookCollection,
  args: WriteArgs,
  { deps, sourceRegistry }: WriteContext
): Promise<Outcome> {
  const ids = cleanIds(args.sourceIds);
  if (ids.length === 0) return { error: 'remove braucht sourceIds (aus list, Feld ref).' };

  const existing = await memberIds(deps, collection.id);
  const known = ids.filter((i) => existing.has(i));
  const skipped = ids.filter((i) => !existing.has(i));
  if (known.length === 0) {
    return { error: `Nicht in diesem Notebook: ${skipped.join(', ')}. Die IDs stammen aus list.` };
  }

  await deps.helper.removeDocumentsFromCollection(collection.id, known);
  const remaining = await recount(deps, collection.id);

  const note = [
    `${known.length} Quelle(n) aus „${collection.name}" entfernt.`,
    REMOVE_NOTE,
    skipped.length ? `Nicht im Notebook, übersprungen: ${skipped.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  groundNote(sourceRegistry, 'Quellen entfernt', note);
  return { ok: true, removed: known.length, skipped, remaining, note };
}

async function transferSources(
  collection: NotebookCollection,
  args: WriteArgs,
  ctx: WriteContext
): Promise<Outcome> {
  const { deps, userId, sourceRegistry } = ctx;
  const verb = args.action === 'move' ? 'verschoben' : 'kopiert';
  const ids = cleanIds(args.sourceIds);
  if (ids.length === 0) return { error: `${args.action} braucht sourceIds (aus list, Feld ref).` };
  const targetId = args.targetNotebookId?.trim();
  if (!targetId) {
    return { error: `${args.action} braucht targetNotebookId (aus notebooks action="list").` };
  }
  if (targetId === collection.id) {
    return { error: 'Quelle und Ziel sind dasselbe Notebook.' };
  }

  const resolved = await ctx.resolveNotebook(targetId);
  if ('error' in resolved) {
    return resolved.error === NOT_FOUND ? { error: TARGET_NOT_FOUND } : resolved;
  }
  const targetNotebook = resolved.collection;
  const targetAccess = await deps.access(targetNotebook.id, userId);
  if (!targetAccess.exists || !targetAccess.canRead) return { error: TARGET_NOT_FOUND };
  if (!targetAccess.canEdit) return { error: TARGET_NO_EDIT };

  const existing = await memberIds(deps, collection.id);
  const inSource = ids.filter((i) => existing.has(i));
  const skipped = ids.filter((i) => !existing.has(i));
  if (inSource.length === 0) {
    return { error: `Nicht in diesem Notebook: ${skipped.join(', ')}. Die IDs stammen aus list.` };
  }

  const owners = await deps.db.query<{ id: string; user_id: string | null }>(
    'SELECT id, user_id FROM documents WHERE id = ANY($1)',
    [inSource]
  );
  const own = new Set(owners.filter((r) => r.user_id === userId).map((r) => String(r.id)));
  const movable = inSource.filter((i) => own.has(i));
  const foreign = inSource.filter((i) => !own.has(i));
  if (movable.length === 0) {
    return {
      error: `Nur selbst hochgeladene Quellen lassen sich ${verb === 'verschoben' ? 'verschieben' : 'kopieren'} — ${foreign.join(', ')} gehören jemand anderem.`,
    };
  }

  const inTarget = await memberIds(deps, targetNotebook.id);
  const toAdd = movable.filter((i) => !inTarget.has(i));
  if (inTarget.size + toAdd.length > NOTEBOOK_MAX_DOCUMENTS) return { error: FULL };

  if (toAdd.length > 0) {
    await deps.helper.addDocumentsToCollection(targetNotebook.id, toAdd, userId);
  }
  await recount(deps, targetNotebook.id);
  if (args.action === 'move') {
    await deps.helper.removeDocumentsFromCollection(collection.id, movable);
    await recount(deps, collection.id);
  }

  const alreadyInTarget = movable.length - toAdd.length;
  const count = args.action === 'move' ? movable.length : toAdd.length;
  const note = [
    `${count} Quelle(n) von „${collection.name}" nach „${targetNotebook.name}" ${verb}.`,
    alreadyInTarget ? `${alreadyInTarget} lag(en) dort schon.` : '',
    foreign.length ? `Fremde Uploads bleiben, wo sie sind: ${foreign.join(', ')}.` : '',
    skipped.length ? `Nicht im Notebook, übersprungen: ${skipped.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  groundNote(
    sourceRegistry,
    args.action === 'move' ? 'Quellen verschoben' : 'Quellen kopiert',
    note
  );
  return {
    ok: true,
    [args.action === 'move' ? 'moved' : 'copied']: count,
    alreadyInTarget,
    foreign,
    skipped,
    target: { id: targetNotebook.id, name: targetNotebook.name },
    note,
  };
}

// ---------------------------------------------------------------------------
// Eine eigene Quelle ändern
// ---------------------------------------------------------------------------

/** Mitgliedschaft über `resolveSourceInNotebook`, dann: gehört sie der Person? */
async function resolveOwnSource(
  collection: NotebookCollection,
  sourceId: string,
  { deps, userId }: WriteContext
): Promise<{ ok: true } | { error: string }> {
  const source = await resolveSourceInNotebook(
    { collectionId: collection.id, sourceId, userId },
    deps
  );
  if (!source.ok) return { error: source.error };
  if (source.ownerUserId !== userId) return { error: NOT_OWN_UPLOAD };
  return { ok: true };
}

async function renameSource(
  collection: NotebookCollection,
  args: WriteArgs,
  ctx: WriteContext
): Promise<Outcome> {
  const { deps, userId, sourceRegistry } = ctx;
  const sourceId = args.sourceId?.trim();
  if (!sourceId) return { error: 'rename braucht sourceId (aus list, Feld ref).' };
  const title = args.title?.trim();
  if (!title) return { error: 'rename braucht title.' };

  const own = await resolveOwnSource(collection, sourceId, ctx);
  if ('error' in own) return own;

  const updated = await deps.db.query<{ id: string }>(
    'UPDATE documents SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id',
    [title, sourceId, userId]
  );
  if (updated.length === 0) return { error: NOT_OWN_UPLOAD };

  // Die Chunks tragen den Titel nur zur Anzeige in Treffern; die Zeile in
  // `documents` ist die Wahrheit. Ein Qdrant-Ausfall kippt die Umbenennung nicht.
  try {
    await deps.setChunkTitle(sourceId, userId, title);
  } catch (err) {
    log.warn(`[notebook_quellen] rename: chunk titles for ${sourceId} not updated`, err);
  }

  const note = `Quelle in „${title}" umbenannt.`;
  groundNote(sourceRegistry, 'Quelle umbenannt', note);
  return { ok: true, sourceId, title, note };
}

function readTags(raw: unknown): string[] {
  let meta: unknown = raw;
  if (typeof raw === 'string') {
    try {
      meta = JSON.parse(raw);
    } catch {
      meta = null;
    }
  }
  const tags = meta && typeof meta === 'object' ? (meta as { tags?: unknown }).tags : null;
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

async function tagSource(
  collection: NotebookCollection,
  args: WriteArgs,
  ctx: WriteContext
): Promise<Outcome> {
  const { deps, userId, sourceRegistry } = ctx;
  const sourceId = args.sourceId?.trim();
  if (!sourceId) return { error: 'tag braucht sourceId (aus list, Feld ref).' };
  const add = (args.add ?? []).map((t) => t.trim()).filter(Boolean);
  const remove = new Set(
    (args.remove ?? []).map((t) => t.trim().toLocaleLowerCase('de')).filter(Boolean)
  );
  if (add.length === 0 && remove.size === 0) {
    return { error: 'tag braucht add oder remove (Listen von Schlagwörtern).' };
  }
  const tooLong = add.find((t) => t.length > TAG_MAX_CHARS);
  if (tooLong) {
    return { error: `Ein Schlagwort hat höchstens ${TAG_MAX_CHARS} Zeichen: „${tooLong}".` };
  }

  const own = await resolveOwnSource(collection, sourceId, ctx);
  if ('error' in own) return own;

  const rows = await deps.db.query<{ metadata: unknown }>(
    'SELECT metadata FROM documents WHERE id = $1 AND user_id = $2',
    [sourceId, userId]
  );
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of [...readTags(rows[0]?.metadata), ...add]) {
    const key = t.toLocaleLowerCase('de');
    if (seen.has(key) || remove.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  if (tags.length > TAG_MAX_COUNT) {
    return { error: `Eine Quelle trägt höchstens ${TAG_MAX_COUNT} Schlagwörter.` };
  }

  const updated = await deps.db.query<{ id: string }>(
    "UPDATE documents SET metadata = jsonb_set(coalesce(metadata,'{}'::jsonb), '{tags}', $1::jsonb) WHERE id = $2 AND user_id = $3 RETURNING id",
    [JSON.stringify(tags), sourceId, userId]
  );
  if (updated.length === 0) return { error: NOT_OWN_UPLOAD };

  const note = tags.length
    ? `Schlagwörter der Quelle: ${tags.join(', ')}.`
    : 'Die Quelle hat jetzt keine Schlagwörter mehr.';
  groundNote(sourceRegistry, 'Schlagwörter gesetzt', note);
  return { ok: true, sourceId, tags, note };
}

// ---------------------------------------------------------------------------
// Neue Quellen
// ---------------------------------------------------------------------------

async function hasRoom(deps: NotebookSourceWriteDeps, collectionId: string): Promise<boolean> {
  return (await memberIds(deps, collectionId)).size + 1 <= NOTEBOOK_MAX_DOCUMENTS;
}

async function attachNew(
  collection: NotebookCollection,
  created: { id: string; title: string },
  { deps, userId, sourceRegistry }: WriteContext,
  what: string
): Promise<Outcome> {
  await deps.helper.addDocumentsToCollection(collection.id, [created.id], userId);
  const count = await recount(deps, collection.id);
  const note = `${what} „${created.title}" liegt jetzt im Notebook „${collection.name}".`;
  groundNote(sourceRegistry, `${what} hinzugefügt`, note);
  return { ok: true, sourceId: created.id, title: created.title, documentCount: count, note };
}

async function addNote(
  collection: NotebookCollection,
  args: WriteArgs,
  ctx: WriteContext
): Promise<Outcome> {
  const title = args.title?.trim();
  if (!title) return { error: 'add_note braucht title.' };
  const text = args.text ?? '';
  if (text.trim().length < NOTE_MIN_CHARS) {
    return { error: `add_note braucht text mit mindestens ${NOTE_MIN_CHARS} Zeichen.` };
  }
  // Vor dem Einbetten: die Einbettung kostet, ein volles Notebook nimmt sie nicht.
  if (!(await hasRoom(ctx.deps, collection.id))) return { error: FULL };

  const created = await ctx.deps.processText(ctx.userId, title, text, 'note');
  return await attachNew(collection, created, ctx, 'Notiz');
}

async function addUrl(
  collection: NotebookCollection,
  args: WriteArgs,
  ctx: WriteContext
): Promise<Outcome> {
  const raw = args.url?.trim();
  if (!raw) return { error: 'add_url braucht url.' };
  const check = await ctx.deps.validateUrl(raw);
  if (!check.isValid || !check.url) {
    log.warn(`[notebook_quellen] add_url rejected: ${check.error ?? 'invalid'}`);
    return {
      error: 'Diese URL ist ungültig oder nicht erlaubt — nur öffentliche http(s)-Adressen.',
    };
  }
  // Ab hier nur noch die geprüfte, normalisierte URL — nie der Rohtext.
  const url = check.url.toString();
  if (!(await hasRoom(ctx.deps, collection.id))) return { error: FULL };

  const page = await ctx.deps.crawlUrl(url);
  const content = page.success ? page.data?.content?.trim() : undefined;
  if (!content) {
    log.warn(`[notebook_quellen] add_url crawl failed: ${page.error ?? 'empty content'}`);
    return {
      error:
        'Die Seite ließ sich nicht laden oder enthielt keinen lesbaren Text — es wurde nichts importiert.',
    };
  }
  const title = args.title?.trim() || page.data?.title?.trim() || check.url.hostname;
  const created = await ctx.deps.processUrl(ctx.userId, url, title, content, 'url');
  return await attachNew(collection, created, ctx, 'Seite');
}
