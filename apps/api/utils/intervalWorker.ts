import { createLogger } from './logger.js';

/**
 * Shared factory for the "start a long-lived polling loop at boot" pattern that
 * several background workers implement by hand (due-date reminders, the agent
 * queue drainer, the cleanup schedulers). It centralises the parts that were
 * copy-pasted everywhere: the `initialized` guard (idempotent start), an optional
 * initial delay before the first tick, a re-entrancy guard so a slow tick never
 * overlaps itself, and consistent error logging.
 *
 * The `tick` is expected to be self-contained; any error it throws is caught and
 * logged here (a worker must never crash the process), so callers can let their
 * tick reject instead of wrapping every body in try/catch.
 */
export interface IntervalWorkerOptions {
  /** Used as the log `service` label, e.g. "CardDueReminder". */
  name: string;
  /** Delay between ticks, in ms. */
  intervalMs: number;
  /**
   * Delay before the first tick, in ms. Defaults to `intervalMs`. Set to 0 to run
   * immediately on start; workers that touch the DB usually stagger the first run
   * so boot isn't contended.
   */
  initialDelayMs?: number;
  /** One unit of work. Rejections are caught and logged, never rethrown. */
  tick: () => Promise<void>;
}

export interface IntervalWorker {
  /** Idempotent — a second call while running is a no-op. */
  start(): void;
  stop(): void;
}

export function createIntervalWorker(opts: IntervalWorkerOptions): IntervalWorker {
  const log = createLogger(opts.name);
  const initialDelayMs = opts.initialDelayMs ?? opts.intervalMs;

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let initialized = false;
  // Prevents a tick from starting while the previous one is still running — a
  // slow DB scan or a long agent drain must not overlap with the next tick.
  let running = false;

  async function runTick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      await opts.tick();
    } catch (err: unknown) {
      log.error(`Tick failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  }

  return {
    start(): void {
      if (initialized) return;
      initialTimeoutId = setTimeout(() => void runTick(), initialDelayMs);
      intervalId = setInterval(() => void runTick(), opts.intervalMs);
      initialized = true;
      log.info(`Started (interval: ${Math.round(opts.intervalMs / 1000)}s)`);
    },
    stop(): void {
      if (initialTimeoutId) {
        clearTimeout(initialTimeoutId);
        initialTimeoutId = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      initialized = false;
    },
  };
}
