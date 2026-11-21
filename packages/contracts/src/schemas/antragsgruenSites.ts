/**
 * Zod schemas for a person's Antragsgrün sites on antragsgruen.de: created by
 * the Grünerator or connected by the person (settings → Antragsgrün).
 *
 * The list is read from our own table; whether the Grünerator account is still
 * a site admin there is a live check against antragsgruen.de and therefore a
 * separate request, so a slow antragsgruen.de never blocks the list.
 */
import { z } from 'zod';

export const antragsgruenSiteSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Start page of the consultation, e.g. `https://kv-x.antragsgruen.de/kv-x`. */
  url: z.string(),
  /** Where the person removes the Grünerator account (`<url>/admin/users`). */
  usersUrl: z.string(),
  /** `created`: the Grünerator created it; `connected`: the person connected their own site. */
  kind: z.enum(['created', 'connected']),
  createdAt: z.string(),
});
export type AntragsgruenSite = z.infer<typeof antragsgruenSiteSchema>;

export const antragsgruenSiteListResponseSchema = z.object({
  /** Whether new sites can be created here (bot configured, de-DE). */
  enabled: z.boolean(),
  /** Login of the Grünerator account on antragsgruen.de — what the person removes there. */
  botAccount: z.string().nullable(),
  /** How many sites a person may have the Grünerator create. */
  limit: z.number(),
  sites: z.array(antragsgruenSiteSchema),
});
export type AntragsgruenSiteListResponse = z.infer<typeof antragsgruenSiteListResponseSchema>;

/** `unknown`: antragsgruen.de unreachable or the Grünerator login failed. */
export const antragsgruenSiteAccessSchema = z.enum(['admin', 'removed', 'unknown']);
export type AntragsgruenSiteAccess = z.infer<typeof antragsgruenSiteAccessSchema>;

export const antragsgruenSiteAccessResponseSchema = z.object({
  access: z.record(z.string(), antragsgruenSiteAccessSchema),
});

export const antragsgruenSiteConnectBodySchema = z.object({
  /** Address of the site, e.g. `https://kv-x.antragsgruen.de/kmv`. */
  url: z.string().trim().min(1).max(500),
});

export const antragsgruenSiteErrorSchema = z.object({ error: z.string() });
