/**
 * Client for the Bundestag MCP Server
 * Calls the existing bundestag-mcp server at https://mcp.bundestag-wrapped.de
 * instead of directly calling the DIP API
 *
 * Two API surfaces:
 *  - Legacy loose methods (searchPersonen, getPerson, searchDrucksachen,
 *    searchAktivitaeten) return raw DIP records — kept as-is for
 *    NotebookQAService/PersonDetectionService.
 *  - Trimmed chat wrappers (semanticSearch, searchSpeeches, findDrucksache,
 *    searchVorgaenge, searchPersonenTrimmed, searchAktivitaetenTrimmed) parse
 *    into compact LLM-safe DTOs, truncate oversized text at this boundary,
 *    cache in Redis and never throw — the chat SSE stream must degrade, not
 *    fail, when the MCP server misbehaves.
 */

import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import {
  rawResultsEnvelope,
  rawDrucksacheSchema,
  rawSpeechSchema,
  rawSemanticHitSchema,
  rawPersonSchema,
  rawAktivitaetSchema,
  rawVorgangSchema,
  btDrucksacheSchema,
  btSpeechSchema,
  btSemanticHitSchema,
  btPersonSchema,
  btAktivitaetSchema,
  btVorgangSchema,
  cleanDipText,
  parseScore,
  pickLatestWahlperiode,
  type BtDrucksache,
  type BtSpeech,
  type BtSemanticHit,
  type BtPerson,
  type BtAktivitaet,
  type BtVorgang,
} from './schemas.js';

import type {
  PersonSearchParams,
  DrucksachenSearchParams,
  AktivitaetenSearchParams,
  SearchResult,
} from './types.js';

const log = createLogger('bundestag-mcp');

const BUNDESTAG_MCP_URL = env.BUNDESTAG_MCP_URL ?? 'https://mcp.bundestag-wrapped.de';
const REQUEST_TIMEOUT = 30000;
// Chat is latency-sensitive: the enriched service runs up to two sequential
// rounds, so the legacy 30s budget per call would stall the SSE stream.
const CHAT_TIMEOUT_MS = 12000;
const CACHE_TTL_SECONDS = 600; // DIP data changes slowly.

/**
 * Cache-key namespace. Bump whenever a mapper or raw schema changes: `safeList`
 * caches genuine no-results too, so the person-schema bug below had cached
 * `{items: []}` under the old keys — without a new namespace the fix would look
 * like a no-op for a whole TTL after deploy.
 */
const CACHE_NS = 'bt:v2';

/** Current electoral period (21st Bundestag, since 2025). */
export const CURRENT_WAHLPERIODE = 21;

const SPEECH_EXCERPT_MAX = 600; // full speeches run 3–4k chars each
const ABSTRACT_MAX = 400;

/**
 * Result ordering of the two vector-backed tools. The server defaults to
 * `relevance`; recency questions ("worüber hat X zuletzt gesprochen") need
 * `newest`, which we previously never sent — so "zuletzt" returned whatever
 * matched best semantically, often years old.
 */
export type BtSort = 'relevance' | 'newest' | 'oldest';

/**
 * Substantive DIP document types, as accepted by `bundestag_semantic_search`'s
 * `entityTypes` filter.
 *
 * Unfiltered, the semantic layer answers a topic query mostly with the
 * PROCEDURAL paperwork a bill accretes — `Beschluss`, `Empfehlungen`,
 * `Stellungnahme` (none of which the server even lists as a valid filter
 * value). Those records repeat the bill's title verbatim, so a single law fills
 * every slot with near-duplicates, and their `abstract` is null: the reranker
 * then scores four identical titles with no body text to go on. Most of them
 * are BUNDESRAT papers on top of that, which is not what someone asking about
 * the Bundestag wants.
 *
 * Restricting to the types that carry parliamentary substance is what surfaces
 * the Gesetzentwürfe and Anträge instead. If the filter ever over-narrows, the
 * topic path's existing DIP-title-search fallback still catches the empty
 * result — so this cannot make a query go dark.
 */
export const SUBSTANTIVE_ENTITY_TYPES = [
  'Gesetzentwurf',
  'Antrag',
  'Kleine Anfrage',
  'Große Anfrage',
  'Beschlussempfehlung und Bericht',
  'Entschließungsantrag',
  'Unterrichtung',
  'Bericht',
] as const;

/**
 * List result of the trimmed wrappers. `wpFallback` is true when the default
 * current-Wahlperiode filter found nothing and the period-free retry did —
 * the enriched service turns that into a user-visible note.
 */
export interface BtListResult<T> {
  items: T[];
  wpFallback: boolean;
}

const btListResultSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), wpFallback: z.boolean() });

/**
 * MCP JSON-RPC request structure
 */
interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * MCP JSON-RPC response structure
 */
interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: {
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
}

// ── Raw-record → DTO mappers (items that fail minimal requirements drop) ────
function mapDrucksache(raw: z.infer<typeof rawDrucksacheSchema>): BtDrucksache | null {
  const dokumentnummer = raw.dokumentnummer?.trim() ?? '';
  const titel = raw.titel?.trim() ?? '';
  if (!dokumentnummer && !titel) return null;
  return {
    id: raw.id != null ? String(raw.id) : dokumentnummer,
    titel,
    dokumentnummer,
    drucksachetyp: raw.drucksachetyp ?? null,
    wahlperiode: pickLatestWahlperiode(raw.wahlperiode),
    datum: raw.datum ?? null,
    urheber: (raw.urheber ?? [])
      .map((u) => (typeof u === 'string' ? u : (u.titel ?? '')))
      .filter(Boolean),
    pdfUrl: raw.fundstelle?.pdf_url ?? null,
  };
}

function mapSpeech(raw: z.infer<typeof rawSpeechSchema>): BtSpeech | null {
  const text = raw.text?.trim();
  const speaker = raw.speaker?.trim();
  if (!text || !speaker) return null;
  return {
    speaker,
    party: raw.speakerParty ?? null,
    date: raw.datum ?? null,
    excerpt: cleanDipText(text, SPEECH_EXCERPT_MAX),
    protokollNummer: raw.dokumentnummer ?? null,
    wahlperiode: pickLatestWahlperiode(raw.wahlperiode),
    herausgeber: raw.herausgeber ?? null,
    topTitle: raw.topTitle ?? null,
    score: parseScore(raw.score),
  };
}

function mapSemanticHit(raw: z.infer<typeof rawSemanticHitSchema>): BtSemanticHit | null {
  const title = raw.title?.trim();
  if (!title) return null;
  return {
    docType: raw.docType ?? 'dokument',
    docId: raw.docId != null ? String(raw.docId) : '',
    entityType: raw.entityType ?? null,
    title,
    abstract: raw.abstract ? cleanDipText(raw.abstract, ABSTRACT_MAX) : null,
    dokumentnummer: raw.dokumentnummer ?? null,
    date: raw.date ?? null,
    wahlperiode: pickLatestWahlperiode(raw.wahlperiode),
    score: parseScore(raw.score),
  };
}

/**
 * DIP's person `titel` is the full display line ("Katrin Uhlig, MdB, BÜNDNIS
 * 90/DIE GRÜNEN"), NOT an academic prefix — concatenating it with vorname and
 * nachname produced "Katrin Uhlig, MdB, BÜNDNIS 90/DIE GRÜNEN Katrin Uhlig".
 * That string was then handed to `bundestag_search_speeches` as the `speaker`
 * filter, which matches on the plain name and so never hit. Build the name from
 * vorname+nachname and fall back to the first segment of `titel`.
 */
function mapPerson(raw: z.infer<typeof rawPersonSchema>): BtPerson | null {
  const name =
    [raw.vorname, raw.nachname]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ') ||
    (raw.titel?.split(',')[0]?.trim() ?? '');
  if (!name) return null;
  return {
    id: String(raw.id),
    name,
    fraktion: Array.isArray(raw.fraktion) ? (raw.fraktion[0] ?? null) : (raw.fraktion ?? null),
    wahlperiode: pickLatestWahlperiode(raw.wahlperiode),
  };
}

/**
 * The activity's SUBJECT is `vorgangsbezug[0].titel`; the record's own `titel`
 * is the MP's display line and therefore identical on every row — an
 * activity list built from it reads as the same name eight times and tells the
 * model nothing. Fall back to `titel` only when there is no Vorgang reference.
 */
function mapAktivitaet(raw: z.infer<typeof rawAktivitaetSchema>): BtAktivitaet | null {
  const subject = raw.vorgangsbezug?.find((v) => v.titel?.trim())?.titel?.trim();
  const titel = subject || raw.titel?.trim();
  if (!titel) return null;
  return {
    titel,
    typ: raw.aktivitaetsart ?? null,
    datum: raw.datum ?? null,
    dokumentnummer: raw.dokumentnummer ?? null,
  };
}

function mapVorgang(raw: z.infer<typeof rawVorgangSchema>): BtVorgang | null {
  const titel = raw.titel?.trim();
  if (!titel) return null;
  return {
    id: String(raw.id),
    titel,
    vorgangstyp: raw.vorgangstyp ?? null,
    beratungsstand: raw.beratungsstand ?? null,
    datum: raw.datum ?? null,
  };
}

/**
 * Handshake-less by design: we POST `tools/call` straight at the remote without
 * an `initialize` round-trip and without a session id.
 *
 * That is deliberate, not an oversight. mcp.bundestag-wrapped.de is our own
 * server and runs stateless (like mcp.gruenerator.eu), the SDK's HTTP transport
 * doesn't gate requests on a prior handshake, and spec revision 2026-07-28
 * removes `initialize` outright — so adding one now would be a round-trip per
 * call that we would delete again. We do send `MCP-Protocol-Version` so the
 * remote can negotiate if it ever starts checking.
 */
class BundestagMCPClient {
  private baseUrl: string;

  constructor(baseUrl: string = BUNDESTAG_MCP_URL) {
    this.baseUrl = baseUrl;
  }

  private async _callTool(
    toolName: string,
    args: Record<string, unknown> = {},
    timeoutMs: number = REQUEST_TIMEOUT
  ): Promise<SearchResult> {
    const url = `${this.baseUrl}/mcp`;

    const body: MCPRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': LATEST_PROTOCOL_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Bundestag MCP error: ${response.status}`);
      }

      const result = (await response.json()) as MCPResponse;

      if (result.error) {
        throw new Error(result.error.message || 'MCP tool call failed');
      }

      // Parse the content from MCP response
      if (result.result?.content?.[0]?.text) {
        const parsed = JSON.parse(result.result.content[0].text) as SearchResult;
        // Normalize: API returns 'results', services expect 'documents'
        if (parsed.results && !parsed.documents) {
          parsed.documents = parsed.results;
        }
        return parsed as SearchResult;
      }

      const fallback: SearchResult = (result.result || {}) as SearchResult;
      return fallback;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Bundestag MCP timeout after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  /**
   * Search for MPs/persons
   * @param params - Search parameters
   * @returns Search results
   */
  async searchPersonen(params: PersonSearchParams = {}): Promise<SearchResult> {
    return this._callTool('bundestag_search_personen', {
      query: params.query,
      fraktion: params.fraktion,
      wahlperiode: params.wahlperiode ?? CURRENT_WAHLPERIODE,
      limit: params.limit || 10,
    });
  }

  /**
   * Get a specific person by ID
   * @param id - Person ID
   * @returns Person details
   */
  async getPerson(id: string | number): Promise<SearchResult> {
    const result = await this._callTool('bundestag_get_person', { id: String(id) });
    // Unlike every list endpoint, `bundestag_get_person` returns the record
    // under `data` — `_callTool` only normalizes `results` → `documents`, so the
    // envelope reached consumers with nothing they could read. That silently
    // emptied EnrichedPersonSearchService's whole profile enrichment
    // (wahlkreis, geburtsdatum, geburtsort, beruf, biografie, vita,
    // wahlperioden are read off this object and were always undefined).
    // Surface the record both flat and as `documents` — callers use both.
    const data = result.data;
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      return { ...result, ...record, documents: [record] };
    }
    return result;
  }

  /**
   * Search Drucksachen (parliamentary documents)
   * @param params - Search parameters
   * @returns Search results
   */
  async searchDrucksachen(params: DrucksachenSearchParams = {}): Promise<SearchResult> {
    return this._callTool('bundestag_search_drucksachen', {
      query: params.query,
      urheber: params.urheber,
      drucksachetyp: params.drucksachetyp,
      wahlperiode: params.wahlperiode ?? CURRENT_WAHLPERIODE,
      limit: params.limit || 20,
    });
  }

  /**
   * Search activities (speeches, questions, etc.)
   * @param params - Search parameters
   * @returns Search results
   */
  async searchAktivitaeten(params: AktivitaetenSearchParams = {}): Promise<SearchResult> {
    return this._callTool('bundestag_search_aktivitaeten', {
      person_id: params.person_id ? String(params.person_id) : undefined,
      aktivitaetsart: params.aktivitaetsart,
      wahlperiode: params.wahlperiode ?? CURRENT_WAHLPERIODE,
      limit: params.limit || 30,
    });
  }

  // ── Trimmed chat wrappers ──────────────────────────────────────────────────

  /**
   * Call an MCP tool and trim each result item into a DTO. Items that fail
   * the (lenient) raw schema are skipped individually so one drifted record
   * never drops a whole result set. In-band server errors (`{error: true}`
   * payloads) throw so they degrade like network failures — and are never
   * mistaken for an empty result set.
   */
  private async fetchTrimmed<R extends z.ZodTypeAny, D>(
    toolName: string,
    args: Record<string, unknown>,
    rawItem: R,
    map: (item: z.infer<R>) => D | null
  ): Promise<D[]> {
    const result = await this._callTool(toolName, args, CHAT_TIMEOUT_MS);
    const envelope = rawResultsEnvelope(z.unknown()).safeParse(result);
    if (!envelope.success) {
      log.warn(`${toolName} envelope parse failed: ${envelope.error.message}`);
      return [];
    }
    if (envelope.data.error) {
      throw new Error(`${toolName} server error: ${envelope.data.message ?? 'unknown'}`);
    }
    const rawItems = envelope.data.results ?? envelope.data.documents ?? [];
    const out: D[] = [];
    for (const raw of rawItems) {
      const item = rawItem.safeParse(raw);
      if (!item.success) continue;
      const dto = map(item.data as z.infer<R>);
      if (dto !== null) out.push(dto);
    }
    return out;
  }

  /**
   * Default to the current Wahlperiode; if that yields nothing and the caller
   * didn't pin a period, retry once across all periods. Errors propagate to
   * `safeList` so failures are never cached as empty results.
   */
  private async withWpFallback<D>(
    fetchAt: (wahlperiode: number | undefined) => Promise<D[]>,
    pinnedWp: number | undefined
  ): Promise<BtListResult<D>> {
    const first = await fetchAt(pinnedWp ?? CURRENT_WAHLPERIODE);
    if (first.length > 0 || pinnedWp != null) return { items: first, wpFallback: false };
    const retry = await fetchAt(undefined);
    return { items: retry, wpFallback: retry.length > 0 };
  }

  /**
   * Cache-aside around a trimmed list producer. Failures return an empty list
   * WITHOUT caching it — only genuine results (including genuine no-results)
   * are stored, so a transient outage can't poison the cache for its TTL.
   */
  private async safeList<S extends z.ZodTypeAny>(
    key: string,
    itemSchema: S,
    produce: () => Promise<BtListResult<z.infer<S>>>
  ): Promise<BtListResult<z.infer<S>>> {
    try {
      const hit = await getCachedJson(key, btListResultSchema(itemSchema));
      if (hit !== null) return hit;
      const fresh = await produce();
      await setCachedJson(key, fresh, CACHE_TTL_SECONDS);
      return fresh;
    } catch (error) {
      log.warn(`${key} failed: ${toError(error).message}`);
      return { items: [], wpFallback: false };
    }
  }

  /** Vector search over DIP metadata (Vorgänge, Drucksachen, …). */
  async semanticSearch(opts: {
    query: string;
    wahlperiode?: number;
    limit?: number;
    sort?: BtSort;
    entityTypes?: readonly string[];
  }): Promise<BtListResult<BtSemanticHit>> {
    const { query, wahlperiode, limit = 6, sort, entityTypes } = opts;
    const typeKey = entityTypes?.length ? entityTypes.join(',') : 'all';
    const key = `${CACHE_NS}:sem:${query.toLowerCase()}:${wahlperiode ?? 'cur'}:${limit}:${sort ?? 'rel'}:${typeKey}`;
    return this.safeList(key, btSemanticHitSchema, () =>
      this.withWpFallback(
        (wp) =>
          this.fetchTrimmed(
            'bundestag_semantic_search',
            {
              query,
              wahlperiode: wp,
              limit,
              sort,
              ...(entityTypes?.length ? { entityTypes: [...entityTypes] } : {}),
            },
            rawSemanticHitSchema,
            mapSemanticHit
          ),
        wahlperiode
      )
    );
  }

  /** Vector search over plenary speech full text; excerpts truncated here. */
  async searchSpeeches(opts: {
    query: string;
    speaker?: string;
    speakerParty?: string;
    wahlperiode?: number;
    limit?: number;
    sort?: BtSort;
  }): Promise<BtListResult<BtSpeech>> {
    const { query, speaker, speakerParty, wahlperiode, limit = 3, sort } = opts;
    const key = `${CACHE_NS}:speech:${query.toLowerCase()}:${speaker?.toLowerCase() ?? ''}:${speakerParty ?? ''}:${wahlperiode ?? 'cur'}:${limit}:${sort ?? 'rel'}`;
    return this.safeList(key, btSpeechSchema, () =>
      this.withWpFallback(
        (wp) =>
          this.fetchTrimmed(
            'bundestag_search_speeches',
            { query, speaker, speakerParty, wahlperiode: wp, limit, sort },
            rawSpeechSchema,
            mapSpeech
          ),
        wahlperiode
      )
    );
  }

  /**
   * Find Drucksachen — by exact dokumentnummer (e.g. "21/123", which pins the
   * period, so no Wahlperiode filter) or by query/urheber/typ.
   */
  async findDrucksache(opts: {
    dokumentnummer?: string;
    query?: string;
    urheber?: string;
    drucksachetyp?: string;
    wahlperiode?: number;
    limit?: number;
  }): Promise<BtListResult<BtDrucksache>> {
    const { dokumentnummer, query, urheber, drucksachetyp, wahlperiode, limit = 5 } = opts;
    const key = `${CACHE_NS}:drs:${dokumentnummer ?? ''}:${query?.toLowerCase() ?? ''}:${urheber?.toLowerCase() ?? ''}:${drucksachetyp ?? ''}:${wahlperiode ?? 'cur'}:${limit}`;
    return this.safeList(key, btDrucksacheSchema, async () => {
      const fetchAt = (wp: number | undefined) =>
        this.fetchTrimmed(
          'bundestag_search_drucksachen',
          {
            dokumentnummer,
            query,
            urheber,
            drucksachetyp,
            wahlperiode: wp,
            limit,
            fields: 'compact',
          },
          rawDrucksacheSchema,
          mapDrucksache
        );
      if (dokumentnummer) {
        return { items: await fetchAt(undefined), wpFallback: false };
      }
      return this.withWpFallback(fetchAt, wahlperiode);
    });
  }

  /** Legislative processes (Vorgänge) matching a query — lifecycle context. */
  async searchVorgaenge(opts: {
    query: string;
    wahlperiode?: number;
    limit?: number;
  }): Promise<BtListResult<BtVorgang>> {
    const { query, wahlperiode, limit = 3 } = opts;
    const key = `${CACHE_NS}:vorgang:${query.toLowerCase()}:${wahlperiode ?? 'cur'}:${limit}`;
    return this.safeList(key, btVorgangSchema, () =>
      this.withWpFallback(
        (wp) =>
          this.fetchTrimmed(
            'bundestag_search_vorgaenge',
            { query, wahlperiode: wp, limit, fields: 'compact' },
            rawVorgangSchema,
            mapVorgang
          ),
        wahlperiode
      )
    );
  }

  /** Resolve a name to MPs — trimmed variant of searchPersonen. */
  async searchPersonenTrimmed(name: string, limit = 5): Promise<BtListResult<BtPerson>> {
    const q = name.trim();
    if (!q) return { items: [], wpFallback: false };
    const key = `${CACHE_NS}:person:${q.toLowerCase()}:${limit}`;
    return this.safeList(key, btPersonSchema, () =>
      this.withWpFallback(
        (wp) =>
          this.fetchTrimmed(
            'bundestag_search_personen',
            { query: q, wahlperiode: wp, limit },
            rawPersonSchema,
            mapPerson
          ),
        undefined
      )
    );
  }

  /** Activities of an MP — trimmed variant of searchAktivitaeten. */
  async searchAktivitaetenTrimmed(
    personId: string,
    limit = 8
  ): Promise<BtListResult<BtAktivitaet>> {
    const key = `${CACHE_NS}:akt:${personId}:${limit}`;
    return this.safeList(key, btAktivitaetSchema, () =>
      this.withWpFallback(
        (wp) =>
          this.fetchTrimmed(
            'bundestag_search_aktivitaeten',
            { person_id: personId, wahlperiode: wp, limit },
            rawAktivitaetSchema,
            mapAktivitaet
          ),
        undefined
      )
    );
  }
}

// Singleton instance
let clientInstance: BundestagMCPClient | null = null;

function getBundestagMCPClient(): BundestagMCPClient {
  if (!clientInstance) {
    clientInstance = new BundestagMCPClient();
  }
  return clientInstance;
}

export { BundestagMCPClient, getBundestagMCPClient };
