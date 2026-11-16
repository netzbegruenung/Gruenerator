/**
 * A second send into a team chat while another member's answer is still
 * running: the server refuses with the stream error code `thread_busy`
 * (`retryable: true`). It is a queue, not a failure — the screen shows a calm
 * waiting notice instead of the red error banner.
 *
 * What the message status carries is `errorStatus()`'s output: the curated
 * text in `error` and, since the code is the only reliable signal, the wire
 * code in `code`. The server's own wording (`PROGRESS_MESSAGES.threadBusy`) is
 * the fallback for a status that lost the code on the way.
 */
const SERVER_BUSY_TEXT = 'Gerade entsteht schon eine Antwort in diesem Chat.';

export function isThreadBusyStatus(status: unknown): boolean {
  if (typeof status !== 'object' || status === null) return false;
  const { code, error } = status as { code?: unknown; error?: unknown };
  if (code === 'thread_busy') return true;
  return typeof error === 'string' && error.includes(SERVER_BUSY_TEXT);
}

export const THREAD_BUSY_NOTICE =
  'Eine andere Person bekommt gerade eine Antwort. Sobald sie fertig ist, kannst du deine Nachricht senden.';
