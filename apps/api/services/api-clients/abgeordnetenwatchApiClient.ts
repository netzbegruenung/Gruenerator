/**
 * AbgeordnetenwatchApiClient
 *
 * Thin, precision-first client for the Abgeordnetenwatch API (German MPs:
 * politicians, mandates, roll-call votes, Nebentätigkeiten). The API is public
 * (CC0, no key) but rate-limited to 30 req/min and has NO aggregate endpoints,
 * so this client follows two hard rules:
 *
 *  1. Every request is filtered server-side and bounded with an explicit
 *     `range_end` — we never pull unfiltered lists.
 *  2. Every response is trimmed to a minimal DTO before it leaves the client,
 *     and roll-call tallies are aggregated here (fetch ≤1000 votes, return
 *     four counts + per-fraction breakdown) so raw vote rows never reach the
 *     LLM context.
 *
 * Results are cached in Redis (short TTL) to respect the fair-use limit and
 * dedupe identical asks. Mirrors the axios + SSRF-factory pattern of the other
 * clients in this directory (see nextcloudApiClient.ts / oparlApiClient.ts).
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { validateUrlForFetch } from '../../utils/validation/urlSecurity.js';

import {
  rawListEnvelope,
  rawSingleEnvelope,
  rawPoliticianSchema,
  rawMandateSchema,
  rawVoteSchema,
  rawSideJobSchema,
  rawPollSchema,
  awPoliticianSchema,
  awMandateSchema,
  awVoteSchema,
  awSideJobSchema,
  awPollSummarySchema,
  awPollTallySchema,
  type AwPolitician,
  type AwMandate,
  type AwVote,
  type AwSideJob,
  type AwPollSummary,
  type AwPollTally,
} from './schemas/abgeordnetenwatch.js';

const log = createLogger('abgeordnetenwatch');

const CACHE_TTL_SECONDS = 600; // 10 min — MP data changes slowly; respects 30 req/min.
const MAX_RETRIES = 2; // chat is latency-sensitive; fail fast rather than block on 429.
const KNOWN_VOTES = ['yes', 'no', 'abstain', 'no_show'] as const;
type VoteCounts = { yes: number; no: number; abstain: number; no_show: number };

function stripHtml(html: string, max = 280): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function emptyCounts(): VoteCounts {
  return { yes: 0, no: 0, abstain: 0, no_show: 0 };
}

export class AbgeordnetenwatchApiClient {
  private readonly baseUrl: string;
  private readonly client: AxiosInstance;

  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.client = axios.create({
      timeout: 15000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Gruenerator/1.0 (+https://gruenerator.eu)',
      },
    });
  }

  /**
   * SSRF-safe async factory. Validates the (config-controlled) base URL once.
   */
  static async create(
    baseUrl: string = env.ABGEORDNETENWATCH_BASE_URL
  ): Promise<AbgeordnetenwatchApiClient> {
    const check = await validateUrlForFetch(baseUrl, { allowedProtocols: ['https:'] });
    if (!check.isValid) {
      throw new Error(`Abgeordnetenwatch base URL failed SSRF validation: ${check.error}`);
    }
    return new AbgeordnetenwatchApiClient(baseUrl);
  }

  // ── low-level fetch with 429/5xx backoff ──────────────────────────────────
  private buildQuery(params: Record<string, string | number>): string {
    // Keys carry literal filter operators (e.g. `label[cn]`); only encode values.
    const q = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    return q ? `?${q}` : '';
  }

  private async requestRaw(
    path: string,
    params: Record<string, string | number>
  ): Promise<unknown> {
    const url = `${this.baseUrl}/${path}${this.buildQuery(params)}`;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.client.get(url);
        return res.data;
      } catch (error) {
        const err = error as AxiosError;
        const status = err.response?.status;
        const transient = !err.response || status === 429 || (status ?? 0) >= 500;
        if (transient && attempt < MAX_RETRIES) {
          const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s
          log.warn(
            `[abgeordnetenwatch] ${status ?? 'network'} on ${path}, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw error;
      }
    }
  }

  private async fetchList<I extends z.ZodTypeAny>(
    path: string,
    params: Record<string, string | number>,
    itemSchema: I
  ): Promise<{ items: z.infer<I>[]; total: number }> {
    const raw = await this.requestRaw(path, params);
    const parsed = rawListEnvelope(itemSchema).safeParse(raw);
    if (!parsed.success) {
      log.warn(`[abgeordnetenwatch] list parse failed for ${path}: ${parsed.error.message}`);
      return { items: [], total: 0 };
    }
    return {
      items: parsed.data.data,
      total: parsed.data.meta?.result?.total ?? parsed.data.data.length,
    };
  }

  /** Cache-aside around a trimmed-DTO producer. Cache misses never throw. */
  private async cached<S extends z.ZodTypeAny>(
    key: string,
    schema: S,
    produce: () => Promise<z.infer<S>>
  ): Promise<z.infer<S>> {
    const hit = await getCachedJson(key, schema);
    if (hit !== null) return hit;
    const fresh = await produce();
    await setCachedJson(key, fresh, CACHE_TTL_SECONDS);
    return fresh;
  }

  // ── public, precision-first methods (all return trimmed DTOs) ─────────────

  /** Resolve a name to candidate politicians (CONTAINS match on the full label). */
  async searchPoliticians(name: string, limit = 5): Promise<AwPolitician[]> {
    const q = name.trim();
    if (!q) return [];
    return this.cached(
      `aw:pol:${q.toLowerCase()}:${limit}`,
      z.array(awPoliticianSchema),
      async () => {
        const { items } = await this.fetchList(
          'politicians',
          { 'label[cn]': q, range_end: limit },
          rawPoliticianSchema
        );
        return items.map((p) => ({
          id: p.id,
          name: p.label ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          party: p.party?.label ?? null,
          url:
            p.abgeordnetenwatch_url ??
            `https://www.abgeordnetenwatch.de/api/v2/politicians/${p.id}`,
        }));
      }
    );
  }

  /** Newest mandate for a politician — the join key for votes and side-jobs. */
  async getCurrentMandate(politicianId: number): Promise<AwMandate | null> {
    return this.cached(`aw:mandate:${politicianId}`, awMandateSchema.nullable(), async () => {
      const { items } = await this.fetchList(
        'candidacies-mandates',
        { politician: politicianId, sort_by: 'id', sort_direction: 'desc', range_end: 5 },
        rawMandateSchema
      );
      const mandate = items.find((m) => m.type === 'mandate') ?? items[0];
      if (!mandate) return null;
      return {
        mandateId: mandate.id,
        politicianId,
        politicianName: mandate.politician?.label ?? '',
        parliamentPeriod: mandate.parliament_period?.label ?? '',
        fraction: mandate.fraction_membership?.[0]?.fraction?.label ?? null,
      };
    });
  }

  /** Recent votes for a mandate, optionally pinned to a single poll. */
  async getVotes(opts: { mandateId: number; pollId?: number; limit?: number }): Promise<AwVote[]> {
    const { mandateId, pollId, limit = 15 } = opts;
    const params: Record<string, string | number> = {
      mandate: mandateId,
      sort_by: 'id',
      sort_direction: 'desc',
      range_end: limit,
    };
    if (pollId) params.poll = pollId;
    return this.cached(
      `aw:votes:${mandateId}:${pollId ?? 'recent'}:${limit}`,
      z.array(awVoteSchema),
      async () => {
        const { items } = await this.fetchList('votes', params, rawVoteSchema);
        return items.map((v) => ({
          pollId: v.poll?.id ?? 0,
          pollLabel: v.poll?.label ?? '',
          vote: v.vote ?? 'unknown',
          fraction: v.fraction?.label ?? null,
          url: v.poll?.abgeordnetenwatch_url ?? '',
        }));
      }
    );
  }

  /** Side-jobs for a mandate, highest declared income first. */
  async getSideJobs(mandateId: number, limit = 10): Promise<AwSideJob[]> {
    return this.cached(`aw:sidejobs:${mandateId}:${limit}`, z.array(awSideJobSchema), async () => {
      const { items } = await this.fetchList(
        'sidejobs',
        { mandates: mandateId, sort_by: 'income', sort_direction: 'desc', range_end: limit },
        rawSideJobSchema
      );
      return items.map((s) => ({
        label: s.label ?? '',
        organization: s.sidejob_organization?.label ?? null,
        income: s.income ?? null,
        incomeLevel: s.income_level != null ? Number.parseInt(s.income_level, 10) || null : null,
        interval: s.interval ?? null,
        year: s.job_title_extra ?? null,
        topics: (s.field_topics ?? []).map((t) => t.label ?? '').filter(Boolean),
      }));
    });
  }

  /** Find polls by keyword and/or policy-area topic id. */
  async searchPolls(opts: {
    keyword?: string;
    topicId?: number;
    limit?: number;
  }): Promise<AwPollSummary[]> {
    const { keyword, topicId, limit = 8 } = opts;
    if (!keyword && !topicId) return [];
    const params: Record<string, string | number> = {
      sort_by: 'id',
      sort_direction: 'desc',
      range_end: limit,
    };
    if (keyword) params['label[cn]'] = keyword.trim();
    if (topicId) params.field_topics = topicId;
    const key = `aw:polls:${keyword?.toLowerCase() ?? ''}:${topicId ?? ''}:${limit}`;
    return this.cached(key, z.array(awPollSummarySchema), async () => {
      const { items } = await this.fetchList('polls', params, rawPollSchema);
      return items.map((p) => ({
        pollId: p.id,
        label: p.label ?? '',
        date: p.field_poll_date ?? null,
        accepted: p.field_accepted ?? null,
        topics: (p.field_topics ?? []).map((t) => t.label ?? '').filter(Boolean),
        intro: p.field_intro ? stripHtml(p.field_intro) : null,
        url: p.abgeordnetenwatch_url ?? '',
      }));
    });
  }

  /**
   * Roll-call tally for a poll. The API has no aggregate endpoint, so we fetch
   * every vote (≤1000) and count here — returning only the aggregate, never the
   * raw rows. This is the single "fetch-wide-return-narrow" call in the client.
   */
  async getPollTally(pollId: number): Promise<AwPollTally | null> {
    return this.cached(`aw:tally:${pollId}`, awPollTallySchema.nullable(), async () => {
      const [pollRaw, votesResult] = await Promise.all([
        this.requestRaw(`polls/${pollId}`, {}),
        this.fetchList('votes', { poll: pollId, range_end: 1000 }, rawVoteSchema),
      ]);
      const poll = rawSingleEnvelope(rawPollSchema).safeParse(pollRaw);
      const meta = poll.success ? poll.data.data : null;

      const total = emptyCounts();
      const fractions = new Map<string, VoteCounts>();
      for (const v of votesResult.items) {
        const vote = (v.vote ?? '') as (typeof KNOWN_VOTES)[number];
        if (!KNOWN_VOTES.includes(vote)) continue;
        total[vote] += 1;
        const fracName = v.fraction?.label ?? 'fraktionslos';
        const frac = fractions.get(fracName) ?? emptyCounts();
        frac[vote] += 1;
        fractions.set(fracName, frac);
      }

      return {
        pollId,
        label: meta?.label ?? '',
        date: meta?.field_poll_date ?? null,
        accepted: meta?.field_accepted ?? null,
        total,
        byFraction: [...fractions.entries()]
          .map(([fraction, c]) => ({ fraction, ...c }))
          .sort((a, b) => b.yes + b.no - (a.yes + a.no)),
        url: meta?.abgeordnetenwatch_url ?? '',
      };
    });
  }
}

let clientPromise: Promise<AbgeordnetenwatchApiClient> | null = null;

/** Lazy singleton — the SSRF check runs once, then the instance is reused. */
export function getAbgeordnetenwatchClient(): Promise<AbgeordnetenwatchApiClient> {
  if (!clientPromise) clientPromise = AbgeordnetenwatchApiClient.create();
  return clientPromise;
}
