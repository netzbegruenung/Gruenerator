/**
 * Client side of resumable turns. The server tees every turn into a store under
 * its placeholder message id (announced as `stream_started`); these helpers
 * re-attach to it after a reload or a dropped connection, and stop it when the
 * user presses Stop.
 */
import { useChatConfigStore } from '../stores/chatConfigStore';

/** Pauses before each re-attach attempt after a dropped connection. */
export const REATTACH_DELAYS_MS = [500, 1500, 4000] as const;

/**
 * The turn's SSE replay from its first byte, tailing until it ends. null when
 * there is nothing left to attach to (expired, cancelled, or not ours).
 * Throws on a network error so the caller can retry.
 */
export async function reattachStream(
  streamId: string,
  signal?: AbortSignal
): Promise<Response | null> {
  const { fetch, endpoints } = useChatConfigStore.getState();
  const response = await fetch(`${endpoints.streams}/${encodeURIComponent(streamId)}`, {
    method: 'GET',
    ...(signal && { signal }),
  });
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) throw new Error(`Reattach failed: HTTP ${response.status}`);
  return response;
}

/** Stop the turn server-side. Fire-and-forget: the stream is gone either way. */
export function cancelStream(streamId: string): void {
  const { fetch, endpoints } = useChatConfigStore.getState();
  void fetch(`${endpoints.streams}/${encodeURIComponent(streamId)}/cancel`, {
    method: 'POST',
  }).catch(() => {});
}

/**
 * Whether an aborted run should also end its turn on the server. assistant-ui
 * aborts with `AbortError(detach=true)` when the thread runtime goes away
 * (unmount, navigation, delete) — that turn keeps running so the user can come
 * back to it. Everything else ends it: the Stop button (`detach=false`) and a
 * run superseded by an edit or regenerate (no reason).
 */
export function abortEndsTurn(signal: AbortSignal | undefined): boolean {
  if (!signal?.aborted) return false;
  const reason: unknown = signal.reason;
  const isTeardown =
    reason instanceof Error &&
    reason.name === 'AbortError' &&
    (reason as { detach?: unknown }).detach === true;
  return !isTeardown;
}

/** Mid-stream connection drop (proxy timeout, mobile network switch, worker recycle). */
export function isNetworkDrop(err: unknown): boolean {
  return (
    err instanceof TypeError &&
    /network error|failed to fetch|load failed|error in input stream/i.test(err.message)
  );
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * Re-attach after a dropped connection, retrying while the network is still
 * gone. `budget.used` counts attempts across the whole turn, so a connection
 * that keeps dropping cannot retry forever. null = give up (budget spent,
 * aborted, or nothing left to attach to).
 */
export async function reattachWithBackoff(
  streamId: string,
  signal: AbortSignal | undefined,
  budget: { used: number }
): Promise<Response | null> {
  while (budget.used < REATTACH_DELAYS_MS.length) {
    await sleep(REATTACH_DELAYS_MS[budget.used]!, signal);
    budget.used++;
    if (signal?.aborted) return null;
    try {
      return await reattachStream(streamId, signal);
    } catch {
      // still offline — next attempt
    }
  }
  return null;
}

/**
 * Split a still-running turn off a loaded thread. assistant-ui resumes as a NEW
 * assistant message under the loaded head, so the live row must leave the
 * history — otherwise the resumed answer would sit next to its own partial.
 * Only a trailing row counts: anything after it means the turn is no longer
 * the thread's current one.
 */
export function splitLiveTurn<
  T extends { id: string; role: string; content: unknown; metadata?: { live?: boolean } },
>(rows: T[]): { rows: T[]; live: { streamId: string; partialText: string } | null } {
  const last = rows.at(-1);
  if (!last || last.role !== 'assistant' || last.metadata?.live !== true) {
    return { rows, live: null };
  }
  return {
    rows: rows.slice(0, -1),
    live: {
      streamId: last.id,
      partialText: typeof last.content === 'string' ? last.content : '',
    },
  };
}
