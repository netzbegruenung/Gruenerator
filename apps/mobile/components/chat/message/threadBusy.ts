/**
 * A second send into a team chat while another member's answer is still
 * running: the server refuses with the stream error code `thread_busy`
 * (`retryable: true`). It is a queue, not a failure — the screen shows a calm
 * waiting notice instead of the red error banner.
 */
export function isThreadBusyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'thread_busy'
  );
}

export const THREAD_BUSY_NOTICE =
  'Eine andere Person bekommt gerade eine Antwort. Sobald sie fertig ist, kannst du deine Nachricht senden.';
