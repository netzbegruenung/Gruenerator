/**
 * Personal-data resource tools for the agentic chat loop.
 *
 * These turn the assistant into a front door to the user's OWN content — their
 * documents, boards, tasks, notebooks, groups and media — for both reading AND
 * light management (rename, move a card, set a due date, share to a group…).
 * Following the MCP-resource shape, each domain is ONE tool taking a flat
 * `action` enum; this keeps Mistral's catalog small (~one tool per domain)
 * instead of ~25 per-verb tools. Narrow on `args.action` (no destructuring).
 *
 * Access model:
 *   - Reads reuse the existing user-scoped services (same owned/shared/group
 *     predicates as the REST endpoints) → a tool can never surface another
 *     user's content. Lists return `{ results: [{title,url,snippet}] }`, the
 *     shape the frontend registry lifts into a clickable citation list.
 *   - Mutations that add to shared state or expose content (add_card, share)
 *     go through the EXISTING confirm_action flow (preview → confirm →
 *     confirmController.executeAction), reusing `modify_board` / `share_doc`.
 *   - Additive/reversible edits (rename, card field edits) run directly with a
 *     write-access check; deletes use a two-step confirm (the model must re-call
 *     with confirm=true only after the person agrees).
 *
 * userId comes off the shared `state.agentConfig?.userId` (set in streamContext).
 * SSE cards, timeout, truncation and step recording are layered on by
 * wrapToolsForLoop — these factories only implement data access + confirm emit.
 */
import { buildNotebookSlug, buildGroupSlug } from '@gruenerator/shared/utils';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { updateCard } from '../../../services/boards/boardCardWriteService.js';
import {
  listUserBoards,
  loadBoardState,
  resolveCardDisplay,
  type BoardState,
} from '../../../services/boards/BoardService.js';
import { findGroups, listUserGroups } from '../../../services/groups/groupQueries.js';
import {
  getSharedMediaService,
  USER_VISIBLE_SHARE_STATUSES,
} from '../../../services/sharedMediaService.js';
import { getSubtitlerProjectService } from '../../../services/subtitler/ProjectService.js';
import {
  listUserDocuments,
  officeKindLabel,
  officeSnippet,
  officeUrl,
  searchOfficeContent,
} from '../../docs/docsSearch.js';
import { aggregateRecentActivity } from '../../workplace/recentActivityController.js';
import { hasWriteAccess } from '../confirmController.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import type { ChatGraphState, PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from '../services/sseHelpers.js';

/** Context every resource tool closes over. Read actions use only `state`. */
export interface PersonalToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId: string | null;
}

/** A clickable result row — the frontend registry lifts `{ title, url }` into a citation list. */
interface ResultRow {
  title: string;
  url: string;
  snippet?: string;
  type?: string;
  /** Opaque handle for follow-up actions (e.g. media delete needs the share token). */
  ref?: string;
}

/** Build a row, omitting empty optionals (exactOptionalPropertyTypes: no `undefined`). */
function makeRow(
  title: string,
  url: string,
  type: string,
  snippet?: string | null,
  ref?: string
): ResultRow {
  return {
    title: title || '(ohne Titel)',
    url,
    type,
    ...(snippet ? { snippet } : {}),
    ...(ref ? { ref } : {}),
  };
}

const NO_SESSION = 'Keine Nutzer-Sitzung — diese Aktion braucht eine angemeldete Person.';

function requireUserId(state: ChatGraphState): string | null {
  return state.agentConfig?.userId ?? null;
}

/** Lazy notebook helper — instantiated once, only when a notebook action runs. */
let notebookHelperSingleton: NotebookQdrantHelper | null = null;
function notebookHelper(): NotebookQdrantHelper {
  notebookHelperSingleton ??= new NotebookQdrantHelper();
  return notebookHelperSingleton;
}

// ---------------------------------------------------------------------------
// find_content — cross-domain read over the user's own stuff
// ---------------------------------------------------------------------------

export function makeFindContentTool(ctx: PersonalToolCtx): Tool {
  const { state } = ctx;
  return tool({
    description: `Durchsucht die EIGENEN Inhalte der angemeldeten Person (Dokumente, Boards, Tabellen, Präsentationen, Notizbücher) oder listet die zuletzt bearbeiteten.

NUTZE WENN nach eigenen Inhalten gefragt wird ("zeig mir meine Dokumente", "finde mein Klima-Board", "woran habe ich zuletzt gearbeitet"). Für Detailfragen zu EINEM Board/Dokument nutze 'documents' oder 'boards_tasks'.`,
    inputSchema: z.object({
      action: z.enum(['search', 'recent']),
      query: z.string().optional().describe('Suchbegriff (nur bei action="search")'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ action, query, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };

      if (action === 'search') {
        const q = (query ?? '').trim();
        if (!q) return { error: 'Für die Suche wird ein Suchbegriff benötigt.' };
        const hits = await searchOfficeContent(userId, q, { limit });
        const results = hits.map((h) =>
          makeRow(
            h.title,
            officeUrl(h.document_subtype, h.id),
            officeKindLabel(h.document_subtype),
            officeSnippet(h.document_subtype, h.content)
          )
        );
        return { resultCount: results.length, results };
      }

      const items = await aggregateRecentActivity(userId, limit);
      const results = items.map((it) =>
        makeRow(it.title, it.href, it.documentType ?? it.type, it.content)
      );
      return { resultCount: results.length, results };
    },
  });
}

// ---------------------------------------------------------------------------
// documents — list/get + rename/delete/share_to_group
// ---------------------------------------------------------------------------

export function makeDocumentsTool(ctx: PersonalToolCtx): Tool {
  const { state, sse, threadId } = ctx;
  return tool({
    description: `Zugriff auf die EIGENEN Dokumente, Tabellen und Präsentationen (nicht Boards — dafür 'boards_tasks').

NUTZE FÜR: eigene Dokumente auflisten (list), eines per id ansehen (get), umbenennen (rename), löschen (delete), mit einer Gruppe teilen (share_to_group). Umbenennen wirkt sofort; Löschen und Teilen werden der Person zur Bestätigung angezeigt.`,
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'rename', 'delete', 'share_to_group']),
      id: z.string().optional().describe('Dokument-ID (get/rename/delete/share)'),
      title: z.string().optional().describe('Neuer Titel (nur bei action="rename")'),
      groupName: z.string().optional().describe('Zielgruppe (nur bei action="share_to_group")'),
      permission: z.enum(['viewer', 'editor']).default('viewer'),
      confirm: z
        .boolean()
        .default(false)
        .describe('Nur bei delete: erst true setzen, nachdem die Person zugestimmt hat.'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ action, id, title, groupName, permission, confirm, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const db = getPostgresInstance();

      if (action === 'list') {
        const docs = await listUserDocuments(userId, limit);
        const results = docs.map((d) =>
          makeRow(d.title, officeUrl(d.document_subtype, d.id), officeKindLabel(d.document_subtype))
        );
        return { resultCount: results.length, results };
      }

      // The remaining actions all target one document — resolve within the caller's set.
      const owned = await listUserDocuments(userId, 200);
      const match = id ? owned.find((d) => d.id === id) : undefined;

      if (action === 'get') {
        if (!match) return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
        return {
          document: {
            title: match.title,
            url: officeUrl(match.document_subtype, match.id),
            type: officeKindLabel(match.document_subtype),
          },
        };
      }

      if (action === 'rename') {
        if (!id || !title?.trim()) return { error: 'rename braucht id und title.' };
        if (!(await hasWriteAccess(id, userId))) {
          return { error: 'Keine Berechtigung, dieses Dokument umzubenennen.' };
        }
        await db.query(
          'UPDATE collaborative_documents SET title = $1, updated_at = NOW() WHERE id = $2',
          [title.trim(), id]
        );
        return { ok: true, note: `Dokument in „${title.trim()}" umbenannt.` };
      }

      if (action === 'delete') {
        if (!match) return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
        if (!confirm) {
          return {
            needsConfirmation: true,
            note: `Soll das Dokument „${match.title}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`,
          };
        }
        const rows = (await db.query(
          'SELECT created_by FROM collaborative_documents WHERE id = $1 AND is_deleted = false',
          [id]
        )) as { created_by: string }[];
        if (!rows.length || rows[0].created_by !== userId) {
          return { error: 'Nur die erstellende Person kann dieses Dokument löschen.' };
        }
        await db.query(
          'UPDATE collaborative_documents SET is_deleted = true, updated_at = NOW() WHERE id = $1',
          [id]
        );
        return { ok: true, note: `Dokument „${match.title}" wurde gelöscht.` };
      }

      // share_to_group → build a share_doc confirm (reuses confirmController).
      if (!match) return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
      if (!groupName?.trim()) return { error: 'share_to_group braucht groupName.' };
      if (!threadId) return { error: 'Teilen ist in diesem Kontext nicht möglich.' };
      // Only share into groups the caller is a MEMBER of (findGroups also returns
      // public non-member groups with an empty role — never fall back to those).
      const groups = await findGroups(userId, groupName.trim(), 5);
      const group = groups.find((g) => g.role);
      if (!group) return { error: `Keine Gruppe „${groupName}" gefunden, der du angehörst.` };
      const action_: PendingAction = {
        actionId: newActionId(),
        threadId,
        userId,
        title: 'Dokument teilen',
        preview: `„${match.title}" → ${group.name}`,
        createdAt: Date.now(),
        type: 'share_doc',
        payload: {
          docId: match.id,
          docTitle: match.title,
          groupId: group.id,
          groupName: group.name,
          permissionLevel: permission,
        },
      };
      await emitToolConfirmAction(sse, action_, [
        { key: 'Dokument', value: match.title },
        { key: 'Gruppe', value: group.name },
        { key: 'Berechtigung', value: permission === 'editor' ? 'Bearbeiten' : 'Nur lesen' },
      ]);
      return {
        ok: true,
        note: `Bestätigung zum Teilen von „${match.title}" mit „${group.name}" angefordert.`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// boards_tasks — list/read + add_card, card edits, my_tasks
// ---------------------------------------------------------------------------

/** Resolve up to 50 cards from ALREADY-LOADED board state (no per-card Yjs reload). */
function collectCards(board: BoardState) {
  return board.rows.slice(0, 50).map((row) => {
    const snap = resolveCardDisplay(board.fields, row);
    return {
      id: row.id,
      title: snap.cardTitle ?? '(ohne Titel)',
      status: snap.statusLabel ?? null,
      dueDate: snap.dueDate ?? null,
      assignees: snap.assigneeNames,
    };
  });
}

export function makeBoardsTasksTool(ctx: PersonalToolCtx): Tool {
  const { state, sse, threadId } = ctx;
  return tool({
    description: `Zugriff auf die EIGENEN Boards (Kanban) und deren Karten/Aufgaben.

NUTZE FÜR: Boards auflisten (list_boards), Karten eines Boards lesen (get_cards), offene/eigene Aufgaben boardübergreifend (my_tasks), eine Karte hinzufügen (add_card, wird bestätigt), Karte bearbeiten (edit_card: Titel/Beschreibung), in eine andere Spalte schieben/erledigen (move_card), Fälligkeit setzen (set_due), zuweisen (assign). boardId/cardId stammen aus einer vorherigen Liste.`,
    inputSchema: z.object({
      action: z.enum([
        'list_boards',
        'get_cards',
        'my_tasks',
        'add_card',
        'edit_card',
        'move_card',
        'set_due',
        'assign',
      ]),
      boardId: z.string().optional(),
      cardId: z.string().optional(),
      title: z.string().optional().describe('Kartentitel (add_card/edit_card)'),
      description: z.string().optional(),
      status: z
        .string()
        .optional()
        .describe('Ziel-Spalte/Status per Name oder ID (add_card/move_card)'),
      assignee: z.string().optional().describe('Name der zuständigen Person (assign/add_card)'),
      dueDate: z
        .string()
        .optional()
        .describe('Fälligkeitsdatum ISO (YYYY-MM-DD), leer zum Entfernen'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const { action, boardId, cardId } = args;

      if (action === 'list_boards') {
        const boards = await listUserBoards(userId, args.limit);
        const results = boards.map((b) =>
          makeRow(b.title, `/boards/${b.id}`, 'Board', officeSnippet('boards', b.content))
        );
        return { resultCount: results.length, results };
      }

      if (action === 'get_cards') {
        if (!boardId) return { error: 'get_cards braucht boardId.' };
        const board = await loadBoardState(boardId, userId);
        if (!board) return { error: 'Board nicht gefunden oder kein Zugriff.' };
        const cards = collectCards(board);
        return { board: { id: board.id, title: board.title }, cardCount: cards.length, cards };
      }

      if (action === 'my_tasks') {
        // Scan the caller's boards and collect actionable cards — those carrying a
        // due date or an assignee. Each card includes its `status` so the model
        // can tell done from open. Capped at MAX_BOARDS (logged in the note).
        const MAX_BOARDS = 12;
        const boards = await listUserBoards(userId, MAX_BOARDS);
        const tasks: Array<Record<string, unknown>> = [];
        for (const b of boards) {
          const board = await loadBoardState(b.id, userId);
          if (!board || board.boardType === 'whiteboard') continue;
          const cards = collectCards(board);
          for (const c of cards) {
            if (c.dueDate || c.assignees.length) {
              tasks.push({ ...c, board: board.title, boardId: b.id });
            }
          }
        }
        const note =
          boards.length >= MAX_BOARDS
            ? `Hinweis: nur die ${MAX_BOARDS} zuletzt bearbeiteten Boards durchsucht.`
            : undefined;
        return { taskCount: tasks.length, tasks, ...(note ? { note } : {}) };
      }

      if (action === 'add_card') {
        if (!boardId || !args.title?.trim())
          return { error: 'add_card braucht boardId und title.' };
        if (!threadId) return { error: 'Hinzufügen ist in diesem Kontext nicht möglich.' };
        const board = await loadBoardState(boardId, userId);
        if (!board) return { error: 'Board nicht gefunden oder kein Zugriff.' };
        const row: Record<string, unknown> = { title: args.title.trim() };
        if (args.status) row.status = args.status;
        if (args.description) row.description = args.description;
        if (args.dueDate) row.dueDate = args.dueDate;
        if (args.assignee) row.assignee = args.assignee;
        const pending: PendingAction = {
          actionId: newActionId(),
          threadId,
          userId,
          title: 'Karte hinzufügen',
          preview: `„${args.title.trim()}" → ${board.title}`,
          createdAt: Date.now(),
          type: 'modify_board',
          payload: { boardId, rows: [row], responseText: '' },
        };
        await emitToolConfirmAction(sse, pending, [
          { key: 'Board', value: board.title },
          { key: 'Aufgabe', value: args.title.trim() },
        ]);
        return {
          ok: true,
          note: `Bestätigung zum Hinzufügen von „${args.title.trim()}" angefordert.`,
        };
      }

      // Direct card edits (edit_card/move_card/set_due/assign) — need write access.
      if (!boardId || !cardId) return { error: `${action} braucht boardId und cardId.` };
      if (!(await hasWriteAccess(boardId, userId))) {
        return { error: 'Keine Berechtigung, dieses Board zu bearbeiten.' };
      }
      try {
        const changes =
          action === 'edit_card'
            ? {
                ...(args.title !== undefined && { title: args.title }),
                ...(args.description !== undefined && { description: args.description }),
              }
            : action === 'move_card'
              ? { status: args.status ?? '' }
              : action === 'set_due'
                ? { dueDate: args.dueDate ?? null }
                : { assignee: args.assignee ?? '' };
        const result = await updateCard(boardId, cardId, changes);
        if (result.applied.length === 0) return { ok: true, note: 'Keine Änderung nötig.' };
        return { ok: true, note: `Karte aktualisiert (${result.applied.join(', ')}).` };
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : 'Karte konnte nicht bearbeitet werden.',
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// groups — list / find (read)
// ---------------------------------------------------------------------------

export function makeGroupsTool(ctx: PersonalToolCtx): Tool {
  const { state } = ctx;
  return tool({
    description: `Zugriff auf die Gruppen der Person.

NUTZE FÜR: eigene Gruppen auflisten (list), eine Gruppe per Name finden (find). Zum Teilen von Inhalten mit einer Gruppe nutze 'documents' action="share_to_group".`,
    inputSchema: z.object({
      action: z.enum(['list', 'find']),
      query: z.string().optional().describe('Gruppenname (nur bei action="find")'),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ action, query, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const groupUrl = (g: { name: string; slug_suffix: string | null; id: string }) =>
        `/gruppen/${g.slug_suffix ? buildGroupSlug(g.name, g.slug_suffix) : g.id}`;

      if (action === 'find') {
        const q = (query ?? '').trim();
        if (!q) return { error: 'find braucht einen Suchbegriff.' };
        const groups = await findGroups(userId, q, limit);
        const results = groups.map((g) =>
          makeRow(g.name, groupUrl(g), 'Gruppe', `${g.member_count} Mitglieder`)
        );
        return { resultCount: results.length, results };
      }

      const groups = await listUserGroups(userId, limit);
      const results = groups.map((g) =>
        makeRow(
          g.name,
          groupUrl(g),
          'Gruppe',
          `${g.role || 'Mitglied'} · ${g.member_count} Mitglieder`
        )
      );
      return { resultCount: results.length, results };
    },
  });
}

// ---------------------------------------------------------------------------
// media — reels + sharepics: list / get / delete
// ---------------------------------------------------------------------------

export function makeMediaTool(ctx: PersonalToolCtx): Tool {
  const { state } = ctx;
  return tool({
    description: `Zugriff auf die EIGENEN Medien der Person: Reels (untertitelte Videos) und Sharepics (Social-Grafiken).

NUTZE FÜR: eigene Medien auflisten (list, optional type="reel"|"sharepic"), löschen (delete mit ref aus der Liste + confirm=true nach Zustimmung).`,
    inputSchema: z.object({
      action: z.enum(['list', 'delete']),
      type: z.enum(['all', 'reel', 'sharepic']).default('all'),
      ref: z
        .string()
        .optional()
        .describe('Handle aus der Liste ("reel:<id>" oder "sharepic:<token>")'),
      confirm: z.boolean().default(false),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ action, type, ref, confirm, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };

      if (action === 'list') {
        const results: ResultRow[] = [];
        if (type === 'all' || type === 'reel') {
          const svc = getSubtitlerProjectService();
          await svc.ensureInitialized();
          const reels = await svc.getUserProjects(userId);
          for (const r of reels.slice(0, limit)) {
            results.push(
              makeRow(
                r.title || 'Reel',
                `/studio/video?project=${r.id}`,
                'Reel',
                r.status,
                `reel:${r.id}`
              )
            );
          }
        }
        if (type === 'all' || type === 'sharepic') {
          const shares = await getSharedMediaService().getUserShares(
            userId,
            'image',
            USER_VISIBLE_SHARE_STATUSES,
            limit
          );
          for (const s of shares) {
            results.push(
              makeRow(
                s.title || 'Sharepic',
                `/share/${s.share_token}`,
                'Sharepic',
                null,
                `sharepic:${s.share_token}`
              )
            );
          }
        }
        return { resultCount: results.length, results };
      }

      // delete
      if (!ref) return { error: 'delete braucht ref (aus der Liste).' };
      if (!confirm) {
        return {
          needsConfirmation: true,
          note: 'Soll dieses Medium wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.',
        };
      }
      const [kind, handle] = ref.split(':', 2);
      if (kind === 'reel') {
        await getSubtitlerProjectService().deleteProject(userId, handle);
        return { ok: true, note: 'Reel wurde gelöscht.' };
      }
      if (kind === 'sharepic') {
        const ok = await getSharedMediaService().deleteShare(userId, handle);
        return ok
          ? { ok: true, note: 'Sharepic wurde gelöscht.' }
          : { error: 'Sharepic nicht gefunden oder kein Zugriff.' };
      }
      return { error: 'Unbekannter Medien-Verweis.' };
    },
  });
}

// ---------------------------------------------------------------------------
// notebooks — list + rename/delete
// ---------------------------------------------------------------------------

export function makeNotebooksTool(ctx: PersonalToolCtx): Tool {
  const { state } = ctx;
  return tool({
    description: `Zugriff auf die EIGENEN Notizbücher (Sammlungen von Quellen/Dokumenten).

NUTZE FÜR: Notizbücher auflisten (list), umbenennen (rename), löschen (delete mit confirm=true nach Zustimmung).`,
    inputSchema: z.object({
      action: z.enum(['list', 'rename', 'delete']),
      id: z.string().optional().describe('Notizbuch-ID (rename/delete)'),
      name: z.string().optional().describe('Neuer Name (nur bei action="rename")'),
      confirm: z.boolean().default(false),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ action, id, name, confirm, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const helper = notebookHelper();

      if (action === 'list') {
        const collections = await helper.getUserNotebookCollections(userId, { limit });
        const results = collections.map((c) =>
          makeRow(
            c.name,
            `/notebooks/${c.slug_suffix ? buildNotebookSlug(c.name, c.slug_suffix) : c.id}`,
            'Notizbuch',
            c.description || `${c.document_count} Dokument(e)`
          )
        );
        return { resultCount: results.length, results };
      }

      if (!id) return { error: `${action} braucht eine Notizbuch-ID.` };
      const collection = await helper.getNotebookCollection(id);
      if (!collection || collection.user_id !== userId) {
        return { error: 'Notizbuch nicht gefunden oder kein Zugriff.' };
      }

      if (action === 'rename') {
        if (!name?.trim()) return { error: 'rename braucht name.' };
        await helper.updateNotebookCollection(id, { name: name.trim() });
        return { ok: true, note: `Notizbuch in „${name.trim()}" umbenannt.` };
      }

      // delete
      if (!confirm) {
        return {
          needsConfirmation: true,
          note: `Soll das Notizbuch „${collection.name}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`,
        };
      }
      await helper.deleteNotebookCollection(id);
      return { ok: true, note: `Notizbuch „${collection.name}" wurde gelöscht.` };
    },
  });
}
