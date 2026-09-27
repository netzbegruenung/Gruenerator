/**
 * Session lifecycle debug tracing.
 *
 * The "half logged in" bug happens in prod/beta for arbitrary users who can't
 * be asked to pre-arm a debug flag before an incident. So the RECORDING is
 * ALWAYS-ON: a module-level ring buffer (last 50 events, cost is nil), attached
 * to the one GlitchTip `session-teardown` event per incident (see
 * captureAuthIssue) — a real incident report carries the full ordered timeline
 * without anyone having read a console.
 *
 * The `console.info('[SessionDebug]', …)` mirror is therefore only a
 * convenience, and it is OFF by default: it fired ~30× per page load and
 * drowned out everything else in devtools. Turn it on per-tab when chasing a
 * session bug:
 *   localStorage['gruenerator:session_debug'] = 'on'
 * or dump the buffer at any time with `__sessionDebug()`.
 *
 * DEPENDENCY DIRECTION: this module sits at the BOTTOM of the graph. It is
 * imported BY apiClient / authStore / useAuth / captureAuthIssue and must
 * import nothing from them (or it creates a cycle). Keep it self-contained.
 */

const RING_BUFFER_SIZE = 50;
const CONSOLE_ON_KEY = 'gruenerator:session_debug';

export interface SessionDebugEvent {
  ts: string;
  seq: number;
  event: string;
  [key: string]: unknown;
}

let seqCounter = 0;
const ringBuffer: SessionDebugEvent[] = [];

function consoleMirrorEnabled(): boolean {
  try {
    return localStorage.getItem(CONSOLE_ON_KEY) === 'on';
  } catch {
    // localStorage unavailable (private mode / SSR) — stay quiet.
    return false;
  }
}

/**
 * Record one session-lifecycle event. Always pushes to the ring buffer;
 * mirrors to console.info unless muted via localStorage.
 */
export function sessionDebug(event: string, payload: Record<string, unknown> = {}): void {
  const entry: SessionDebugEvent = {
    ts: new Date().toISOString(),
    seq: seqCounter++,
    event,
    ...payload,
  };

  ringBuffer.push(entry);
  if (ringBuffer.length > RING_BUFFER_SIZE) {
    ringBuffer.shift();
  }

  if (consoleMirrorEnabled()) {
    // Intentional: console mirroring is this module's purpose (prod-diagnosable
    // incidents). info-level so it doesn't masquerade as a warning/error.
    // eslint-disable-next-line no-console
    console.info('[SessionDebug]', event, payload);
  }
}

/**
 * Snapshot of the ring buffer (oldest → newest). Attached to GlitchTip
 * teardown reports so an incident carries its full lead-up.
 */
export function getSessionDebugBuffer(): SessionDebugEvent[] {
  return [...ringBuffer];
}

// Expose a console helper + a focus/visibility tracer at module load. Guard on
// `window` so an accidental import in a non-DOM context (tests, SSR) is inert.
if (typeof window !== 'undefined') {
  (window as typeof window & { __sessionDebug?: () => SessionDebugEvent[] }).__sessionDebug =
    () => {
      const snapshot = getSessionDebugBuffer();
      // eslint-disable-next-line no-console
      console.table(snapshot);
      return snapshot;
    };

  // A window regaining focus / becoming visible is what triggers the authStatus
  // refetch that can flip the verdict — recording it here (rather than hooking
  // React Query internals) is the cheapest way to correlate "focus → verdict
  // flip → teardown" in the timeline. Only the *regaining* transitions matter
  // (they drive the refetch); a small time dedupe collapses the visibilitychange
  // + focus pair that fires together on a single tab-return.
  let lastFocusLog = 0;
  const logFocus = (trigger: string) => {
    const now = Date.now();
    if (now - lastFocusLog < 200) return;
    lastFocusLog = now;
    sessionDebug('focus.refetch', { visibilityState: document.visibilityState, trigger });
  };
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') logFocus('visibilitychange');
  });
  window.addEventListener('focus', () => logFocus('focus'));
}
