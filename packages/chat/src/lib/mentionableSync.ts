/**
 * Endpoint → mentionable-store sync, shared by every platform.
 *
 * The module-level mentionable lists (`setBoardMentionables` & co.) are what
 * `filterMentionables` / `resolveMentionable` read synchronously, so something
 * has to fill them from the API. That mapping — which endpoint, which fields,
 * and above all how a title becomes an `@slug` — lives here rather than in a
 * platform's query hook: web and mobile must produce the *same* `@mention` for
 * the same board, or a mention typed on one platform fails to resolve on the
 * other.
 *
 * Each function takes a `get` that performs an authenticated GET and resolves
 * the parsed JSON body, so callers keep their own HTTP stack (web: the chat
 * ApiClient, mobile: the shared axios client). Each returns the raw list it
 * fetched, so a caller can also render it.
 */

import { isUnauthorizedError } from '@gruenerator/shared/api';

import {
  setBoardMentionables,
  setCustomAgents,
  setDocMentionables,
  setMcpServerMentionables,
  setSheetMentionables,
  setTextforms,
  setUserNotebookMentionables,
  type CustomAgentMentionable,
  type TextformMentionable,
} from './mentionables';

/** Performs an authenticated GET and resolves the parsed body. */
export type MentionableFetch = <T>(path: string) => Promise<T>;

export interface BoardListItem {
  id: string;
  title: string;
}

export interface DocListItem {
  id: string;
  title: string;
  document_subtype?: string;
}

export interface UserNotebookListItem {
  id: string;
  name: string;
}

export interface TextFormListItem {
  kind: 'preset' | 'custom';
  mention: string;
  title: string;
}

export interface McpServerListItem {
  id: string;
  name: string;
  enabled: boolean;
  description?: string | null;
}

/**
 * Title → `@mention` slug. The single definition on purpose: this string is the
 * lookup key a typed mention resolves against, so any divergence between
 * platforms silently breaks resolution.
 */
export function slugifyMention(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** The user's own plus saved custom agents, deduplicated by id (own wins). */
export async function syncCustomAgents(get: MentionableFetch): Promise<CustomAgentMentionable[]> {
  const [ownPrompts, savedPrompts] = await Promise.all([
    get<{ prompts?: CustomAgentMentionable[] }>('/api/auth/custom_prompts'),
    get<{ prompts?: CustomAgentMentionable[] }>('/api/auth/saved_prompts'),
  ]);
  const seenIds = new Set<string>();
  const merged: CustomAgentMentionable[] = [];
  for (const p of [...(ownPrompts?.prompts ?? []), ...(savedPrompts?.prompts ?? [])]) {
    if (!seenIds.has(p.id)) {
      seenIds.add(p.id);
      merged.push(p);
    }
  }
  setCustomAgents(merged);
  return merged;
}

/**
 * User's custom text forms ("Texte anlernen") → per-form `/mention` skills.
 * Presets ride the existing system-skill mentions, so only custom forms surface
 * here. Anonymous users / no forms resolve to an empty list.
 */
export async function syncTextforms(get: MentionableFetch): Promise<TextformMentionable[]> {
  const res = await get<{ forms?: TextFormListItem[] }>('/api/text-forms').catch(() => ({
    forms: [],
  }));
  const list = Array.isArray(res?.forms)
    ? res.forms
        .filter((f) => f.kind === 'custom')
        .map((f) => ({ mention: f.mention, title: f.title }))
    : [];
  setTextforms(list);
  return list;
}

export async function syncBoards(get: MentionableFetch): Promise<BoardListItem[]> {
  const boards = await get<BoardListItem[]>('/api/boards');
  const list = Array.isArray(boards) ? boards : [];
  setBoardMentionables(
    list.map((b) => ({ id: b.id, title: b.title, slug: slugifyMention(b.title) }))
  );
  return list;
}

export async function syncSheets(get: MentionableFetch): Promise<DocListItem[]> {
  const docs = await get<DocListItem[]>('/api/docs');
  const list = Array.isArray(docs) ? docs.filter((d) => d.document_subtype === 'sheets') : [];
  setSheetMentionables(
    list.map((d) => ({ id: d.id, title: d.title, slug: slugifyMention(d.title) }))
  );
  return list;
}

export async function syncDocs(get: MentionableFetch): Promise<DocListItem[]> {
  const docs = await get<DocListItem[]>('/api/docs');
  // Boards and sheets are separate mention kinds with their own context loaders.
  const list = Array.isArray(docs)
    ? docs.filter((d) => d.document_subtype !== 'boards' && d.document_subtype !== 'sheets')
    : [];
  setDocMentionables(
    list.map((d) => ({ id: d.id, title: d.title, slug: slugifyMention(d.title) }))
  );
  return list;
}

export async function syncUserNotebooks(get: MentionableFetch): Promise<UserNotebookListItem[]> {
  // Only a 401 resolves to an empty list — web doesn't gate this query on auth,
  // so anonymous users must stay quiet. A blanket catch here hid a wrong path
  // (`/auth/...` without the `/api` prefix every sibling carries) indefinitely.
  const res = await get<{ collections?: UserNotebookListItem[] }>(
    '/api/auth/notebook-collections'
  ).catch((err: unknown) => {
    if (isUnauthorizedError(err)) return { collections: [] };
    throw err;
  });
  const list = Array.isArray(res?.collections) ? res.collections : [];
  setUserNotebookMentionables(
    list.map((n) => ({ id: n.id, title: n.name, slug: slugifyMention(n.name) }))
  );
  return list;
}

/**
 * User's connected external MCP servers → per-server @mentions (@notion,
 * @brevo, …). Only enabled servers become mentions; anonymous users / no
 * servers resolve to an empty list.
 */
export async function syncMcpServers(get: MentionableFetch): Promise<McpServerListItem[]> {
  const res = await get<{ servers?: McpServerListItem[] }>('/api/mcp/servers').catch(() => ({
    servers: [],
  }));
  const list = Array.isArray(res?.servers) ? res.servers.filter((s) => s.enabled) : [];
  setMcpServerMentionables(
    list.map((s) => ({ id: s.id, name: s.name, description: s.description }))
  );
  return list;
}
