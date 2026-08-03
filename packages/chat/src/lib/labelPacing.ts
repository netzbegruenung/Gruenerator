/**
 * Framework-free timing controllers behind the chat's calm-pacing UX. Kept out
 * of the React hooks so the behaviour is unit-testable with fake timers (the
 * package's vitest env is `node`, no DOM). The hooks (`usePacedLabel`,
 * `useDelayedUnmount`) are thin wrappers that feed `onChange` into `setState`.
 */

export interface PacedLabelOptions {
  /** Minimum time a label stays visible before the next one may replace it. */
  minVisibleMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface PacedLabelController {
  /** Feed the latest incoming label. Backlog is dropped — only the newest
   *  queued value is shown next, so a burst never plays back as a flicker. */
  push: (value: string) => void;
  get: () => string;
  dispose: () => void;
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/**
 * Paces label changes so each stays visible at least `minVisibleMs`. Extra
 * updates during the wait collapse to the most recent (drop-backlog-keep-latest),
 * matching the old "last writer wins" semantics but readable. The first value is
 * whatever the controller is created with, shown immediately; only *changes* pace.
 */
export function createPacedLabelController(
  initial: string,
  onChange: (value: string) => void,
  options: PacedLabelOptions = {}
): PacedLabelController {
  const minVisibleMs = options.minVisibleMs ?? 900;
  const now = options.now ?? defaultNow;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h));

  let visible = initial;
  let lastSwap = now();
  let queued: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    if (queued === null) return;
    const next = queued;
    queued = null;
    if (next === visible) return;
    visible = next;
    lastSwap = now();
    onChange(visible);
  };

  const schedule = (): void => {
    // A pending flush already covers the newest queued value — don't stack timers.
    if (timer !== null) return;
    const delay = Math.max(0, minVisibleMs - (now() - lastSwap));
    timer = setTimer(flush, delay);
  };

  return {
    push(value: string): void {
      if (value === visible && queued === null) return;
      queued = value;
      schedule();
    },
    get: () => visible,
    dispose(): void {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}

export interface ExitLatchOptions {
  /** How long the element stays mounted (fading out) after going inactive. */
  exitMs?: number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface ExitLatchState {
  /** Whether to render at all (true through the whole exit fade). */
  mounted: boolean;
  /** True only during the exit fade — drives the fade-out CSS class. */
  exiting: boolean;
}

export interface ExitLatchController {
  set: (active: boolean) => void;
  dispose: () => void;
}

/**
 * Keeps a conditionally-rendered element mounted for `exitMs` after it goes
 * inactive so it can fade out instead of vanishing. Re-activating mid-fade
 * cancels the exit. Powers `useDelayedUnmount` for the streaming status line.
 */
export function createExitLatchController(
  initialActive: boolean,
  onChange: (state: ExitLatchState) => void,
  options: ExitLatchOptions = {}
): ExitLatchController {
  const exitMs = options.exitMs ?? 250;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h));

  let mounted = initialActive;
  let exiting = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = (): void => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };

  return {
    set(active: boolean): void {
      if (active) {
        clear();
        if (!mounted || exiting) {
          mounted = true;
          exiting = false;
          onChange({ mounted, exiting });
        }
      } else if (mounted && !exiting) {
        exiting = true;
        onChange({ mounted, exiting });
        timer = setTimer(() => {
          timer = null;
          mounted = false;
          exiting = false;
          onChange({ mounted, exiting });
        }, exitMs);
      }
    },
    dispose(): void {
      clear();
    },
  };
}
