/**
 * Android's hardware back for a page that must flush before it is torn down
 * (an open text edit, unacknowledged collab updates — #4403).
 *
 * While the page has announced `CLOSE_HANDLER`, back asks it with
 * `REQUEST_CLOSE` and the screen closes on the page's `CLOSE`. The deadline
 * covers a page that never answers (an older deploy, a hung flush), and a
 * second press closes at once: back must never trap the user.
 */
export function createCloseRequest({
  requestClose,
  close,
  timeoutMs,
}: {
  requestClose: () => void;
  close: () => void;
  timeoutMs: number;
}) {
  let pageHandles = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function cancelTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  // Every exit goes through here: a late `CLOSE` after the deadline already
  // closed would pop the screen below as well.
  function finish() {
    cancelTimer();
    if (closed) return;
    closed = true;
    close();
  }

  return {
    setPageHandles(active: boolean) {
      pageHandles = active;
    },
    /** For `hardwareBackPress`: true when the press is handled here. */
    onHardwareBack(): boolean {
      if (timer !== null) {
        finish();
        return true;
      }
      if (!pageHandles) return false;
      requestClose();
      timer = setTimeout(finish, timeoutMs);
      return true;
    },
    /** The page's `CLOSE`. */
    onPageClose: finish,
    dispose: cancelTimer,
  };
}
