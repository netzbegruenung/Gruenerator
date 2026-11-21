/**
 * Server render lane: the API keeps the auth and the trust boundary, a separate
 * render service (gruenerator-videoeditor, `npm run render-server`) does the
 * rendering. Jobs live in memory, per person — a restart drops them, and the
 * editor then reports the export as failed.
 */
import { randomUUID } from 'node:crypto';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import type { VideoRenderBody, VideoRenderStatusResponse } from '@gruenerator/contracts';

const log = createLogger('videoRender');

export class VideoRenderUnavailableError extends Error {}
export class VideoRenderNotFoundError extends Error {}
export class VideoRenderNotReadyError extends Error {}
export class VideoRenderBusyError extends Error {}

export const VIDEO_RENDER_UNAVAILABLE =
  'Der Server-Export ist gerade nicht verfügbar. Bitte versuche es später erneut.';
const MAX_ACTIVE_PER_USER = 2;
const KEEP_MS = 2 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

interface Entry {
  userId: string;
  upstreamId: string;
  createdAt: number;
  /** Last status seen; a finished job stops counting against the limit. */
  finished: boolean;
}

const jobs = new Map<string, Entry>();

/** Test seam. */
export function resetVideoRenderJobs(): void {
  jobs.clear();
}

function upstreamBase(): string {
  const configured = env.VIDEO_RENDER_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (env.NODE_ENV === 'development') return 'http://localhost:3050';
  throw new VideoRenderUnavailableError(VIDEO_RENDER_UNAVAILABLE);
}

function mediaBaseUrl(): string {
  return (env.VIDEO_RENDER_MEDIA_BASE_URL?.trim() || `http://127.0.0.1:${env.PORT}`).replace(
    /\/+$/,
    ''
  );
}

async function upstream(path: string, init: RequestInit = {}): Promise<Response> {
  const base = upstreamBase();
  const headers = new Headers(init.headers);
  if (env.VIDEO_RENDER_TOKEN) headers.set('authorization', `Bearer ${env.VIDEO_RENDER_TOKEN}`);
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    log.warn(`render service unreachable: ${error instanceof Error ? error.message : error}`);
    throw new VideoRenderUnavailableError(VIDEO_RENDER_UNAVAILABLE);
  }
}

function own(userId: string, id: string): Entry {
  const entry = jobs.get(id);
  // Someone else's job looks exactly like no job.
  if (!entry || entry.userId !== userId) throw new VideoRenderNotFoundError();
  return entry;
}

export async function startRender(userId: string, body: VideoRenderBody): Promise<string> {
  const now = Date.now();
  for (const [id, entry] of jobs) if (now - entry.createdAt > KEEP_MS) jobs.delete(id);
  const active = [...jobs.values()].filter((e) => e.userId === userId && !e.finished).length;
  if (active >= MAX_ACTIVE_PER_USER) throw new VideoRenderBusyError();

  const res = await upstream('/render', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, mediaBaseUrl: mediaBaseUrl() }),
  });
  if (!res.ok) {
    log.warn(`render service refused the job: ${res.status}`);
    throw new VideoRenderUnavailableError(VIDEO_RENDER_UNAVAILABLE);
  }
  const { jobId } = (await res.json()) as { jobId?: unknown };
  if (typeof jobId !== 'string') throw new VideoRenderUnavailableError(VIDEO_RENDER_UNAVAILABLE);

  const id = randomUUID();
  jobs.set(id, { userId, upstreamId: jobId, createdAt: now, finished: false });
  return id;
}

export async function getRenderStatus(
  userId: string,
  id: string
): Promise<VideoRenderStatusResponse> {
  const entry = own(userId, id);
  const res = await upstream(`/render/${encodeURIComponent(entry.upstreamId)}`);
  if (res.status === 404) {
    // The render service forgot the job (restart, eviction).
    entry.finished = true;
    return { status: 'error', progress: 0, error: 'Der Export ist nicht mehr verfügbar.' };
  }
  if (!res.ok) throw new VideoRenderUnavailableError(VIDEO_RENDER_UNAVAILABLE);
  const data = (await res.json()) as VideoRenderStatusResponse;
  entry.finished = data.status === 'done' || data.status === 'error';
  return {
    status: data.status,
    progress: data.progress,
    ...(data.error && { error: data.error }),
  };
}

/** The upstream MP4 response, to be piped to the client. */
export async function openRenderFile(userId: string, id: string): Promise<Response> {
  const entry = own(userId, id);
  const res = await upstream(`/render/${encodeURIComponent(entry.upstreamId)}/file`);
  if (res.status === 404) throw new VideoRenderNotFoundError();
  if (res.status === 409) throw new VideoRenderNotReadyError();
  if (!res.ok || !res.body) throw new VideoRenderUnavailableError(VIDEO_RENDER_UNAVAILABLE);
  return res;
}
