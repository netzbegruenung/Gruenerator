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
import { buildNotebookSlug, buildGroupSlug, buildChatThreadSlug } from '@gruenerator/shared/utils';
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
import {
  recallPastChats,
  getThreadRecallContext,
  resolveSpaceThreadIds,
} from '../services/pastChatRecallService.js';

import type {
  ChatGraphState,
  PendingAction,
  SearchResult,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

/** Context every resource tool closes over. */
export interface PersonalToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId: string | null;
  /** Per-turn source registry — MUST be fed so the split-mode synth model (which
   *  never sees tool return values, only `renderAll()`) can ground its answer. */
  sourceRegistry: SourceRegistry;
}

/**
 * Register grounding lines into the per-turn source registry. Critical for split
 * mode: the synthesizer model has no tools and reads ONLY the rendered sources,
 * so a tool that merely returns `{ results }` is invisible to it (observed live:
 * "keine Aufgabenlisten liegen mir vor" while the tool had returned taskCount=1).
 */
function ground(
  reg: SourceRegistry,
  items: Array<{ title: string; content: string; url?: string }>
): void {
  if (items.length === 0) return;
  reg.register(
    items.map(
      (i): SearchResult => ({
        source: 'eigene-inhalte',
        title: i.title,
        content: i.content,
        ...(i.url ? { url: i.url } : {}),
      })
    )
  );
}

/** Grounding lines from clickable result rows (list/search actions). */
function groundRows(reg: SourceRegistry, rows: ResultRow[]): void {
  ground(
    reg,
    rows.map((r) => ({
      title: r.title,
      content: [r.type, r.title, r.snippet].filter(Boolean).join(' — '),
      ...(r.url ? { url: r.url } : {}),
    }))
  );
}

/** A single status/outcome line (write actions, confirmations). */
function groundNote(reg: SourceRegistry, title: string, content: string): void {
  ground(reg, [{ title, content }]);
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
  const { state, sourceRegistry } = ctx;
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
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      const items = await aggregateRecentActivity(userId, limit);
      const results = items.map((it) =>
        makeRow(it.title, it.href, it.documentType ?? it.type, it.content)
      );
      groundRows(sourceRegistry, results);
      return { resultCount: results.length, results };
    },
  });
}

// ---------------------------------------------------------------------------
// search_threads — recall the user's OWN past chats (Space-aware)
// ---------------------------------------------------------------------------

/** Resolve the current thread's home Space (group_id), or null. */
async function getCurrentSpaceId(threadId: string | null, userId: string): Promise<string | null> {
  if (!threadId) return null;
  try {
    const rows = (await getPostgresInstance().query(
      `SELECT group_id FROM chat_threads WHERE id = $1::uuid AND user_id = $2 LIMIT 1`,
      [threadId, userId]
    )) as Array<{ group_id: string | null }>;
    return rows[0]?.group_id ?? null;
  } catch {
    return null;
  }
}

export function makeSearchThreadsTool(ctx: PersonalToolCtx): Tool {
  const { state, threadId, sourceRegistry } = ctx;
  return tool({
    description: `Durchsucht die FRÜHEREN CHATS der angemeldeten Person (nicht Dokumente — dafür 'find_content'). Findet, was in vergangenen Unterhaltungen besprochen wurde, per Stichwort + Bedeutung.

NUTZE WENN nach früheren Gesprächen gefragt wird ("worüber haben wir letztens gesprochen", "such in diesem Space", "was hatten wir zu X besprochen").
- scope="space": nur die Chats des aktuellen Space durchsuchen (Standard, wenn der Chat in einem Space liegt).
- scope="all": alle eigenen Chats durchsuchen.
- action="read": den vollständigen Verlauf EINES Threads lesen (threadId aus einem Suchergebnis).`,
    inputSchema: z.object({
      action: z.enum(['search', 'read']).default('search'),
      query: z.string().optional().describe('Suchbegriff (bei action="search")'),
      scope: z.enum(['space', 'all']).default('space'),
      threadId: z.string().optional().describe('Thread-ID zum Lesen (bei action="read")'),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    execute: async ({ action, query, scope, threadId: readThreadId, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };

      if (action === 'read') {
        if (!readThreadId) return { error: 'Zum Lesen wird eine threadId benötigt.' };
        const ctxData = await getThreadRecallContext(readThreadId, userId);
        if (!ctxData) return { error: 'Thread nicht gefunden oder kein Zugriff.' };
        groundNote(sourceRegistry, ctxData.title || 'Früherer Chat', ctxData.transcript);
        return {
          title: ctxData.title,
          updatedAt: ctxData.updatedAt,
          transcript: ctxData.transcript,
        };
      }

      const q = (query ?? '').trim();
      if (!q) return { error: 'Für die Suche wird ein Suchbegriff benötigt.' };

      // Space scope: restrict to the sibling threads of the current Space.
      let threadIds: string[] | undefined;
      if (scope === 'space') {
        const spaceId = await getCurrentSpaceId(threadId, userId);
        if (spaceId) {
          const siblings = await resolveSpaceThreadIds(spaceId, userId);
          threadIds = siblings.map((s) => s.id);
        }
        // No space → fall through to an unscoped (all-chats) recall.
      }

      const hits = await recallPastChats(userId, q, {
        limit,
        ...(threadId != null && { excludeThreadId: threadId }),
        ...(threadIds != null && { threadIds }),
      });
      const results = hits.map((h) =>
        makeRow(
          h.threadTitle || 'Früherer Chat',
          h.threadSlugSuffix
            ? `/chat/${buildChatThreadSlug(h.threadTitle, h.threadSlugSuffix)}`
            : `/chat/${h.threadId}`,
          'Chat',
          h.snippet,
          h.threadId
        )
      );
      groundRows(sourceRegistry, results);
      return { resultCount: results.length, results };
    },
  });
}

// ---------------------------------------------------------------------------
// documents — list/get + rename/delete/share_to_group
// ---------------------------------------------------------------------------

export function makeDocumentsTool(ctx: PersonalToolCtx): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
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
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      // The remaining actions all target one document — resolve within the caller's set.
      const owned = await listUserDocuments(userId, 200);
      const match = id ? owned.find((d) => d.id === id) : undefined;

      if (action === 'get') {
        if (!match) return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
        const url = officeUrl(match.document_subtype, match.id);
        const kind = officeKindLabel(match.document_subtype);
        ground(sourceRegistry, [{ title: match.title, content: `${kind}: ${match.title}`, url }]);
        return { document: { title: match.title, url, type: kind } };
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
        const note = `Dokument in „${title.trim()}" umbenannt.`;
        groundNote(sourceRegistry, 'Umbenannt', note);
        return { ok: true, note };
      }

      if (action === 'delete') {
        if (!match) return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
        if (!confirm) {
          const ask = `Soll das Dokument „${match.title}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`;
          groundNote(sourceRegistry, 'Bestätigung nötig', ask);
          return { needsConfirmation: true, note: ask };
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
        const note = `Dokument „${match.title}" wurde gelöscht.`;
        groundNote(sourceRegistry, 'Gelöscht', note);
        return { ok: true, note };
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
      const note = `Bestätigung zum Teilen von „${match.title}" mit „${group.name}" angefordert.`;
      groundNote(sourceRegistry, 'Teilen', note);
      return { ok: true, note };
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
  const { state, sse, threadId, sourceRegistry } = ctx;
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
        groundRows(sourceRegistry, results);
        return { resultCount: results.length, results };
      }

      if (action === 'get_cards') {
        if (!boardId) return { error: 'get_cards braucht boardId.' };
        const board = await loadBoardState(boardId, userId);
        if (!board) return { error: 'Board nicht gefunden oder kein Zugriff.' };
        const cards = collectCards(board);
        ground(
          sourceRegistry,
          cards.map((c) => ({
            title: c.title,
            content: `Karte „${c.title}" (Status: ${c.status ?? '—'}${c.dueDate ? `, fällig ${c.dueDate}` : ''}${c.assignees.length ? `, zuständig: ${c.assignees.join(', ')}` : ''}) auf Board „${board.title}"`,
            url: `/boards/${board.id}`,
          }))
        );
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
        ground(
          sourceRegistry,
          tasks.map((t) => ({
            title: String(t.title),
            content: `Aufgabe „${String(t.title)}" (Status: ${t.status ?? '—'}${t.dueDate ? `, fällig ${String(t.dueDate)}` : ''}${Array.isArray(t.assignees) && t.assignees.length ? `, zuständig: ${(t.assignees as string[]).join(', ')}` : ''}) auf Board „${String(t.board)}"`,
            url: `/boards/${String(t.boardId)}`,
          }))
        );
        if (tasks.length === 0) {
          groundNote(
            sourceRegistry,
            'Aufgaben',
            'Keine anstehenden Aufgaben mit Fälligkeit oder Zuweisung auf den Boards gefunden.'
          );
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
        const note = `Bestätigung zum Hinzufügen von „${args.title.trim()}" zu „${board.title}" angefordert.`;
        groundNote(sourceRegistry, 'Karte hinzufügen', note);
        return { ok: true, note };
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
        const note = `Karte aktualisiert (${result.applied.join(', ')}).`;
        groundNote(sourceRegistry, 'Karte bearbeitet', note);
        return { ok: true, note };
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
  const { state, sourceRegistry } = ctx;
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
        groundRows(sourceRegistry, results);
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
      groundRows(sourceRegistry, results);
      return { resultCount: results.length, results };
    },
  });
}

// ---------------------------------------------------------------------------
// media — reels + sharepics: list / get / delete
// ---------------------------------------------------------------------------

export function makeMediaTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
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
        groundRows(sourceRegistry, results);
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
        groundNote(sourceRegistry, 'Gelöscht', 'Reel wurde gelöscht.');
        return { ok: true, note: 'Reel wurde gelöscht.' };
      }
      if (kind === 'sharepic') {
        const ok = await getSharedMediaService().deleteShare(userId, handle);
        if (!ok) return { error: 'Sharepic nicht gefunden oder kein Zugriff.' };
        groundNote(sourceRegistry, 'Gelöscht', 'Sharepic wurde gelöscht.');
        return { ok: true, note: 'Sharepic wurde gelöscht.' };
      }
      return { error: 'Unbekannter Medien-Verweis.' };
    },
  });
}

// ---------------------------------------------------------------------------
// notebooks — list + rename/delete
// ---------------------------------------------------------------------------

export function makeNotebooksTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
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
        groundRows(sourceRegistry, results);
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
        const note = `Notizbuch in „${name.trim()}" umbenannt.`;
        groundNote(sourceRegistry, 'Umbenannt', note);
        return { ok: true, note };
      }

      // delete
      if (!confirm) {
        const ask = `Soll das Notizbuch „${collection.name}" wirklich gelöscht werden? Frage die Person und rufe delete erst mit confirm=true erneut auf.`;
        groundNote(sourceRegistry, 'Bestätigung nötig', ask);
        return { needsConfirmation: true, note: ask };
      }
      await helper.deleteNotebookCollection(id);
      const note = `Notizbuch „${collection.name}" wurde gelöscht.`;
      groundNote(sourceRegistry, 'Gelöscht', note);
      return { ok: true, note };
    },
  });
}
