/**
 * Zod schemas for the server render lane of the video editor
 * (`/api/video-render`): the editor hands a project over, a render service
 * behind the API turns it into an MP4. The API is the trust boundary, so the
 * body is checked here, including where its media may come from.
 */
import { z } from 'zod';

/** Largest project the lane takes: ten minutes at 30 fps. */
export const VIDEO_RENDER_MAX_FRAMES = 30 * 60 * 10;
export const VIDEO_RENDER_MAX_EDGE = 4096;
export const VIDEO_RENDER_MAX_OVERLAYS = 500;
/** Serialised size of `overlays`. A project is text and references, not media. */
export const VIDEO_RENDER_MAX_BODY_BYTES = 5 * 1024 * 1024;

/** Fields of an overlay that hold a media address. */
const MEDIA_URL_KEYS = new Set(['src', 'thumbnail', 'poster', 'file', 'url']);
const ALLOWED_EXTERNAL_HOSTS = new Set(['images.unsplash.com']);

/**
 * Media is addressed relative to the Grünerator (`/api/share/<token>/stream`),
 * or by data URL, or on the one stock-photo host the editor offers. Anything
 * else would make the render service fetch an address the user picked.
 */
export function isAllowedMediaUrl(value: string): boolean {
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  if (value.startsWith('data:')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(url.hostname);
  } catch {
    // Not a URL at all (a bare name): the renderer treats it as relative too.
    return !/^[a-z][a-z0-9+.-]*:/i.test(value);
  }
}

/** First disallowed media address in the tree, or null. */
export function findForbiddenMediaUrl(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenMediaUrl(item);
      if (found !== null) return found;
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (MEDIA_URL_KEYS.has(key) && typeof item === 'string') {
        if (!isAllowedMediaUrl(item)) return item;
      } else {
        const found = findForbiddenMediaUrl(item);
        if (found !== null) return found;
      }
    }
  }
  return null;
}

export const videoRenderBodySchema = z
  .object({
    overlays: z.array(z.record(z.string(), z.unknown())).max(VIDEO_RENDER_MAX_OVERLAYS),
    durationInFrames: z.number().int().min(1).max(VIDEO_RENDER_MAX_FRAMES),
    fps: z.number().int().min(1).max(60),
    width: z.number().int().min(16).max(VIDEO_RENDER_MAX_EDGE),
    height: z.number().int().min(16).max(VIDEO_RENDER_MAX_EDGE),
  })
  .superRefine((body, ctx) => {
    if (JSON.stringify(body.overlays).length > VIDEO_RENDER_MAX_BODY_BYTES) {
      ctx.addIssue({ code: 'custom', path: ['overlays'], message: 'Das Projekt ist zu groß.' });
    }
    if (findForbiddenMediaUrl(body.overlays) !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['overlays'],
        message: 'Das Projekt enthält eine Medien-Adresse, die nicht gerendert werden darf.',
      });
    }
  });
export type VideoRenderBody = z.infer<typeof videoRenderBodySchema>;

export const videoRenderStatusSchema = z.enum(['queued', 'rendering', 'done', 'error']);
export type VideoRenderStatus = z.infer<typeof videoRenderStatusSchema>;

export const videoRenderJobParamsSchema = z.object({ id: z.string().uuid() });

export const videoRenderStartResponseSchema = z.object({ jobId: z.string().uuid() });
export type VideoRenderStartResponse = z.infer<typeof videoRenderStartResponseSchema>;

export const videoRenderStatusResponseSchema = z.object({
  status: videoRenderStatusSchema,
  /** 0..1 */
  progress: z.number().min(0).max(1),
  error: z.string().optional(),
});
export type VideoRenderStatusResponse = z.infer<typeof videoRenderStatusResponseSchema>;

/** The MP4 itself; consumers read the raw response. */
export const videoRenderFileResponseSchema = z.unknown();

export const videoRenderErrorResponseSchema = z.object({ message: z.string() });
