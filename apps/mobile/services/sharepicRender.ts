/**
 * Drives the offscreen sharepic renderer.
 *
 * A sharepic is drawn by Konva in a DOM. There is no server-side renderer and
 * no bitmap in the stream — the chat delivers a canvas description
 * (`canvasType` + `initialProps`) and the web app turns it into a picture in
 * the browser. So the app borrows that renderer: a hidden WebView on
 * `/mobile-render` receives the description over `postMessage` and posts a PNG
 * back. One renderer for both platforms, which is the whole point; a native
 * re-implementation would drift the first time a template changed.
 *
 * This module is the queue and the protocol. It owns no WebView — that has to
 * live in the React tree, so `SharepicRenderHost` mounts it and registers here.
 * Splitting it this way is what makes the interesting parts (serialisation,
 * timeout, retry, deduplication, host loss) testable without a device.
 *
 * Renders run ONE at a time. Each one mounts a full Konva stage in the page;
 * several at once on a phone-class WebView is how you get an out-of-memory kill
 * instead of three pictures.
 */

import { parseWebViewMessage, WEBVIEW_PROTOCOL_VERSION } from '@gruenerator/shared';
import { useSyncExternalStore } from 'react';

/**
 * How long one render may take, measured from the moment it is posted.
 *
 * Generous on purpose: the page polls its canvas for up to five seconds and a
 * cold WebView spends longer than that booting the web app before the first
 * request is even accepted. The timeout is a stall detector, not a performance
 * budget.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * How long the host has to come up before waiting renders are abandoned.
 *
 * Without it a failed handoff (expired session, no network) leaves every card
 * spinning forever. A card that says "keine Vorschau" is honest; a spinner that
 * never resolves is not.
 */
const HOST_BOOT_TIMEOUT_MS = 45_000;

/** One retry, and only one: the common failure is a transient cold-start. */
const MAX_ATTEMPTS = 2;

/**
 * Idle grace before the WebView is torn down.
 *
 * It holds the whole web app plus a Konva stage, so keeping it alive through a
 * long chat costs real memory — but re-booting it costs seconds, and users
 * scroll back to a sharepic they just made. A minute covers that without
 * holding the page for a session.
 */
const IDLE_UNMOUNT_MS = 60_000;

interface Job {
  /** Caller-supplied identity — two cards asking for the same picture share one render. */
  key: string;
  canvasType: string;
  initialProps: Record<string, unknown>;
  waiters: ((image: string | null) => void)[];
  attempts: number;
}

interface InFlight {
  job: Job;
  requestId: string;
  timer: ReturnType<typeof setTimeout>;
}

let queue: Job[] = [];
let inFlight: InFlight | null = null;
let hostReady = false;
let postToPage: ((payload: string) => void) | null = null;
let requestCounter = 0;
let bootTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Whether the host component should be mounted. Read through `useRenderHostDemand`. */
let demanded = false;
const demandListeners = new Set<() => void>();

function setDemanded(next: boolean): void {
  if (demanded === next) return;
  demanded = next;
  for (const listener of demandListeners) listener();
}

function subscribeDemand(listener: () => void): () => void {
  demandListeners.add(listener);
  return () => demandListeners.delete(listener);
}

/**
 * True while there is rendering to do (or recently was).
 *
 * The host mounts on demand rather than at app start: most sessions never ask
 * for a sharepic, and an idle WebView holding the web app is not free.
 */
export function useRenderHostDemand(): boolean {
  return useSyncExternalStore(
    subscribeDemand,
    () => demanded,
    () => false
  );
}

function pending(): boolean {
  return queue.length > 0 || inFlight !== null;
}

function armIdleUnmount(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (!pending()) setDemanded(false);
  }, IDLE_UNMOUNT_MS);
}

function armBootTimeout(): void {
  if (bootTimer !== null || hostReady) return;
  bootTimer = setTimeout(() => {
    bootTimer = null;
    if (hostReady) return;
    hostUnavailable('render host did not become ready');
  }, HOST_BOOT_TIMEOUT_MS);
}

function settle(job: Job, image: string | null): void {
  for (const waiter of job.waiters) waiter(image);
  job.waiters = [];
}

function finishInFlight(image: string | null): void {
  if (inFlight === null) return;
  clearTimeout(inFlight.timer);
  const { job } = inFlight;
  inFlight = null;
  settle(job, image);
  if (!pending()) armIdleUnmount();
  pump();
}

/** A failed attempt: retry once, then give up on this job and move on. */
function failInFlight(reason: string): void {
  if (inFlight === null) return;
  const { job } = inFlight;
  clearTimeout(inFlight.timer);
  inFlight = null;
  if (job.attempts < MAX_ATTEMPTS) {
    console.warn(`[sharepicRender] retrying ${job.key}: ${reason}`);
    queue.unshift(job);
  } else {
    console.warn(`[sharepicRender] giving up on ${job.key}: ${reason}`);
    settle(job, null);
  }
  if (!pending()) armIdleUnmount();
  pump();
}

function pump(): void {
  if (inFlight !== null || !hostReady || postToPage === null) return;
  const job = queue.shift();
  if (job === undefined) return;

  job.attempts += 1;
  requestCounter += 1;
  const requestId = `r${requestCounter}`;
  const timer = setTimeout(() => failInFlight('timeout'), REQUEST_TIMEOUT_MS);
  inFlight = { job, requestId, timer };

  postToPage(
    JSON.stringify({
      type: 'RENDER_REQUEST',
      requestId,
      canvasType: job.canvasType,
      initialProps: job.initialProps,
    })
  );
}

/**
 * Renders one sharepic variant, or resolves null when it cannot be produced.
 *
 * Never rejects: a missing preview is a state the card draws, not an exception
 * every call site would have to catch.
 */
export function renderSharepic(
  key: string,
  canvasType: string,
  initialProps: Record<string, unknown>
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    // Same picture already being worked on — join it instead of queueing a
    // second identical render. Scrolling a thread asks for the same variants
    // repeatedly, and each render is seconds of a phone's GPU.
    if (inFlight?.job.key === key) {
      inFlight.job.waiters.push(resolve);
      return;
    }
    const queued = queue.find((job) => job.key === key);
    if (queued !== undefined) {
      queued.waiters.push(resolve);
      return;
    }

    queue.push({ key, canvasType, initialProps, waiters: [resolve], attempts: 0 });
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    setDemanded(true);
    armBootTimeout();
    pump();
  });
}

/** Called by the host once its WebView can receive messages. */
export function registerRenderHost(post: (payload: string) => void): void {
  postToPage = post;
  pump();
}

/**
 * The host is going away (unmounted, session lost, handoff failed).
 *
 * Anything in flight goes back on the queue: a new host will pick it up. If no
 * host follows, the boot timeout ends the wait.
 */
export function unregisterRenderHost(): void {
  postToPage = null;
  hostReady = false;
  if (inFlight !== null) {
    clearTimeout(inFlight.timer);
    queue.unshift(inFlight.job);
    inFlight = null;
  }
  if (pending()) armBootTimeout();
}

/**
 * No renderer is reachable — fail everything waiting rather than hold spinners.
 */
export function hostUnavailable(reason: string): void {
  console.warn(`[sharepicRender] host unavailable: ${reason}`);
  if (bootTimer !== null) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
  if (inFlight !== null) {
    clearTimeout(inFlight.timer);
    const { job } = inFlight;
    inFlight = null;
    settle(job, null);
  }
  const abandoned = queue;
  queue = [];
  for (const job of abandoned) settle(job, null);
  hostReady = false;
  setDemanded(false);
}

/**
 * A message from the render page.
 *
 * Returns `'session-lost'` when the host must re-mint its handoff; the host
 * owns that decision because it owns the URL.
 */
export function handleRenderHostMessage(raw: unknown): 'handled' | 'session-lost' | 'ignored' {
  const message = parseWebViewMessage(raw);
  if (message === null) return 'ignored';

  if (message.type === 'RENDER_HOST_READY') {
    if (message.protocolVersion !== WEBVIEW_PROTOCOL_VERSION) {
      // The WebView points at the DEPLOYED web app, so this is a real state:
      // an old binary meeting a newer page. Declining beats firing requests
      // whose replies we could not parse and then timing out on each one.
      hostUnavailable(
        `protocol mismatch (page ${message.protocolVersion}, app ${WEBVIEW_PROTOCOL_VERSION})`
      );
      return 'handled';
    }
    if (bootTimer !== null) {
      clearTimeout(bootTimer);
      bootTimer = null;
    }
    hostReady = true;
    pump();
    return 'handled';
  }

  if (message.type === 'RENDER_RESULT') {
    // A reply to a request we already timed out and retried would otherwise
    // settle the wrong job.
    if (inFlight?.requestId !== message.requestId) return 'ignored';
    finishInFlight(message.image);
    return 'handled';
  }

  if (message.type === 'RENDER_ERROR') {
    if (inFlight?.requestId !== message.requestId) return 'ignored';
    failInFlight(message.reason);
    return 'handled';
  }

  if (message.type === 'SESSION_LOST') {
    unregisterRenderHost();
    return 'session-lost';
  }

  return 'ignored';
}

/** Test seam: drops all state so cases cannot leak into each other. */
export function __resetSharepicRenderForTests(): void {
  if (inFlight !== null) clearTimeout(inFlight.timer);
  if (bootTimer !== null) clearTimeout(bootTimer);
  if (idleTimer !== null) clearTimeout(idleTimer);
  queue = [];
  inFlight = null;
  bootTimer = null;
  idleTimer = null;
  hostReady = false;
  postToPage = null;
  requestCounter = 0;
  demanded = false;
  demandListeners.clear();
}

/** Test seam: what the module currently believes, without exposing the mutable state. */
export function __sharepicRenderState(): {
  queued: number;
  inFlight: string | null;
  hostReady: boolean;
  demanded: boolean;
} {
  return {
    queued: queue.length,
    inFlight: inFlight?.job.key ?? null,
    hostReady,
    demanded,
  };
}
