/**
 * Zod schemas for the nuudel polls the Grünerator created for a person on
 * nuudel.digitalcourage.de (settings → Umfragen). Read from our own table;
 * nothing here calls nuudel.
 */
import { z } from 'zod';

export const nuudelPollKindSchema = z.enum(['date', 'classic']);
export type NuudelPollKind = z.infer<typeof nuudelPollKindSchema>;

export const nuudelPollSchema = z.object({
  id: z.string(),
  kind: nuudelPollKindSchema,
  title: z.string(),
  /** Participation link, the one to share. */
  pollUrl: z.string(),
  /** Admin link: edit, export, delete. The only credential for the poll — the owner's alone. */
  adminUrl: z.string(),
  createdAt: z.string(),
});
export type NuudelPoll = z.infer<typeof nuudelPollSchema>;

export const nuudelPollListResponseSchema = z.object({
  /** Whether new polls can be created (not switched off via `NUUDEL_URL`). */
  enabled: z.boolean(),
  /** How many polls a person may have the Grünerator create per 24 hours. */
  limitPerDay: z.number(),
  polls: z.array(nuudelPollSchema),
});
export type NuudelPollListResponse = z.infer<typeof nuudelPollListResponseSchema>;

export const nuudelPollErrorSchema = z.object({ error: z.string() });
