/**
 * In-memory stand-in for `threadPersistenceService.ts`, so the chat handler
 * can run in an integration test without Postgres.
 *
 * `vi.mock` with a factory replaces the module wholesale — every export the
 * real module has must exist here too, or a caller that imports it sees
 * `undefined` and throws at the call site instead of at mock-setup time.
 */

import { type PersistedStep } from '../../services/agenticLoop/types.js';
import { type ThreadToolHistory } from '../../services/threadPersistenceService.js';

import type {
  SearchResult,
  ThreadToolContext,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import type { UserProfile } from '../../../../services/user/types.js';
import type { AuthRequest } from '../../../auth/types.js';
import type express from 'express';

export interface FakeThread {
  id: string;
  userId: string;
  agentId: string | null;
  title: string | null;
  threadType: string;
  slugSuffix: string | null;
  lastMcpServerId: string | null;
  lastToolContext: ThreadToolContext | null;
  customSystemPrompt: string | null;
  customEnabledTools: Record<string, boolean> | null;
}

export interface FakeMessage {
  id: string;
  threadId: string;
  role: string;
  content: string | null;
  status?: string;
  metadata?: unknown;
  createdAt: Date;
}

export const threads = new Map<string, FakeThread>();
export const messages = new Map<string, FakeMessage>();

/** Recorded `persistSourcesOnFailure` calls, in call order — a test asserts on this. */
export const recordedSourcePersists: Array<{
  messageId: string;
  noticeText: string;
  searchResults: SearchResult[];
  researchQuery?: string;
}> = [];

const threadToolContextFixtures = new Map<string, ThreadToolContext | null>();
const threadArtifactFixtures = new Map<string, ThreadToolContext[]>();

export function messagesOf(threadId: string): FakeMessage[] {
  return Array.from(messages.values())
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function resetThreadStore(): void {
  threads.clear();
  messages.clear();
  recordedSourcePersists.length = 0;
  threadToolContextFixtures.clear();
  threadArtifactFixtures.clear();
}

/** Script `getThreadToolContext`'s return for a given thread (default: null). */
export function setThreadToolContextFixture(threadId: string, ctx: ThreadToolContext | null): void {
  threadToolContextFixtures.set(threadId, ctx);
}

/** Script `listThreadArtifacts` (newest first) for a thread that holds several. */
export function setThreadArtifactsFixture(threadId: string, list: ThreadToolContext[]): void {
  threadArtifactFixtures.set(threadId, list);
}

export const getUser = (req: AuthRequest | express.Request): UserProfile | undefined =>
  (req as AuthRequest).user;

export async function insertThreadWithSlugRetry<T>(
  insert: (slugSuffix: string) => Promise<T>
): Promise<T> {
  return insert(crypto.randomUUID());
}

export async function createThread(
  userId: string,
  agentId: string,
  title?: string,
  threadType?: 'chat' | 'search' | 'notebook'
): Promise<{
  id: string;
  user_id: string;
  agent_id: string;
  title: string | null;
  thread_type: string;
  slug_suffix: string | null;
}> {
  // A fresh id per call is load-bearing: fixed ids make thread-reap and
  // sameThread assertions structurally unable to fail.
  const id = crypto.randomUUID();
  threads.set(id, {
    id,
    userId,
    agentId,
    title: title || null,
    threadType: threadType || 'chat',
    slugSuffix: crypto.randomUUID(),
    lastMcpServerId: null,
    lastToolContext: null,
    customSystemPrompt: null,
    customEnabledTools: null,
  });
  return {
    id,
    user_id: userId,
    agent_id: agentId,
    title: title || null,
    thread_type: threadType || 'chat',
    slug_suffix: threads.get(id)?.slugSuffix ?? null,
  };
}

export async function ensureDocChatThread(
  docId: string,
  userId: string,
  agentId: string = 'gruenerator-universal'
): Promise<{ id: string }> {
  const id = crypto.randomUUID();
  threads.set(id, {
    id,
    userId,
    agentId,
    title: 'Dokument-Chat',
    threadType: 'chat',
    slugSuffix: crypto.randomUUID(),
    lastMcpServerId: null,
    lastToolContext: null,
    customSystemPrompt: null,
    customEnabledTools: null,
  });
  return { id };
}

export async function createMessage(
  threadId: string,
  role: string,
  content: string | null,
  metadata?: Record<string, unknown>,
  _userId?: string
): Promise<void> {
  const id = crypto.randomUUID();
  messages.set(id, { id, threadId, role, content, metadata, createdAt: new Date() });
}

export async function createPendingAssistantMessage(
  threadId: string,
  _userId?: string
): Promise<string> {
  const id = crypto.randomUUID();
  messages.set(id, {
    id,
    threadId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    createdAt: new Date(),
  });
  return id;
}

export async function updatePendingAssistantText(messageId: string, text: string): Promise<void> {
  const row = messages.get(messageId);
  if (row && row.status === 'streaming') row.content = text;
}

export async function finalizeAssistantMessage(
  messageId: string,
  content: string | null,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const row = messages.get(messageId);
  if (!row) return false;
  row.content = content;
  row.metadata = metadata;
  row.status = 'complete';
  return true;
}

export async function persistSourcesOnFailure(
  messageId: string,
  noticeText: string,
  searchResults: SearchResult[],
  researchQuery?: string
): Promise<boolean> {
  if (searchResults.length === 0) return false;
  recordedSourcePersists.push({
    messageId,
    noticeText,
    searchResults,
    ...(researchQuery && { researchQuery }),
  });
  return finalizeAssistantMessage(messageId, noticeText, {
    searchResults,
    keptOnFailure: true,
    ...(researchQuery && { researchQuery }),
  });
}

export async function getKeptResearchForRetry(
  _threadId: string,
  _query: string
): Promise<{ searchResults: SearchResult[] } | null> {
  return null;
}

export async function discardPendingAssistantIfEmpty(messageId: string): Promise<void> {
  const row = messages.get(messageId);
  // Only an untouched placeholder is discarded — a row with partial text is a
  // kept aborted turn, not a phantom bubble.
  if (row && row.status === 'streaming' && (row.content ?? '') === '') {
    messages.delete(messageId);
  }
}

export async function deleteEmptyStreamingRows(threadId: string): Promise<void> {
  for (const [id, row] of messages) {
    if (
      row.threadId === threadId &&
      row.role === 'assistant' &&
      row.status === 'streaming' &&
      (row.content ?? '') === ''
    ) {
      messages.delete(id);
    }
  }
}

/** Was Postgres bei `WHERE id = $2` mit einer nicht-uuid tut: 22P02. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deleteMessagesFrom(threadId: string, messageId: string): Promise<number> {
  // Ein Fake, der annimmt, was die echte Datenbank zurückweist, verbirgt genau
  // die Fehlerklasse, für die dieser Prüfstand da ist. Am 13.08.2026 schickte
  // der Client „Xa4ZTed" — einen Slug-Suffix — und der Turn brach mit 500 ab,
  // während der Fake hier brav 0 zurückgab.
  if (!UUID_RE.test(messageId)) {
    throw new Error(`Database query failed: invalid input syntax for type uuid: "${messageId}"`);
  }
  const anchor = messages.get(messageId);
  if (!anchor || anchor.threadId !== threadId) return 0;
  let removed = 0;
  for (const [id, row] of messages) {
    if (row.threadId === threadId && row.createdAt.getTime() >= anchor.createdAt.getTime()) {
      messages.delete(id);
      removed++;
    }
  }
  // The caller (streamContext.ts) branches on `removed === 0` to fall back to
  // deleteTrailingAssistant, so the count — not just the deletion — must be right.
  return removed;
}

export async function deleteTrailingAssistant(threadId: string): Promise<number> {
  const threadMessages = messagesOf(threadId);
  const lastUser = [...threadMessages].reverse().find((m) => m.role === 'user');
  const cutoff = lastUser ? lastUser.createdAt.getTime() : -Infinity;
  let removed = 0;
  for (const [id, row] of messages) {
    if (row.threadId === threadId && row.createdAt.getTime() > cutoff) {
      messages.delete(id);
      removed++;
    }
  }
  return removed;
}

export async function touchThread(_threadId: string): Promise<void> {
  // no-op
}

export async function getThreadLastMcpServer(threadId: string): Promise<string | null> {
  return threads.get(threadId)?.lastMcpServerId ?? null;
}

export async function setThreadLastMcpServer(threadId: string, serverId: string): Promise<void> {
  const row = threads.get(threadId);
  if (row) row.lastMcpServerId = serverId;
}

export async function getThreadToolContext(threadId: string): Promise<ThreadToolContext | null> {
  return threadToolContextFixtures.get(threadId) ?? null;
}

export async function listThreadArtifacts(
  threadId: string,
  limit = 4
): Promise<ThreadToolContext[]> {
  const scripted = threadArtifactFixtures.get(threadId);
  if (scripted) return scripted.slice(0, limit);
  // An unscripted thread behaves like one holding just its tool-context slot —
  // which is what every test written before the list existed assumes.
  const tc = threadToolContextFixtures.get(threadId);
  return tc ? [tc] : [];
}

/**
 * The real module's one-read/many-projections door. Delegates to the same
 * fixtures as the functions above, so a test that scripts artifacts sees them
 * whether the caller reads through here or through `listThreadArtifacts`.
 */
export async function readThreadToolHistory(threadId: string): Promise<ThreadToolHistory> {
  const artifacts = await listThreadArtifacts(threadId, Number.MAX_SAFE_INTEGER);
  return {
    artifacts: (limit = 4) => artifacts.slice(0, limit),
    toolSteps: () => [],
    sources: () => [],
    lastGeneratedImageUrl: () => null,
  };
}

export async function setThreadToolContext(
  threadId: string,
  context: ThreadToolContext
): Promise<void> {
  const row = threads.get(threadId);
  if (row) row.lastToolContext = context;
}

export async function getLastGeneratedImageUrl(_threadId: string): Promise<string | null> {
  return null;
}

export async function getRecentToolSteps(_threadId: string, _limit = 6): Promise<PersistedStep[]> {
  return [];
}

export async function getRecentThreadSources(
  _threadId: string,
  _limit = 10
): Promise<SearchResult[]> {
  return [];
}

export interface ThreadSettings {
  custom_system_prompt: string | null;
  custom_enabled_tools: Record<string, boolean> | null;
}

export async function getThreadSettings(threadId: string): Promise<ThreadSettings | null> {
  const row = threads.get(threadId);
  if (!row) return null;
  return {
    custom_system_prompt: row.customSystemPrompt,
    custom_enabled_tools: row.customEnabledTools,
  };
}

export async function updateThreadSettings(
  threadId: string,
  _userId: string,
  settings: {
    customSystemPrompt?: string | null;
    customEnabledTools?: Record<string, boolean> | null;
  }
): Promise<boolean> {
  const row = threads.get(threadId);
  if (!row) return false;
  if (settings.customSystemPrompt !== undefined)
    row.customSystemPrompt = settings.customSystemPrompt;
  if (settings.customEnabledTools !== undefined)
    row.customEnabledTools = settings.customEnabledTools;
  return true;
}
