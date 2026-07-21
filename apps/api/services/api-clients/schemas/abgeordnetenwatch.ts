/**
 * Zod schemas for the Abgeordnetenwatch API (https://www.abgeordnetenwatch.de/api/v2).
 *
 * Two layers:
 *  - RAW schemas model the (deeply nested) API responses. They are lenient —
 *    only the fields we consume are declared and almost everything is optional,
 *    so upstream shape drift degrades gracefully instead of throwing.
 *  - DTO schemas are the trimmed, minimal shapes that leave the client and reach
 *    the LLM. They are the source of truth for TS types (via z.infer) and are
 *    what we cache in Redis. Keeping them small is the whole point: the API
 *    returns ~1–2 KB per nested entity, the DTOs are ~100–200 B.
 */
import { z } from 'zod';

// ── Raw API envelopes ──────────────────────────────────────────────────────
const rawMetaSchema = z
  .object({
    result: z
      .object({
        count: z.number().optional(),
        total: z.number().optional(),
      })
      .optional(),
  })
  .optional();

export const rawListEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ meta: rawMetaSchema, data: z.array(item) });

export const rawSingleEnvelope = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ meta: rawMetaSchema, data: item });

// ── Raw entities (only consumed fields; tolerate anything else) ─────────────
const rawLabelRef = z.object({ id: z.number().optional(), label: z.string().optional() }).nullish();

export const rawPoliticianSchema = z.object({
  id: z.number(),
  label: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  party: z.object({ label: z.string().optional() }).nullish(),
  abgeordnetenwatch_url: z.string().optional(),
});

export const rawMandateSchema = z.object({
  id: z.number(),
  label: z.string().optional(),
  type: z.string().optional(),
  politician: z.object({ id: z.number().optional(), label: z.string().optional() }).nullish(),
  parliament_period: rawLabelRef,
  fraction_membership: z
    .array(z.object({ fraction: z.object({ label: z.string().optional() }).nullish() }))
    .nullish(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
});

export const rawVoteSchema = z.object({
  id: z.number(),
  vote: z.string().optional(),
  mandate: rawLabelRef,
  poll: z
    .object({
      id: z.number(),
      label: z.string().optional(),
      abgeordnetenwatch_url: z.string().optional(),
    })
    .nullish(),
  fraction: z.object({ label: z.string().optional() }).nullish(),
});

export const rawSideJobSchema = z.object({
  id: z.number(),
  label: z.string().optional(),
  income: z.number().nullish(),
  income_level: z.string().nullish(),
  interval: z.string().nullish(),
  job_title_extra: z.string().nullish(),
  sidejob_organization: z.object({ label: z.string().optional() }).nullish(),
  field_topics: z.array(z.object({ label: z.string().optional() })).nullish(),
});

export const rawPollSchema = z.object({
  id: z.number(),
  label: z.string().optional(),
  field_poll_date: z.string().nullish(),
  field_accepted: z.boolean().nullish(),
  field_topics: z.array(z.object({ label: z.string().optional() })).nullish(),
  field_intro: z.string().nullish(),
  abgeordnetenwatch_url: z.string().optional(),
});

// ── Trimmed DTOs (leave the client; cached; source of truth for TS types) ───
export const awPoliticianSchema = z.object({
  id: z.number(),
  name: z.string(),
  party: z.string().nullable(),
  url: z.string(),
});
export type AwPolitician = z.infer<typeof awPoliticianSchema>;

export const awMandateSchema = z.object({
  mandateId: z.number(),
  politicianId: z.number(),
  politicianName: z.string(),
  parliamentPeriod: z.string(),
  fraction: z.string().nullable(),
});
export type AwMandate = z.infer<typeof awMandateSchema>;

export const awVoteSchema = z.object({
  pollId: z.number(),
  pollLabel: z.string(),
  vote: z.string(),
  fraction: z.string().nullable(),
  url: z.string(),
});
export type AwVote = z.infer<typeof awVoteSchema>;

export const awSideJobSchema = z.object({
  label: z.string(),
  organization: z.string().nullable(),
  income: z.number().nullable(),
  incomeLevel: z.number().nullable(),
  interval: z.string().nullable(),
  year: z.string().nullable(),
  topics: z.array(z.string()),
});
export type AwSideJob = z.infer<typeof awSideJobSchema>;

export const awPollSummarySchema = z.object({
  pollId: z.number(),
  label: z.string(),
  date: z.string().nullable(),
  accepted: z.boolean().nullable(),
  topics: z.array(z.string()),
  intro: z.string().nullable(),
  url: z.string(),
});
export type AwPollSummary = z.infer<typeof awPollSummarySchema>;

const awTallyCountsSchema = z.object({
  yes: z.number(),
  no: z.number(),
  abstain: z.number(),
  no_show: z.number(),
});

export const awPollTallySchema = z.object({
  pollId: z.number(),
  label: z.string(),
  date: z.string().nullable(),
  accepted: z.boolean().nullable(),
  total: awTallyCountsSchema,
  byFraction: z.array(awTallyCountsSchema.extend({ fraction: z.string() })),
  url: z.string(),
});
export type AwPollTally = z.infer<typeof awPollTallySchema>;
