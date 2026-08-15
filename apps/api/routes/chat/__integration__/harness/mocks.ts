import { vi } from 'vitest';

/**
 * Module-shaped factories for the `vi.mock` blocks. The `vi.mock` CALLS stay
 * literal in each test file — whether a `vi.mock` registered from an imported
 * module reliably applies to the importing file's graph is not something to
 * bet a suite on, and the literal form is the repo's idiom
 * (searchImageProxy.vitest.ts, responseStreamingService.vitest.ts).
 *
 * Each factory returns the FULL module shape. `vi.mock` with a factory replaces
 * a module wholesale, so an unlisted export is `undefined` at its call site —
 * which the router's outer catch turns into a generic SSE error rather than a
 * named failure.
 */

/**
 * Backstop, never satisfied on a green path. A real connection attempt would
 * cost `connectionTimeoutMillis` (10 s) per call; this turns a forgotten mock
 * into an instant, readable failure naming the SQL.
 */
export function postgresMock(): Record<string, unknown> {
  return {
    getPostgresInstance: () => ({
      query: (sql: string) => {
        throw new Error(`unexpected Postgres query: ${String(sql).slice(0, 300)}`);
      },
    }),
  };
}

export interface ThreadAccessControl {
  allow: boolean;
}
export const threadAccess: ThreadAccessControl = { allow: true };

export function threadAccessMock(): Record<string, unknown> {
  return { canAccessThread: () => Promise.resolve(threadAccess.allow) };
}

/**
 * Mocked rather than `contextPruningService`, so that `pruneMessages` — pure,
 * and itself a test subject — stays real. Only the DB-backed compaction reads
 * are replaced.
 */
export function compactionMock(original: Record<string, unknown>): Record<string, unknown> {
  return {
    ...original,
    getCompactionState: () => Promise.resolve({ summary: null }),
    saveCompactionState: vi.fn(() => Promise.resolve()),
    getMessageCount: () => Promise.resolve(2),
    getThreadMessages: () => Promise.resolve([]),
    generateCompactionSummary: vi.fn(() => Promise.resolve(null)),
  };
}

export function attachmentPersistenceMock(
  original: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...original,
    getThreadAttachments: () => Promise.resolve([]),
    getThreadTabularFiles: () => Promise.resolve([]),
    getThreadPdfFiles: () => Promise.resolve([]),
    saveThreadAttachment: vi.fn(() => Promise.resolve('attachment-1')),
    getAttachmentText: () => Promise.resolve(null),
    embedThreadAttachmentForRag: vi.fn(() => Promise.resolve()),
    deleteThreadAttachmentVectors: vi.fn(() => Promise.resolve()),
    deleteThreadAttachments: vi.fn(() => Promise.resolve()),
    generateAttachmentSummary: vi.fn(() => Promise.resolve('')),
    generateImageSummary: vi.fn(() => Promise.resolve('')),
    formatThreadAttachmentsContext: () => '',
  };
}

/** `getSpaceRecallScope` runs unconditionally once a thread exists. */
export function pastChatRecallMock(original: Record<string, unknown>): Record<string, unknown> {
  return {
    ...original,
    resolveSpaceThreadIds: () => Promise.resolve({ kind: 'none' }),
    getSpaceRecallScope: () => Promise.resolve(null),
    recallPastChats: () => Promise.resolve([]),
    recallOfficeDocuments: () => Promise.resolve([]),
    recallReels: () => Promise.resolve([]),
    rerankRecall: () => Promise.resolve({ chats: [], officeDocs: [], reels: [] }),
    getThreadRecallContext: () => Promise.resolve(null),
    formatPastChatsBlock: () => '',
    formatOfficeDocsBlock: () => '',
    formatReelsBlock: () => '',
  };
}

export interface PersistControl {
  ok: boolean;
  calls: unknown[];
}
export const persistControl: PersistControl = { ok: true, calls: [] };

export function postResponseMock(original: Record<string, unknown>): Record<string, unknown> {
  return {
    ...original,
    persistAssistantResponse: (params: unknown) => {
      persistControl.calls.push(params);
      return Promise.resolve({ ok: persistControl.ok });
    },
    persistResumedResponse: (params: unknown) => {
      persistControl.calls.push(params);
      return Promise.resolve({ ok: persistControl.ok });
    },
  };
}

/**
 * NOT optional. `pipelineStateStore.store` calls `redisClient.setEx`, and
 * node-redis QUEUES commands while disconnected and retries reconnecting
 * forever — so the promise never settles and the module's own try/catch never
 * fires. Without this mock an interrupt test hangs to the vitest timeout
 * instead of failing. (The same trap is documented in verdigadoSlot.ts.)
 */
export const pipelineStates = new Map<string, unknown>();

export function pipelineStateStoreMock(): Record<string, unknown> {
  return {
    pipelineStateStore: {
      store: (threadId: string, data: unknown) => {
        pipelineStates.set(threadId, { ...(data as object), createdAt: 0 });
        return Promise.resolve();
      },
      get: (threadId: string) => Promise.resolve(pipelineStates.get(threadId)),
      delete: (threadId: string) => {
        pipelineStates.delete(threadId);
        return Promise.resolve();
      },
    },
  };
}

/**
 * `threadHasSharepic` fails safe to `true` on any DB error — deliberately, so a
 * blip cannot be read as "nothing here" and license a fresh creation. With the
 * throwing Postgres backstop that safety net would fire on every turn, pinning
 * the sharepic gate permanently to its "thread has one" branch. Controlling it
 * explicitly is what makes BOTH branches reachable.
 */
export interface SharepicControl {
  threadHasSharepic: boolean;
}
export const sharepicControl: SharepicControl = { threadHasSharepic: false };

export function sharepicEditMock(original: Record<string, unknown>): Record<string, unknown> {
  return {
    ...original,
    threadHasSharepic: () => Promise.resolve(sharepicControl.threadHasSharepic),
  };
}

/**
 * Die gespeicherten Rollen der Person und der parteiinterne Rollen-Baustein —
 * die zwei Quellen, aus denen ein Rollen-Turn seinen Systemprompt zieht, und
 * die einzigen zwei, die in diesem Harness nicht real sein können (Postgres,
 * Dateisystem).
 *
 * Dass die Rollen HIER stehen und nicht im Testnutzer, ist die eigentliche
 * Zusicherung: liest der Code sie wieder aus der Sitzung (`req.user`), findet
 * er nichts — genau der Fehler, der den Rollen-Chat stumm auf den Basis-Agenten
 * fallen ließ.
 */
export interface RoleControl {
  roles: Array<Record<string, unknown>>;
  bausteine: Record<string, string>;
}
export const roleControl: RoleControl = { roles: [], bausteine: {} };

export function userRolesMock(): Record<string, unknown> {
  return { loadUserRoles: () => Promise.resolve(roleControl.roles) };
}

export function internalPromptsMock(original: Record<string, unknown>): Record<string, unknown> {
  return {
    ...original,
    getInternalRolePrompt: (key: string) => roleControl.bausteine[key] ?? null,
  };
}

export function resetMockControls(): void {
  threadAccess.allow = true;
  sharepicControl.threadHasSharepic = false;
  persistControl.ok = true;
  persistControl.calls.length = 0;
  pipelineStates.clear();
  roleControl.roles = [];
  roleControl.bausteine = {};
}
