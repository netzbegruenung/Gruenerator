/**
 * `notebooks` — die Notebooks der Person im agentischen Loop.
 *
 * EIN Werkzeug mit `action`-Enum wie `cloudFileTools.ts`, aus demselben Grund
 * (Katalogbudget). Bis 09/2026 konnte es nur auflisten, umbenennen und
 * löschen; der MCP-Server konnte ein Notebook inhaltlich befragen, der eigene
 * Chat nicht. Jetzt deckt es die Notebook-Seite ab: Details, Befragen,
 * Anlegen, Wolke-Ordner anhängen (mit sofortigem, gedeckeltem Import),
 * Dokumente hinzufügen, Sichtbarkeit, mit einem Projekt teilen.
 *
 * Drei Gatter, nach Wirkung sortiert:
 * - Karte (`confirm_action`): alles, was Inhalte exponiert oder Kosten
 *   auslöst — Wolke-Import (OCR seitenweise abgerechnet), Sichtbarkeit,
 *   Teilen. Ausgeführt in `confirmController.executeAction`.
 * - `confirm=true` im Werkzeug: Löschen.
 * - direkt: private, umkehrbare Änderungen (anlegen, umbenennen, Dokumente
 *   hinzufügen).
 *
 * Zugriff über `checkNotebookAccess`, nicht über `user_id === userId`: geteilte
 * Notebooks sind lesbar (get/search) und je nach edit_policy bearbeitbar
 * (rename/add_documents); Ordner, Sichtbarkeit, Teilen und Löschen bleiben
 * Owner-only — Pending-Zeilen und der Wächter laufen als Owner, und
 * `getShareLink` löst nur eigene Links auf.
 *
 * Dienste kommen über `ctx.deps` herein, damit der Test ohne Qdrant, Postgres
 * und Wolke jede Aktion durchspielen kann.
 */
import {
  NOTEBOOK_MAX_DOCUMENTS,
  type LinkedDocRef,
  type WolkeFolderRef,
} from '@gruenerator/contracts';
import { buildNotebookSlug } from '@gruenerator/shared/utils';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { findGroups } from '../../../services/groups/groupQueries.js';
import { runNotebookSearch } from '../../../services/notebook/notebookToolSearch.js';
import { planNotebookVisibility } from '../../../services/notebook/notebookVisibility.js';
import { previewWolkeFolder } from '../../../services/notebook/notebookWolkeAttach.js';
import { createLogger } from '../../../utils/logger.js';
import { checkNotebookAccess } from '../../notebook/notebookAccess.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import {
  groundNote,
  groundRows,
  makeRow,
  NO_SESSION,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';

import type {
  PendingAction,
  SearchResult,
  UserLocale,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  NotebookCollection,
  NotebookEditPolicy,
  NotebookShareMode,
} from '../../../database/services/NotebookQdrantHelper.js';
import type { PostgresService } from '../../../database/services/PostgresService.js';
import type {
  NotebookSearchInput,
  NotebookSearchOutcome,
} from '../../../services/notebook/notebookToolSearch.js';
import type {
  WolkeFolderPreview,
  WolkeFolderPreviewInput,
} from '../../../services/notebook/notebookWolkeAttach.js';
import type { NotebookAccess } from '../../notebook/notebookAccess.js';

const log = createLogger('notebookTools');

/** Wie viele Dokumenttitel `get` höchstens nennt. */
const GET_MAX_DOCUMENTS = 30;

/** Ein Notebook-Detailblock ist länger als die 1500 Zeichen der Registry. */
const DETAIL_SNIPPET_CHARS = 4000;

/** Deckel des Inline-Imports — die Zahl steht auf der Karte. */
const INLINE_IMPORT_MAX = 5;

export interface NotebookToolDeps {
  helper: Pick<
    NotebookQdrantHelper,
    | 'getUserNotebookCollections'
    | 'getNotebookCollection'
    | 'updateNotebookCollection'
    | 'deleteNotebookCollection'
    | 'storeNotebookCollection'
    | 'addDocumentsToCollection'
    | 'getCollectionDocuments'
  >;
  access: (notebookId: string, userId: string) => Promise<NotebookAccess>;
  search: (input: NotebookSearchInput) => Promise<NotebookSearchOutcome>;
  preview: (input: WolkeFolderPreviewInput) => Promise<WolkeFolderPreview | { error: string }>;
  findGroups: typeof findGroups;
  db: Pick<PostgresService, 'query'>;
}

/** `PersonalToolCtx` plus optionale Fakes — der Katalog reicht den Ctx ohne `deps`. */
export type NotebookToolCtx = PersonalToolCtx & { deps?: Partial<NotebookToolDeps> };

let helperSingleton: NotebookQdrantHelper | null = null;

function resolveDeps(partial: Partial<NotebookToolDeps> | undefined): NotebookToolDeps {
  return {
    helper: partial?.helper ?? (helperSingleton ??= new NotebookQdrantHelper()),
    access: partial?.access ?? checkNotebookAccess,
    search: partial?.search ?? runNotebookSearch,
    preview: partial?.preview ?? previewWolkeFolder,
    findGroups: partial?.findGroups ?? findGroups,
    db: partial?.db ?? getPostgresInstance(),
  };
}

const SHARE_MODE_LABEL: Record<NotebookShareMode, string> = {
  private: 'Privat',
  groups: 'Geteilte Projekte',
  authenticated: 'Mit Anmeldung (alle angemeldeten Personen dieser Instanz)',
};

const EDIT_POLICY_LABEL: Record<NotebookEditPolicy, string> = {
  owner_only: 'nur Eigentümer*in',
  group_admins: 'Admins der geteilten Projekte',
  all_members: 'alle Mitglieder der geteilten Projekte',
};

const NOT_FOUND = 'Notebook nicht gefunden oder kein Zugriff.';
const OWNER_ONLY = 'Das kann nur die Eigentümer*in des Notebooks.';
const NO_EDIT = 'Keine Berechtigung, dieses Notebook zu bearbeiten.';

export function notebookUrl(c: Pick<NotebookCollection, 'id' | 'name' | 'slug_suffix'>): string {
  return `/notebooks/${c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id}`;
}

function readFolders(settings: Record<string, unknown>): WolkeFolderRef[] {
  const raw = settings.wolke_folders;
  return Array.isArray(raw) ? (raw as WolkeFolderRef[]) : [];
}

function readLinkedDocs(settings: Record<string, unknown>): LinkedDocRef[] {
  const raw = settings.linked_docs;
  return Array.isArray(raw) ? (raw as LinkedDocRef[]) : [];
}

/**
 * Ein leeres, privates Notebook anlegen — der Weg für `create` ohne Ordner
 * und für den MCP-Override. Der Helper verlangt kein Dokument; nur die
 * HTTP-Route tut das.
 */
export async function createNotebookDirect(
  helper: Pick<NotebookQdrantHelper, 'storeNotebookCollection'>,
  input: { userId: string; name: string; description: string | null; audience: UserLocale }
): Promise<{ id: string; url: string }> {
  const created = await helper.storeNotebookCollection({
    user_id: input.userId,
    name: input.name,
    description: input.description,
    audience: input.audience,
    settings: { wolke_folders: [], linked_docs: [], wordpress_sites: [] },
    document_count: 0,
  });
  return {
    id: created.collection_id,
    url: notebookUrl({
      id: created.collection_id,
      name: input.name,
      slug_suffix: created.slug_suffix,
    }),
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const wolkeFolderSchema = z.object({
  connectionId: z
    .string()
    .optional()
    .describe(
      'Id aus cloud_files action="list_connections"; bei genau einer eigenen Verbindung weglassbar'
    ),
  path: z.string().describe('Ordnerpfad relativ zur Verbindung, aus cloud_files action="list"'),
  includeSubfolders: z
    .boolean()
    .optional()
    .describe('Auch Unterordner übernehmen (langsamer, mehr OCR)'),
});

export function makeNotebooksTool(ctx: NotebookToolCtx): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  const deps = resolveDeps(ctx.deps);
  const audience: UserLocale = state.userLocale ?? 'de-DE';

  return tool({
    description: `Zugriff auf die Notebooks der Person (eigene Wissenssammlungen aus Dokumenten, Wolke-Ordnern und Office-Dokumenten) — auflisten, ansehen, inhaltlich befragen, anlegen und verwalten.

NUTZE FÜR: Notebooks auflisten (list), Details eines Notebooks mit Dokumenten, Wolke-Ordnern, Freigaben und wartenden Dateien (get), eine Frage AN DEN INHALT eines Notebooks stellen und belegt beantworten (search mit id + query — „was steht im Notebook X zu …?"), ein Notebook anlegen (create; mit wolkeFolder wird der Ordner sofort angehängt und importiert), einen Wolke-Ordner an ein bestehendes Notebook hängen (add_wolke_folder), eigene Dokumente oder Office-Dokumente hinzufügen (add_documents), umbenennen (rename), Sichtbarkeit und Bearbeitungsrechte ändern (set_visibility), mit einem Projekt teilen (share_to_group), löschen (delete mit confirm=true nach Zustimmung).

NICHT für: Dateien in der Wolke durchsehen oder lesen (dafür 'cloud_files' — action=list_connections liefert die connectionId und action=list die Pfade, die wolkeFolder braucht), eigene Dokumente und Tabellen selbst (dafür 'documents'), Projekte verwalten (dafür 'groups'), die grüne Inhaltsdatenbank (dafür 'gruenerator_search').

Wolke-Import, Sichtbarkeit und Teilen werden der Person als Karte zur Bestätigung angezeigt — kündige nichts als erledigt an, was nur angefordert ist. Die id stammt aus list (Feld ref) oder get; rate sie nie.`,
    inputSchema: z.object({
      action: z.enum([
        'list',
        'get',
        'search',
        'create',
        'add_wolke_folder',
        'add_documents',
        'rename',
        'set_visibility',
        'share_to_group',
        'delete',
      ]),
      id: z.string().optional().describe('Notebook-ID (alle Aktionen außer list und create)'),
      name: z.string().optional().describe('Name (create) bzw. neuer Name (rename)'),
      description: z.string().optional().describe('Beschreibung (create)'),
      query: z.string().optional().describe('Frage an den Inhalt (search)'),
      documentIds: z
        .array(z.string())
        .optional()
        .describe('IDs eigener Dokumente oder Office-Dokumente (add_documents)'),
      wolkeFolder: wolkeFolderSchema.optional().describe('Wolke-Ordner (create, add_wolke_folder)'),
      shareMode: z
        .enum(['private', 'groups', 'authenticated'])
        .optional()
        .describe('set_visibility: privat / geteilte Projekte / mit Anmeldung'),
      editPolicy: z
        .enum(['owner_only', 'group_admins', 'all_members'])
        .optional()
        .describe('set_visibility: wer bearbeiten darf'),
      isPublic: z
        .boolean()
        .optional()
        .describe(
          'set_visibility: in „Von der Basis" listen (braucht shareMode=authenticated und publicOwnership)'
        ),
      publicOwnership: z
        .enum(['owner', 'public_data'])
        .optional()
        .describe(
          'set_visibility mit isPublic=true: Inhalte gehören der Person (owner) oder sind öffentlich (public_data)'
        ),
      groupName: z.string().optional().describe('Zielprojekt (share_to_group)'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Nur bei delete: erst true setzen, nachdem die Person zugestimmt hat.'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const { action, id } = args;
      const { helper } = deps;

      if (action === 'list') {
        const collections = await helper.getUserNotebookCollections(userId, { limit: args.limit });
        const results = collections.map((c) =>
          makeRow(
            c.name,
            notebookUrl(c),
            'Notebook',
            c.description || `${c.document_count} Dokument(e)`,
            c.id
          )
        );
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      if (action === 'create') {
        const forbidden = refuseForbiddenAction(state);
        if (forbidden) return forbidden;
        const name = args.name?.trim();
        if (!name) return { error: 'create braucht einen name.' };
        const description = args.description?.trim() || null;
        if (args.wolkeFolder) {
          return attachFolderCard({
            userId,
            collection: null,
            notebookName: name,
            description,
            folder: args.wolkeFolder,
          });
        }
        const created = await createNotebookDirect(helper, { userId, name, description, audience });
        const note = `Notebook „${name}" wurde angelegt (leer, privat).`;
        groundNote(sourceRegistry, 'Notebook angelegt', note);
        return { ok: true, notebook: { id: created.id, name, url: created.url }, note };
      }

      // Alle weiteren Aktionen zielen auf EIN Notebook.
      if (!id) return { error: `${action} braucht eine Notebook-ID (id).` };
      const access = await deps.access(id, userId);
      if (!access.exists || !access.canRead) return { error: NOT_FOUND };
      const collection = await helper.getNotebookCollection(id);
      if (!collection) return { error: NOT_FOUND };

      if (action === 'get') return getNotebook(collection, access);

      if (action === 'search') {
        const query = args.query?.trim();
        if (!query) return { error: 'search braucht query.' };
        const outcome = await deps.search({ collectionId: id, query, userId });
        if (!outcome.ok) {
          groundNote(sourceRegistry, `Notebook „${collection.name}"`, outcome.error);
          return { error: outcome.error };
        }
        const citations = outcome.result.citations ?? [];
        const sources = sourceRegistry.register(
          citations.map((c): SearchResult => ({
            source: 'notebook',
            title: c.document_title ?? c.title ?? 'Ohne Titel',
            content: c.cited_text ?? c.snippet ?? '',
            ...(c.source_url || c.url ? { url: (c.source_url ?? c.url) as string } : {}),
            ...(c.document_id ? { documentId: c.document_id } : {}),
            collectionId: id,
          }))
        );
        return {
          notebook: collection.name,
          answer: outcome.result.answer,
          resultCount: citations.length,
          citations: citations.map((c) => ({
            index: c.index,
            title: c.document_title ?? c.title ?? 'Ohne Titel',
            ...(c.source_url || c.url ? { url: c.source_url ?? c.url } : {}),
            snippet: (c.cited_text ?? c.snippet ?? '').slice(0, 200),
          })),
          sources,
        };
      }

      if (action === 'rename') {
        if (!access.canEdit) return { error: NO_EDIT };
        const name = args.name?.trim();
        if (!name) return { error: 'rename braucht name.' };
        await helper.updateNotebookCollection(id, { name });
        const note = `Notebook in „${name}" umbenannt.`;
        groundNote(sourceRegistry, 'Umbenannt', note);
        return { ok: true, note };
      }

      if (action === 'add_documents') {
        if (!access.canEdit) return { error: NO_EDIT };
        return addDocuments(userId, collection, args.documentIds ?? []);
      }

      // Ab hier Owner-only.
      if (!access.isOwner) return { error: OWNER_ONLY };

      if (action === 'add_wolke_folder') {
        if (!args.wolkeFolder)
          return { error: 'add_wolke_folder braucht wolkeFolder {connectionId?, path}.' };
        return attachFolderCard({
          userId,
          collection,
          notebookName: collection.name,
          description: collection.description,
          folder: args.wolkeFolder,
        });
      }

      if (action === 'set_visibility') return setVisibilityCard(userId, collection, args);

      if (action === 'share_to_group') return shareCard(userId, collection, args.groupName);

      // delete
      if (!args.confirm) {
        const ask = `Soll das Notebook „${collection.name}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`;
        groundNote(sourceRegistry, 'Bestätigung nötig', ask);
        return { needsConfirmation: true, note: ask };
      }
      await helper.deleteNotebookCollection(id);
      const note = `Notebook „${collection.name}" wurde gelöscht.`;
      groundNote(sourceRegistry, 'Gelöscht', note);
      return { ok: true, note };
    },
  });

  // -------------------------------------------------------------------------
  // get — Details als EIN Quellenblock
  // -------------------------------------------------------------------------

  async function getNotebook(
    collection: NotebookCollection,
    access: NotebookAccess
  ): Promise<Record<string, unknown>> {
    const url = notebookUrl(collection);
    const folders = readFolders(collection.settings);
    const linkedDocs = readLinkedDocs(collection.settings);
    const docLinks = await deps.helper.getCollectionDocuments(collection.id);
    const docIds = docLinks.map((d) => d.document_id).slice(0, GET_MAX_DOCUMENTS);

    // Titel, Freigaben und Warteschlange dürfen die Antwort nicht aufhalten:
    // die Sammlung liegt in Qdrant, der Rest in Postgres.
    let documents: Array<{ id: string; title: string }> = [];
    let sharedGroups: Array<{ id: string; name: string }> = [];
    let pendingCount = 0;
    let note: string | null = null;
    try {
      const [titleRows, groupRows, pendingRows] = await Promise.all([
        docIds.length
          ? (deps.db.query('SELECT id, title FROM documents WHERE id = ANY($1)', [
              docIds,
            ]) as Promise<Array<{ id: string; title: string }>>)
          : Promise.resolve([]),
        deps.db.query(
          `SELECT g.id, g.name FROM group_content_shares gcs
             INNER JOIN groups g ON g.id = gcs.group_id
             WHERE gcs.content_type = 'notebook_collections' AND gcs.content_id = $1
             ORDER BY g.name ASC`,
          [collection.id]
        ) as Promise<Array<{ id: string; name: string }>>,
        deps.db.query(
          `SELECT COUNT(*)::int AS n FROM wolke_pending_files WHERE collection_id = $1 AND status = 'pending'`,
          [collection.id]
        ) as Promise<Array<{ n: number }>>,
      ]);
      const titleById = new Map(titleRows.map((r) => [String(r.id), r.title]));
      documents = docIds.map((docId) => ({
        id: docId,
        title: titleById.get(docId) ?? '(ohne Titel)',
      }));
      sharedGroups = groupRows.map((g) => ({ id: g.id, name: g.name }));
      pendingCount = pendingRows[0]?.n ?? 0;
    } catch (err) {
      log.warn('[notebooks] get: postgres lookups failed', err);
      documents = docIds.map((docId) => ({ id: docId, title: '(Titel nicht geladen)' }));
      note = 'Dokumenttitel, Freigaben und Warteschlange ließen sich diesmal nicht laden.';
    }

    const lines = [
      `Notebook „${collection.name}" — ${url}`,
      collection.description ? `Beschreibung: ${collection.description}` : null,
      `${docLinks.length} Dokument(e)${linkedDocs.length ? `, ${linkedDocs.length} verknüpfte Office-Dokument(e)` : ''}${pendingCount ? `, ${pendingCount} neue Datei(en) aus der Wolke warten` : ''}`,
      `Sichtbarkeit: ${SHARE_MODE_LABEL[collection.share_mode]}; bearbeiten: ${EDIT_POLICY_LABEL[collection.edit_policy]}${collection.is_public ? '; gelistet in „Von der Basis"' : ''}`,
      folders.length
        ? `Wolke-Ordner: ${folders.map((f) => `${f.folderName} (${f.folderPath}${f.includeSubfolders ? ', mit Unterordnern' : ''})`).join('; ')}`
        : null,
      sharedGroups.length ? `Geteilt mit: ${sharedGroups.map((g) => g.name).join(', ')}` : null,
      documents.length
        ? `Dokumente${docLinks.length > documents.length ? ` (erste ${documents.length})` : ''}: ${documents.map((d) => d.title).join('; ')}`
        : null,
    ].filter((l): l is string => Boolean(l));
    sourceRegistry.register(
      [
        {
          source: 'eigene-inhalte',
          title: `Notebook: ${collection.name}`,
          content: lines.join('\n'),
          url,
        },
      ],
      { snippetChars: DETAIL_SNIPPET_CHARS }
    );

    return {
      notebook: {
        id: collection.id,
        name: collection.name,
        description: collection.description,
        url,
        documentCount: docLinks.length,
        linkedDocCount: linkedDocs.length,
        pendingCount,
        shareMode: collection.share_mode,
        editPolicy: collection.edit_policy,
        isPublic: collection.is_public,
        audience: collection.audience,
        isOwner: access.isOwner,
        canEdit: access.canEdit,
        wolkeFolders: folders.map((f) => ({
          folderName: f.folderName,
          folderPath: f.folderPath,
          shareLinkId: f.shareLinkId,
          includeSubfolders: f.includeSubfolders === true,
          lastSyncedAt: f.lastSyncedAt ?? null,
        })),
        sharedGroups,
        documents,
        ...(note ? { note } : {}),
      },
    };
  }

  // -------------------------------------------------------------------------
  // add_documents — eigene Dokumente direkt, Office-Dokumente als Verknüpfung
  // -------------------------------------------------------------------------

  async function addDocuments(
    userId: string,
    collection: NotebookCollection,
    documentIds: string[]
  ): Promise<Record<string, unknown>> {
    const ids = [...new Set(documentIds.map((d) => d.trim()).filter(Boolean))];
    if (ids.length === 0) return { error: 'add_documents braucht documentIds.' };

    const [owned, office] = await Promise.all([
      deps.db.query('SELECT id FROM documents WHERE user_id = $1 AND id = ANY($2)', [
        userId,
        ids,
      ]) as Promise<Array<{ id: string }>>,
      deps.db.query(
        'SELECT id, title FROM collaborative_documents WHERE created_by = $1 AND id = ANY($2) AND is_deleted = false',
        [userId, ids]
      ) as Promise<Array<{ id: string; title: string }>>,
    ]);
    const ownedIds = new Set(owned.map((r) => String(r.id)));
    const officeById = new Map(office.map((r) => [String(r.id), r.title]));
    const unknown = ids.filter((i) => !ownedIds.has(i) && !officeById.has(i));
    if (unknown.length > 0) {
      return {
        error: `Nicht gefunden oder kein Zugriff: ${unknown.join(', ')}. Die IDs stammen aus 'documents' action="list" oder 'find_content'.`,
      };
    }

    const existing = new Set(
      (await deps.helper.getCollectionDocuments(collection.id)).map((d) => d.document_id)
    );
    const newDocIds = ids.filter((i) => ownedIds.has(i) && !existing.has(i));
    const settings: Record<string, unknown> = { ...collection.settings };
    const linked = [...readLinkedDocs(settings)];
    const newLinked: LinkedDocRef[] = [];
    for (const [docId, docTitle] of officeById) {
      if (linked.some((l) => l.docId === docId)) continue;
      const ref: LinkedDocRef = { docId, docTitle, documentId: null, lastSyncedAt: null };
      linked.push(ref);
      newLinked.push(ref);
    }

    if (existing.size + newDocIds.length > NOTEBOOK_MAX_DOCUMENTS) {
      return { error: `Ein Notebook fasst höchstens ${NOTEBOOK_MAX_DOCUMENTS} Dokumente.` };
    }
    if (newDocIds.length === 0 && newLinked.length === 0) {
      const note = 'Alle genannten Dokumente sind schon im Notebook.';
      groundNote(sourceRegistry, 'Nichts hinzugefügt', note);
      return { ok: true, added: 0, linked: 0, note };
    }

    if (newDocIds.length > 0) {
      await deps.helper.addDocumentsToCollection(collection.id, newDocIds, userId);
    }
    settings.linked_docs = linked;
    await deps.helper.updateNotebookCollection(collection.id, {
      document_count: existing.size + newDocIds.length,
      settings,
    });

    const parts: string[] = [];
    if (newDocIds.length) parts.push(`${newDocIds.length} Dokument(e) hinzugefügt`);
    if (newLinked.length) {
      // Der Inhalt eines Office-Dokuments wird im Browser exportiert und
      // hochgeladen (`useNotebookFullSync`) — serverseitig gibt es diesen Weg
      // nicht. Die Verknüpfung steht, der Text kommt beim nächsten
      // Synchronisieren.
      parts.push(
        `${newLinked.length} Office-Dokument(e) verknüpft — ihr Text wird beim nächsten „Synchronisieren" im Notebook übernommen`
      );
    }
    const note = `Notebook „${collection.name}": ${parts.join('; ')}.`;
    groundNote(sourceRegistry, 'Dokumente hinzugefügt', note);
    return { ok: true, added: newDocIds.length, linked: newLinked.length, note };
  }

  // -------------------------------------------------------------------------
  // Karten
  // -------------------------------------------------------------------------

  async function attachFolderCard(args: {
    userId: string;
    collection: NotebookCollection | null;
    notebookName: string;
    description: string | null;
    folder: z.infer<typeof wolkeFolderSchema>;
  }): Promise<Record<string, unknown>> {
    const { userId, collection, notebookName, description, folder } = args;
    if (!threadId) return { error: 'Ein Wolke-Import ist in diesem Kontext nicht möglich.' };
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;
    const includeSubfolders = folder.includeSubfolders === true;

    let preview: WolkeFolderPreview;
    try {
      const p = await deps.preview({
        userId,
        connectionId: folder.connectionId,
        folderPath: folder.path,
        includeSubfolders,
      });
      if ('error' in p) return { error: p.error };
      preview = p;
    } catch (err) {
      log.warn('[notebooks] wolke preview failed', err);
      return { error: `Der Wolke-Ordner ließ sich nicht lesen: ${errMessage(err)}` };
    }

    if (collection) {
      const dup = readFolders(collection.settings).some(
        (f) => f.shareLinkId === preview.root.connectionId && f.folderPath === folder.path
      );
      if (dup) {
        const note = `Der Ordner „${preview.folderName}" hängt schon am Notebook „${collection.name}".`;
        groundNote(sourceRegistry, 'Schon angehängt', note);
        return { ok: true, alreadyAttached: true, note };
      }
    }

    const newFiles = preview.fileCount - preview.alreadyImported;
    const willImportNow = Math.min(newFiles, INLINE_IMPORT_MAX);
    const willQueue = newFiles - willImportNow;
    const shareLabel = preview.root.label || preview.root.host;

    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: collection ? 'Wolke-Ordner anhängen' : 'Notebook aus Wolke-Ordner anlegen',
      preview: `${preview.folderName} → ${notebookName}`,
      createdAt: Date.now(),
      type: 'attach_wolke_folder',
      payload: {
        collectionId: collection?.id ?? null,
        notebookName,
        description,
        audience,
        shareLinkId: preview.root.connectionId,
        shareLabel,
        folderPath: folder.path,
        folderName: preview.folderName,
        includeSubfolders,
        fileCount: preview.fileCount,
        alreadyImported: preview.alreadyImported,
      },
    };
    await emitToolConfirmAction(sse, pending, [
      { key: 'Notebook', value: collection ? notebookName : `${notebookName} (neu)` },
      { key: 'Wolke', value: shareLabel },
      {
        key: 'Ordner',
        value: `${preview.folderName}${includeSubfolders ? ' (mit Unterordnern)' : ''}`,
      },
      {
        key: 'Dateien',
        value: `${preview.fileCount}${preview.alreadyImported ? `, davon ${preview.alreadyImported} schon importiert` : ''}`,
      },
      {
        key: 'Jetzt',
        value:
          newFiles === 0
            ? 'nichts auszulesen'
            : `bis zu ${willImportNow} sofort auslesen${willQueue > 0 ? `, ${willQueue} unter „Neue Dateien"` : ''}`,
      },
    ]);
    const note = `Bestätigung angefordert: Ordner „${preview.folderName}" (${preview.fileCount} Dateien) ${collection ? `ans Notebook „${notebookName}" hängen` : `als neues Notebook „${notebookName}" anlegen`}.`;
    groundNote(sourceRegistry, 'Wolke-Ordner', note);
    return {
      ok: true,
      needsConfirmation: true,
      fileCount: preview.fileCount,
      alreadyImported: preview.alreadyImported,
      willImportNow,
      willQueue,
      note,
    };
  }

  async function setVisibilityCard(
    userId: string,
    collection: NotebookCollection,
    args: {
      shareMode?: NotebookShareMode | undefined;
      editPolicy?: NotebookEditPolicy | undefined;
      isPublic?: boolean | undefined;
      publicOwnership?: 'owner' | 'public_data' | undefined;
    }
  ): Promise<Record<string, unknown>> {
    if (!threadId) return { error: 'Sichtbarkeit ändern ist in diesem Kontext nicht möglich.' };
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;
    if (
      args.shareMode === undefined &&
      args.editPolicy === undefined &&
      args.isPublic === undefined
    ) {
      return { error: 'set_visibility braucht shareMode, editPolicy oder isPublic.' };
    }
    const patch = {
      ...(args.shareMode !== undefined ? { share_mode: args.shareMode } : {}),
      ...(args.editPolicy !== undefined ? { edit_policy: args.editPolicy } : {}),
      ...(args.isPublic !== undefined ? { is_public: args.isPublic } : {}),
      ...(args.publicOwnership !== undefined ? { public_ownership: args.publicOwnership } : {}),
    };
    // Dieselbe Prüfung wie beim Ausführen — eine Karte, die beim Klick an einer
    // Invariante scheitert, ist eine tote Karte.
    const plan = planNotebookVisibility(collection, patch);
    if (!plan.ok) return { error: plan.error };
    if (Object.keys(plan.updates).length === 0) {
      const note = 'Die Sichtbarkeit ist schon so eingestellt.';
      groundNote(sourceRegistry, 'Sichtbarkeit', note);
      return { ok: true, note };
    }

    const nextMode = plan.updates.share_mode ?? collection.share_mode;
    const nextPolicy = plan.updates.edit_policy ?? collection.edit_policy;
    const nextPublic = plan.updates.is_public ?? collection.is_public;
    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: 'Sichtbarkeit ändern',
      preview: `${collection.name}: ${SHARE_MODE_LABEL[nextMode]}`,
      createdAt: Date.now(),
      type: 'set_notebook_visibility',
      payload: { collectionId: collection.id, notebookName: collection.name, ...patch },
    };
    await emitToolConfirmAction(sse, pending, [
      { key: 'Notebook', value: collection.name },
      { key: 'Sichtbarkeit', value: SHARE_MODE_LABEL[nextMode] },
      { key: 'Bearbeiten', value: EDIT_POLICY_LABEL[nextPolicy] },
      { key: 'Von der Basis', value: nextPublic ? 'gelistet' : 'nicht gelistet' },
    ]);
    const note = `Bestätigung angefordert: Notebook „${collection.name}" auf „${SHARE_MODE_LABEL[nextMode]}" stellen.`;
    groundNote(sourceRegistry, 'Sichtbarkeit', note);
    return { ok: true, needsConfirmation: true, note };
  }

  async function shareCard(
    userId: string,
    collection: NotebookCollection,
    groupName: string | undefined
  ): Promise<Record<string, unknown>> {
    if (!threadId) return { error: 'Teilen ist in diesem Kontext nicht möglich.' };
    const forbidden = refuseForbiddenAction(state);
    if (forbidden) return forbidden;
    if (!groupName?.trim()) return { error: 'share_to_group braucht groupName.' };
    // Nur Projekte, in denen die Person Mitglied ist — `findGroups` liefert auch
    // öffentliche Gruppen mit leerer Rolle.
    const groups = await deps.findGroups(userId, groupName.trim(), 5);
    const group = groups.find((g) => g.role);
    if (!group) return { error: `Kein Projekt „${groupName}" gefunden, dem du angehörst.` };

    const pending: PendingAction = {
      actionId: newActionId(),
      threadId,
      userId,
      title: 'Notebook teilen',
      preview: `„${collection.name}" → ${group.name}`,
      createdAt: Date.now(),
      type: 'share_notebook',
      payload: {
        collectionId: collection.id,
        notebookName: collection.name,
        groupId: group.id,
        groupName: group.name,
      },
    };
    await emitToolConfirmAction(sse, pending, [
      { key: 'Notebook', value: collection.name },
      { key: 'Projekt', value: group.name },
      { key: 'Berechtigung', value: 'Nur lesen' },
    ]);
    const note = `Bestätigung zum Teilen von „${collection.name}" mit „${group.name}" angefordert.`;
    groundNote(sourceRegistry, 'Teilen', note);
    return { ok: true, needsConfirmation: true, note };
  }
}
