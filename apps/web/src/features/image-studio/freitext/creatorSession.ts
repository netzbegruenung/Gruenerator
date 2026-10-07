import {
  sharepicOwnPhotoSchema,
  sharepicPhotoAttributionSchema,
  sharepicPhotoUrlSchema,
  sharepicSpecSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

/**
 * One slot for the whole browser: the next account's session overwrites it,
 * and a session is only handed to the account that wrote it.
 */
const STORAGE_KEY = 'gruenerator-sharepic-creator-v1';

const sessionSchema = z.object({
  userId: z.string().min(1),
  messages: z
    .array(
      z.object({
        id: z.number().int(),
        role: z.enum(['user', 'assistant']),
        text: z.string(),
        error: z.boolean().optional(),
      })
    )
    .min(1),
  /** What is on screen: the draft with `choice` applied. */
  spec: sharepicSpecSchema.nullable(),
  /** The draft as the AI left it. Absent in sessions saved before design variations: `spec`. */
  base: sharepicSpecSchema.nullable().optional(),
  choice: z.record(z.string(), z.string()).optional(),
  attributions: z.array(sharepicPhotoAttributionSchema.nullable()),
  brief: z.string(),
  photos: z.array(sharepicOwnPhotoSchema.extend({ name: z.string(), url: sharepicPhotoUrlSchema })),
});

/** What rebuilds the creator chat after a reload; previews are rendered again from the spec. */
export type CreatorSession = z.infer<typeof sessionSchema>;

export function loadCreatorSession(userId: string): CreatorSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = sessionSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.userId === userId ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveCreatorSession(session: CreatorSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* quota or blocked storage — the session stays in memory */
  }
}

export function clearCreatorSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* blocked storage */
  }
}
