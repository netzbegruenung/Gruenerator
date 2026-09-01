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
 * The `notebooks` tool moved to `notebookTools.ts` and `groups` to
 * `groupTools.ts` (09/2026) when they grew past list/rename/delete; both reuse
 * the exported helpers below (`ground*`, `makeRow`, `refuseForbiddenAction`).
 *
 * userId comes off the shared `state.agentConfig?.userId` (set in streamContext).
 * SSE cards, timeout, truncation and step recording are layered on by
 * wrapToolsForLoop — these factories only implement data access + confirm emit.
 */
import { isKiImage } from '@gruenerator/shared/media-library/contentOrigin';
import { buildChatThreadSlug } from '@gruenerator/shared/utils';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { artifactsFromTurn } from '../../../agents/langgraph/ChatGraph/nodes/artifactInventory.js';
import {
  ARTIFACT_NOUN_BY_KIND,
  forbidsPersistentAction,
  type ForbiddableArtifact,
} from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { updateCard } from '../../../services/boards/boardCardWriteService.js';
import {
  listUserBoards,
  loadBoardState,
  resolveCardDisplay,
  type BoardState,
} from '../../../services/boards/BoardService.js';
import { findGroups } from '../../../services/groups/groupQueries.js';
import { USER_VISIBLE_SHARE_STATUSES } from '../../../services/sharedMediaFilters.js';
import { getSharedMediaService } from '../../../services/sharedMediaService.js';
import { getSubtitlerProjectService } from '../../../services/subtitler/ProjectService.js';
import { getReelTranscript, reelUrl, searchReels } from '../../../services/subtitler/reelSearch.js';
import { toUserFacingMessage } from '../../../utils/errors/index.js';
import {
  listUserDocuments,
  officeKindLabel,
  officeSnippet,
  officeUrl,
  searchOfficeContent,
} from '../../docs/docsSearch.js';
import { aggregateRecentActivity } from '../../workplace/recentActivityController.js';
import { hasWriteAccess } from '../confirmController.js';
import { readArtifactContent, type ArtifactReadKind } from '../services/artifactReader.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';
import { extractTextContent } from '../services/messageHelpers.js';
import {
  recallPastChats,
  getThreadRecallContext,
  listRecentThreads,
  resolveSpaceThreadIds,
} from '../services/pastChatRecallService.js';

import type {
  ChatGraphState,
  PendingAction,
  SearchResult,
  ThreadToolContext,
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
 * A turn that rules out persistent changes must not get one offered — not even
 * behind a confirm card, and not by a tool.
 *
 * The classifier-level gate (chatGraphContractRouter) cannot reach this path:
 * inside the agentic loop the MODEL picks the action. Observed live, it picked
 * `add_card` on a turn whose entire instruction was "merke dir das und antworte
 * mit „D2 gespeichert"" — and offered to add a Kanban task nobody mentioned.
 *
 * Returns an error the model can read, rather than a silent no-op: a swallowed
 * refusal would leave it announcing a confirmation that was never emitted.
 */
export function refuseForbiddenAction(
  state: ChatGraphState,
  family?: ForbiddableArtifact
): { error: string } | null {
  const lastUser = [...(state.messages ?? [])].reverse().find((m) => m.role === 'user');
  const text = lastUser ? extractTextContent(lastUser.content) : '';
  if (!forbidsPersistentAction(text, family ? ARTIFACT_NOUN_BY_KIND[family] : undefined)) {
    return null;
  }
  return {
    error:
      'Diese Nachricht schließt Änderungen aus — es wurde nichts vorbereitet. Antworte nur im Chat.',
  };
}

/**
 * Register grounding lines into the per-turn source registry. Critical for split
 * mode: the synthesizer model has no tools and reads ONLY the rendered sources,
 * so a tool that merely returns `{ results }` is invisible to it (observed live:
 * "keine Aufgabenlisten liegen mir vor" while the tool had returned taskCount=1).
 */
export function ground(
  reg: SourceRegistry,
  items: Array<{ title: string; content: string; url?: string }>
): void {
  if (items.length === 0) return;
  reg.register(
    items.map((i): SearchResult => ({
      source: 'eigene-inhalte',
      title: i.title,
      content: i.content,
      ...(i.url ? { url: i.url } : {}),
    }))
  );
}

/** Grounding lines from clickable result rows (list/search actions). */
export function groundRows(reg: SourceRegistry, rows: ResultRow[]): void {
  ground(
    reg,
    rows.map((r) => ({
      title: r.title,
      content: [r.type, r.title, r.snippet].filter(Boolean).join(' — '),
      ...(r.url ? { url: r.url } : {}),
    }))
  );
}

/**
 * A single status/outcome line (write actions, confirmations, empty results).
 *
 * Routed to `reg.note`, NOT `reg.register`: these lines exist so the split-mode
 * synth can say what happened, and they are not retrieved material. Registering
 * them as sources meant they were persisted as the turn's `searchResults` — a
 * later "mach ein PDF draus" was then briefed with a Kanban confirmation as the
 * only research in scope and built the whole document out of it.
 */
export function groundNote(reg: SourceRegistry, title: string, content: string): void {
  reg.note(title, content);
}

/** A clickable result row — the frontend registry lifts `{ title, url }` into a citation list. */
export interface ResultRow {
  title: string;
  url: string;
  snippet?: string;
  type?: string;
  /** Opaque handle for follow-up actions (e.g. media delete needs the share token). */
  ref?: string;
}

/** Build a row, omitting empty optionals (exactOptionalPropertyTypes: no `undefined`). */
export function makeRow(
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

export const NO_SESSION = 'Keine Nutzer-Sitzung — diese Aktion braucht eine angemeldete Person.';

export function requireUserId(state: ChatGraphState): string | null {
  return state.agentConfig?.userId ?? null;
}

// ---------------------------------------------------------------------------
// find_content — cross-domain read over the user's own stuff
// ---------------------------------------------------------------------------

export function makeFindContentTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Durchsucht die EIGENEN Inhalte der angemeldeten Person (Dokumente, Boards, Tabellen, Präsentationen, Notebooks sowie Reels/untertitelte Videos) oder listet die zuletzt bearbeiteten. Reels werden dabei auch nach ihrem gesprochenen Untertitel-Inhalt durchsucht.

NUTZE WENN nach eigenen Inhalten gefragt wird ("zeig mir meine Dokumente", "finde mein Klima-Board", "woran habe ich zuletzt gearbeitet"). Für Detailfragen zu EINEM Board/Dokument nutze 'documents' oder 'boards_tasks'. Für das VOLLE Transkript eines Reels (z. B. um eine Caption zu schreiben) nutze 'media' mit action="transcript".`,
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
        const [hits, reelHits] = await Promise.all([
          searchOfficeContent(userId, q, { limit }),
          searchReels(userId, q, Math.min(limit, 5)),
        ]);
        const results = [
          ...hits.map((h) =>
            makeRow(
              h.title,
              officeUrl(h.document_subtype, h.id),
              officeKindLabel(h.document_subtype),
              officeSnippet(h.document_subtype, h.content)
            )
          ),
          ...reelHits.map((r) => makeRow(r.title, r.url, 'Reel', r.snippet, `reel:${r.id}`)),
        ];
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

NUTZE WENN nach früheren Gesprächen gefragt wird ("worüber haben wir letztens gesprochen", "such in diesem Projekt", "was hatten wir zu X besprochen").
- Ohne query: listet die zuletzt aktiven Chats (für "worüber haben wir zuletzt gechattet").
- scope="space": nur die Chats des aktuellen Space durchsuchen (Standard, wenn der Chat in einem Space liegt).
- scope="all": alle eigenen Chats durchsuchen.
- action="read": den vollständigen Verlauf EINES Threads lesen (threadId aus einem Suchergebnis).`,
    inputSchema: z.object({
      action: z.enum(['search', 'read']).default('search'),
      query: z
        .string()
        .optional()
        .describe('Suchbegriff (bei action="search"); weglassen für die zuletzt aktiven Chats'),
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
        // Real retrieved material (a past conversation), not an outcome line —
        // this one IS a source and stays citable.
        ground(sourceRegistry, [
          { title: ctxData.title || 'Früherer Chat', content: ctxData.transcript },
        ]);
        return {
          title: ctxData.title,
          updatedAt: ctxData.updatedAt,
          transcript: ctxData.transcript,
        };
      }

      const q = (query ?? '').trim();

      // Space scope: restrict to the sibling threads of the current Space.
      let threadIds: string[] | undefined;
      if (scope === 'space') {
        const spaceId = await getCurrentSpaceId(threadId, userId);
        if (spaceId) {
          const siblings = await resolveSpaceThreadIds(spaceId, userId);
          // Only scope on a successful lookup — a failed one would restrict the
          // search to zero threads and report "nothing found" for a full Space.
          if (siblings.ok) threadIds = siblings.threads.map((s) => s.id);
        }
        // No space (or a failed lookup) → unscoped (all-chats) recall.
      }

      const scopeOpts = {
        limit,
        ...(threadId != null && { excludeThreadId: threadId }),
        ...(threadIds != null && { threadIds }),
      };
      // No search term → the most recent chats. "Worüber haben wir zuletzt
      // gechattet" has no keyword; erroring here sent the loop into a retry
      // that the near-duplicate guard then blocked.
      const hits = q
        ? await recallPastChats(userId, q, scopeOpts)
        : await listRecentThreads(userId, scopeOpts);
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

NUTZE FÜR: eigene Dokumente auflisten (list), eines per id ansehen (get), umbenennen (rename), löschen (delete), mit einer Gruppe teilen (share_to_group). Umbenennen wirkt sofort; Löschen und Teilen werden der Person zur Bestätigung angezeigt. Um das GERADE ERSTELLTE Dokument zu teilen, share_to_group nur mit groupName aufrufen (id weglassen).`,
    inputSchema: z.object({
      action: z.enum(['list', 'get', 'rename', 'delete', 'share_to_group']),
      id: z
        .string()
        .optional()
        .describe(
          'Dokument-ID (get/rename/delete/share; bei share weglassen für das zuletzt erstellte Dokument)'
        ),
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
      // Compound "erstelle ein Dokument … und teile es mit meiner Gruppe": when
      // called WITHOUT an id, fall back to the document just created this turn
      // (persisted into state.createdDocument by the compound create tool). Read
      // it directly — no dependency on it surfacing in the fresh listUserDocuments
      // above (avoids a create→list race). Only when no id was given: an explicit
      // but unresolvable id must surface "not found", not silently redirect.
      const shareTarget = match
        ? { id: match.id, title: match.title }
        : !id && state.createdDocument
          ? { id: state.createdDocument.documentId, title: state.createdDocument.title }
          : null;
      const forbiddenShare = refuseForbiddenAction(state, 'document');
      if (forbiddenShare) return forbiddenShare;
      if (!shareTarget) return { error: 'Dokument nicht gefunden oder kein Zugriff.' };
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
        preview: `„${shareTarget.title}" → ${group.name}`,
        createdAt: Date.now(),
        type: 'share_doc',
        payload: {
          docId: shareTarget.id,
          docTitle: shareTarget.title,
          groupId: group.id,
          groupName: group.name,
          permissionLevel: permission,
        },
      };
      await emitToolConfirmAction(sse, action_, [
        { key: 'Dokument', value: shareTarget.title },
        { key: 'Gruppe', value: group.name },
        { key: 'Berechtigung', value: permission === 'editor' ? 'Bearbeiten' : 'Nur lesen' },
      ]);
      const note = `Bestätigung zum Teilen von „${shareTarget.title}" mit „${group.name}" angefordert.`;
      groundNote(sourceRegistry, 'Teilen', note);
      return { ok: true, note };
    },
  });
}

// ---------------------------------------------------------------------------
// read_artifact — open an artifact and read what is actually IN it
// ---------------------------------------------------------------------------

/** Beyond this the excerpt is cut — one artifact must not eat the whole turn. */
const ARTIFACT_READ_CHARS = 12_000;

const READ_KIND_NOUN: Record<ArtifactReadKind, string> = {
  doc: 'Dokument',
  board: 'Board',
  sheet: 'Tabelle',
  presentation: 'Präsentation',
  pdf: 'PDF',
};

/**
 * Which inventory artifacts are readable, and as what.
 *
 * `null` for the kinds that carry no text to read back: an image and a sharepic
 * are pixels, a connector call or a research step is not an artifact at all.
 * Explicit rather than a default, so a new `ThreadToolContext['kind']` has to
 * make the decision instead of silently becoming a document.
 */
const READ_KIND_FOR_ARTIFACT: Record<ThreadToolContext['kind'], ArtifactReadKind | null> = {
  document: 'doc',
  presentation: 'presentation',
  sheet: 'sheet',
  board: 'board',
  pdf: 'pdf',
  image: null,
  sharepic: null,
  mcp: null,
  notebook: null,
  bundestag: null,
  abgeordnetenwatch: null,
};

/**
 * Read an artifact's CONTENT.
 *
 * Nothing in the agentic loop could do this. `documents` action="get" returns
 * `{title, url, type}` — a pointer, not the thing — and the only real reader,
 * `read_user_content`, is mounted exclusively inside the recall loop. So
 * "vergleiche das PDF und die Präsentation" was not a hard task but an
 * impossible one, and on 03.08.2026 the model answered it from nothing:
 * which slide had been fixed, that the matrix was complete. It had opened
 * neither file.
 *
 * `id` is optional on purpose. The artifacts of THIS conversation are listed to
 * the model by noun and title only (see artifactInventory) — it has no id to
 * pass. Omitting it means "the one from this conversation", resolved against
 * `threadArtifacts`; the same shape `documents` action="share_to_group" already
 * uses. With several candidates the tool lists them rather than guessing.
 */
export function makeReadArtifactTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Öffnet ein eigenes Artefakt und liest seinen INHALT — Folientexte, Tabellenzellen, Dokumenttext, Board-Karten oder den Text eines erzeugten PDFs.

NUTZE FÜR: "was steht in der Präsentation?", "vergleiche das PDF mit den Folien", "prüfe, ob Folie 5 stimmt", "fasse mein Dokument zusammen". Ohne diesen Aufruf kennst du den Inhalt NICHT — rate ihn niemals.

Die "id" bekommst du aus 'find_content' oder 'documents' (action="list"). Geht es um ein Artefakt AUS DIESEM GESPRÄCH, lass "id" weg und gib nur "kind" an.`,
    inputSchema: z.object({
      kind: z
        .enum(['doc', 'board', 'sheet', 'presentation', 'pdf'])
        .describe('Art des Artefakts. Bei Unsicherheit: die Art aus dem Suchtreffer übernehmen.'),
      id: z
        .string()
        .optional()
        .describe(
          'ID aus einem vorherigen Suchtreffer. Weglassen für das Artefakt aus diesem Gespräch.'
        ),
    }),
    execute: async ({ kind, id }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const noun = READ_KIND_NOUN[kind];

      let targetId = id?.trim() ?? '';
      let label: string | null = null;

      if (!targetId) {
        // `threadArtifacts` is loaded on every turn by streamContext; the
        // fresh ones of THIS turn are carried on state as they are created.
        const candidates = [...artifactsFromTurn(state), ...(state.threadArtifacts ?? [])].filter(
          (a) => a.ref && READ_KIND_FOR_ARTIFACT[a.kind] === kind
        );
        const unique = [...new Map(candidates.map((a) => [a.ref!, a])).values()];
        if (unique.length === 0) {
          return {
            error: `In diesem Gespräch gibt es kein Artefakt der Art „${noun}". Suche es mit 'find_content', oder nenne eine id.`,
          };
        }
        if (unique.length > 1) {
          // Guessing between two decks is how the wrong one gets "corrected".
          return {
            needsChoice: true,
            note: `Es gibt mehrere ${noun}-Artefakte in diesem Gespräch. Rufe erneut mit der passenden id auf.`,
            candidates: unique.map((a) => ({ id: a.ref, title: a.label ?? '(ohne Titel)' })),
          };
        }
        targetId = unique[0]!.ref!;
        label = unique[0]!.label ?? null;
      }

      let content: string | null;
      try {
        content = await readArtifactContent({ id: targetId, kind, userId });
      } catch (error) {
        // A doc/board/sheet id lands in `WHERE cd.id = $2::uuid`. When the model
        // invents one, Postgres answers 22P02 and the raw SQL message went back
        // as the tool's result — "invalid input syntax for type uuid" tells the
        // model nothing it can act on, about a value it did not know was wrong.
        // Twice in one turn on 13.08.2026, both times an eight-character id the
        // model had read off OUR OWN source list (fixed at the source in
        // buildDocumentSources; this is the boundary that has to hold whatever
        // the model invents next).
        //
        // Not a pre-check: legitimate refs are not all bare UUIDs — a generated
        // PDF is addressed as `<uuid>.pdf`. Only the database gets to say that
        // an id is unusable, and only that answer is translated here.
        if (/invalid input syntax for type uuid/i.test(toUserFacingMessage(error, ''))) {
          return {
            error: `„${targetId}" ist keine gültige id. Nimm die vollständige id aus einem Treffer von 'find_content' oder 'documents' (action="list") — oder lass "id" ganz weg, wenn du das ${noun} aus DIESEM Gespräch meinst.`,
          };
        }
        return { error: toUserFacingMessage(error, `${noun} konnte nicht gelesen werden.`) };
      }
      if (!content?.trim()) {
        return {
          error: `${noun} nicht gefunden, kein Zugriff, oder es steht nichts darin.`,
        };
      }

      const excerpt =
        content.length > ARTIFACT_READ_CHARS
          ? `${content.slice(0, ARTIFACT_READ_CHARS)}\n…[gekürzt]`
          : content;
      const title = label ?? `${noun}-Inhalt`;
      // Grounding, not a note: this IS retrieved material, and in split mode the
      // writer sees nothing but the rendered sources.
      ground(sourceRegistry, [{ title, content: excerpt }]);
      return { kind, title, content: excerpt, truncated: excerpt !== content };
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
        const forbidden = refuseForbiddenAction(state, 'board');
        if (forbidden) return forbidden;
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
      // These write IMMEDIATELY (no confirm card), so the constraint check has to
      // come first.
      const forbiddenEdit = refuseForbiddenAction(state, 'board');
      if (forbiddenEdit) return forbiddenEdit;
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
          error: toUserFacingMessage(err, 'Karte konnte nicht bearbeitet werden.'),
        };
      }
    },
  });
}

// ---------------------------------------------------------------------------
// media — reels + sharepics: list / get / delete
// ---------------------------------------------------------------------------

export function makeMediaTool(ctx: PersonalToolCtx): Tool {
  const { state, sourceRegistry } = ctx;
  return tool({
    description: `Zugriff auf die EIGENEN Medien der Person: Reels (untertitelte Videos), Sharepics (Social-Grafiken aus den Vorlagen) und KI-Bilder (aus dem Bild-Editor).

NUTZE FÜR:
- auflisten (list, optional type="reel"|"sharepic"|"ki"). Sharepics und KI-Bilder sind zwei verschiedene Produkte — "meine Sharepics" meint type="sharepic", "meine KI-Bilder" type="ki".
- Reels nach INHALT suchen (search mit query) — durchsucht Titel UND das gesprochene Untertitel-Transkript, z. B. "das Reel über Windkraft"
- das volle Transkript eines Reels holen (transcript mit ref="reel:<id>") — nötig, bevor du eine Caption, einen Social-Post oder eine Zusammenfassung zum Video schreibst
- löschen (delete mit ref aus der Liste + confirm=true nach Zustimmung)

TYPISCHER ABLAUF für "such das Reel zu Thema X und schreib eine Caption": erst search, dann transcript für den besten Treffer, dann die Caption aus dem Transkript formulieren.`,
    inputSchema: z.object({
      action: z.enum(['list', 'search', 'transcript', 'delete']),
      type: z.enum(['all', 'reel', 'sharepic', 'ki']).default('all'),
      query: z.string().optional().describe('Suchbegriff (nur bei action="search")'),
      ref: z
        .string()
        .optional()
        .describe('Handle aus der Liste ("reel:<id>" oder "sharepic:<token>", auch für KI-Bilder)'),
      confirm: z.boolean().default(false),
      limit: z.number().int().min(1).max(30).default(15),
    }),
    execute: async ({ action, type, query, ref, confirm, limit }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };

      if (action === 'search') {
        const q = (query ?? '').trim();
        if (!q) return { error: 'search braucht query.' };
        const hits = await searchReels(userId, q, Math.min(limit, 10));
        const results = hits.map((h) =>
          makeRow(
            h.title,
            h.url,
            'Reel',
            h.snippet || (h.matchedTranscript ? null : 'Titeltreffer'),
            `reel:${h.id}`
          )
        );
        groundRows(sourceRegistry, results);
        return {
          resultCount: results.length,
          results,
          ...(results.length > 0 && {
            note: 'Für eine Caption/Zusammenfassung zuerst action="transcript" mit dem ref des passenden Reels aufrufen.',
          }),
        };
      }

      if (action === 'transcript') {
        if (!ref) return { error: 'transcript braucht ref (z. B. "reel:<id>").' };
        const [kind, handle] = ref.split(':', 2);
        if (kind !== 'reel' || !handle) {
          return { error: 'transcript gibt es nur für Reels (ref="reel:<id>").' };
        }
        const found = await getReelTranscript(userId, handle);
        if (!found) {
          return { error: 'Reel nicht gefunden, kein Zugriff, oder es hat keine Untertitel.' };
        }
        ground(sourceRegistry, [
          {
            title: found.title,
            content: `Untertitel-Transkript des Reels „${found.title}" (gesprochener Videoinhalt):\n${found.transcript}`,
            url: reelUrl(handle),
          },
        ]);
        return {
          title: found.title,
          url: reelUrl(handle),
          segmentCount: found.segmentCount,
          transcript: found.transcript,
        };
      }

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
        if (type === 'all' || type === 'sharepic' || type === 'ki') {
          // A filtered ask has to look past `limit`: someone's 15 most recent
          // images can be Sharepics throughout while the KI-Bilder they asked
          // for sit just below the cut. 100 is the service's own ceiling.
          const shares = await getSharedMediaService().getUserShares(
            userId,
            'image',
            USER_VISIBLE_SHARE_STATUSES,
            type === 'all' ? limit : 100
          );
          let taken = 0;
          for (const s of shares) {
            if (taken >= limit) break;
            // Sharepics and KI-Bilder are separate products with separate
            // sections in every gallery, so the same split has to reach the
            // model. `isKiImage` is the classification those galleries use:
            // `content_origin` first, falling back to the legacy `image_type`
            // for rows written before that column existed.
            const ki = isKiImage({ contentOrigin: s.content_origin, imageType: s.image_type });
            if (type === 'sharepic' && ki) continue;
            if (type === 'ki' && !ki) continue;
            const label = ki ? 'KI-Bild' : 'Sharepic';
            results.push(
              makeRow(
                s.title || label,
                `/share/${s.share_token}`,
                label,
                null,
                // One handle namespace for both: the share token is what the
                // delete path resolves, and a KI image is not a different row.
                `sharepic:${s.share_token}`
              )
            );
            taken++;
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
        if (!ok) return { error: 'Bild nicht gefunden oder kein Zugriff.' };
        groundNote(sourceRegistry, 'Gelöscht', 'Bild wurde gelöscht.');
        return { ok: true, note: 'Bild wurde gelöscht.' };
      }
      return { error: 'Unbekannter Medien-Verweis.' };
    },
  });
}
