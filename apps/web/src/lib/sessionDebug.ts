/**
 * Session lifecycle debug tracing.
 *
 * The "half logged in" bug happens in prod/beta for arbitrary users who can't
 * be asked to pre-arm a debug flag before an incident. So this is ALWAYS-ON:
 * a module-level ring buffer (last 50 events, cost is nil) plus a
 * `console.info('[SessionDebug]', …)` mirror. The buffer is attached to the
 * one GlitchTip `session-teardown` event per incident (see captureAuthIssue),
 * so a real incident report carries the full ordered timeline.
 *
 * Console mirror opt-out only (buffer keeps filling):
 *   localStorage['gruenerator:session_debug'] = 'off'
 *
 * DEPENDENCY DIRECTION: this module sits at the BOTTOM of the graph. It is
 * imported BY apiClient / authStore / useAuth / captureAuthIssue and must
 * import nothing from them (or it creates a cycle). Keep it self-contained.
 */

const RING_BUFFER_SIZE = 50;
const CONSOLE_OFF_KEY = 'gruenerator:session_debug';

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
    return localStorage.getItem(CONSOLE_OFF_KEY) !== 'off';
  } catch {
    // localStorage unavailable (private mode / SSR) — default to on.
    return true;
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
