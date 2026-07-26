/**
 * Recording SSEWriter for tests, plus the invariants a chat turn must uphold.
 *
 * The bug class this exists for: a handler catches a failure, logs it, and the
 * stream closes with no terminal event — the turn looks successful to the
 * client. `assertTerminated()` is the guard; use it in every test that drives a
 * turn to completion, especially the failure paths.
 */

import { expect } from 'vitest';

import { type SSEWriter } from '../sseHelpers.js';

export interface RecordedEvent {
  event: string;
  data: unknown;
}

export class MockSSEWriter {
  readonly recorded: RecordedEvent[] = [];
  private ended = false;

  send(event: string, data: unknown): void {
    if (this.ended) return;
    this.recorded.push({ event, data });
  }

  sendRaw(event: string, data: unknown): void {
    this.send(event, data);
  }

  end(): void {
    this.ended = true;
  }

  isEnded(): boolean {
    return this.ended;
  }

  setTextListener(): void {
    // no-op — tests read `recorded` directly
  }

  /** Events of one type, in arrival order. */
  eventsOfType(event: string): unknown[] {
    return this.recorded.filter((e) => e.event === event).map((e) => e.data);
  }

  /** Warning codes emitted, in arrival order. */
  warningCodes(): string[] {
    return this.eventsOfType('warning').map((d) => (d as { code?: string }).code ?? '');
  }

  /**
   * Every turn must end with exactly one terminal event — `done` (success,
   * possibly degraded) or `error` (fatal). A stream that just closes is the
   * silent-swallow signature.
   */
  assertTerminated(): void {
    const terminals = this.recorded.filter((e) => e.event === 'done' || e.event === 'error');
    expect(
      terminals.length,
      `expected exactly one terminal event, got ${terminals.length}: [${this.recorded.map((e) => e.event).join(', ')}]`
    ).toBe(1);
  }

  /** The degradation was signalled to the client. */
  assertWarned(code: string): void {
    expect(this.warningCodes(), `warnings emitted: [${this.warningCodes().join(', ')}]`).toContain(
      code
    );
  }

  assertNotWarned(): void {
    expect(this.warningCodes()).toEqual([]);
  }

  /** Cast for handlers typed against the real writer. */
  asSSEWriter(): SSEWriter {
    return this as unknown as SSEWriter;
  }
}
