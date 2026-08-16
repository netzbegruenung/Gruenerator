/**
 * Shared vocabulary for the `stream` turn stages.
 *
 * The stages are the turn's steps in the order `chatGraphContractRouter`
 * sequences them: classify → forced intents → early handlers → gates →
 * routing → recall/interrupts → create → response → artifacts → persist.
 * Each one takes an explicit parameter object and returns an explicit result;
 * none of them reads the router's locals.
 */

import { type StreamContext } from '../services/streamContext.js';

export { type StreamBody } from '../services/streamContext.js';

/**
 * ts-rest handler result for both SSE endpoints. The response body is written
 * straight onto the socket, so the contract body is empty on every path — the
 * status is what ts-rest needs, not the payload.
 */
export type StreamHandlerResult = { status: 200; body: undefined };

/**
 * Stop the placeholder assistant writer and (when `discard`) drop the row if it
 * stayed empty. Passed into every stage that can end the turn, because it must
 * run on EVERY return path after the placeholder was created.
 */
export type CleanupPending = (discard: boolean) => Promise<void>;

/**
 * A stage that may own the whole turn: `handled: true` means it already wrote
 * the SSE response and the router returns immediately.
 */
export type MaybeHandled<T = Record<never, never>> =
  ({ handled: false } & T) | { handled: true; result: StreamHandlerResult };

/** The turn's classified state — `initialState` plus the classifier's verdict. */
export type InitialState = StreamContext['initialState'];
