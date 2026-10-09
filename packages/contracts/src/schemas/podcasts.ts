/**
 * Podcasts: a chat or notebook answer retold as a two-voice conversation
 * (apps/api/services/podcasts/). Speaker `a` hosts and asks, `b` explains.
 */
import { z } from 'zod';

import { ttsVoiceIdSchema } from './voice.js';
import { SPEECH_MAX_TEXT_CHARS } from './voiceLimits.js';

export const PODCAST_MIN_TURNS = 6;
export const PODCAST_MAX_TURNS = 40;
export const PODCAST_MAX_TURN_CHARS = 600;

export const podcastSpeakerSchema = z.enum(['a', 'b']);
export type PodcastSpeaker = z.infer<typeof podcastSpeakerSchema>;

export const podcastTurnSchema = z.object({
  speaker: podcastSpeakerSchema,
  text: z.string().min(1),
});
export type PodcastTurn = z.infer<typeof podcastTurnSchema>;

/** What the LLM drafts. Lengths are fitted afterwards, not rejected. */
export const podcastScriptDraftSchema = z.object({
  title: z.string().min(1).describe('Kurzer Titel der Folge, höchstens acht Wörter'),
  turns: z.array(podcastTurnSchema).min(PODCAST_MIN_TURNS),
});
export type PodcastScriptDraft = z.infer<typeof podcastScriptDraftSchema>;

export const podcastScriptSchema = z.object({
  turns: z.array(podcastTurnSchema).min(1).max(PODCAST_MAX_TURNS),
});
export type PodcastScript = z.infer<typeof podcastScriptSchema>;

export const podcastStatusSchema = z.enum(['queued', 'scripting', 'voicing', 'ready', 'failed']);
export type PodcastStatus = z.infer<typeof podcastStatusSchema>;

export const createPodcastBodySchema = z.object({
  text: z.string().trim().min(80).max(SPEECH_MAX_TEXT_CHARS),
  title: z.string().trim().max(200).optional(),
});
export type CreatePodcastBody = z.infer<typeof createPodcastBodySchema>;

export const createPodcastResponseSchema = z.object({
  id: z.string().uuid(),
  /** Stable key of the page URL `/podcast/<slug>-<suffix>`. */
  slugSuffix: z.string(),
});

export const podcastDtoSchema = z.object({
  id: z.string().uuid(),
  slugSuffix: z.string(),
  title: z.string(),
  status: podcastStatusSchema,
  /** Set when `failed` — a sentence for the user, never a stack trace. */
  error: z.string().nullable(),
  script: podcastScriptSchema.nullable(),
  durationSeconds: z.number().nullable(),
  /** The Mediathek audio; null until ready, and again once it was deleted there. */
  mediaId: z.string().uuid().nullable(),
  shareToken: z.string().nullable(),
  voices: z.object({ a: ttsVoiceIdSchema, b: ttsVoiceIdSchema }),
  createdAt: z.string(),
});
export type PodcastDto = z.infer<typeof podcastDtoSchema>;

export const podcastErrorSchema = z.object({ error: z.string() });
