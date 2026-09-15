/**
 * DeepL client — text translation, document translation, languages and the
 * v3 multilingual glossary. Native `fetch`, no `deepl-node`: the house style
 * for paid external APIs (Linkup, GreenPT) keeps retry policy, error
 * semantics and cost accounting in our own hands, and the whole surface we
 * use is ~10 endpoints.
 *
 * Retry policy follows DeepL's own guidance (developers.deepl.com, error
 * handling): 429 / 529 / 5xx and network errors are retried with backoff,
 * **456 (quota exhausted) and 400 never**. A 456 additionally parks the
 * service for an hour (`quotaExhaustedUntil`) so a drained account does not
 * turn every translation into a full network round-trip that fails anyway.
 *
 * `downloadDocument` is the one call that is NEVER retried: DeepL deletes a
 * translated document the moment it is fetched, so a retry after a partial
 * read would 404 against a file the user already paid for. Callers buffer the
 * result to disk before serving it (see routes/translation/documentJobs.ts).
 *
 * Gated by env.DEEPL_API_KEY presence — getDeepLService() returns null when
 * the key is unset, and callers treat that as "feature off".
 */
import { z } from 'zod';

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { CircuitBreaker, withRetry } from '../search/searchRetryStrategy.js';

const log = createLogger('DeepL');

const DEEPL_TIMEOUT_MS = 30_000;
const DEEPL_DOCUMENT_TIMEOUT_MS = 90_000;
const QUOTA_PAUSE_MS = 60 * 60 * 1000;

const LANGUAGES_CACHE_KEY = 'deepl:languages:v1';
const LANGUAGES_STALE_CACHE_KEY = 'deepl:languages:stale:v1';
const LANGUAGES_TTL_SECONDS = 60 * 60;
const LANGUAGES_STALE_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Three consecutive retryable failures open the breaker for two minutes. Only
 * timeouts, network errors, 429/529 and 5xx count — a 400 or 456 is either
 * our own bug or a billing state, and neither says anything about whether the
 * provider is reachable.
 */
const deeplCircuit = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeMs: 2 * 60 * 1000,
  label: 'DeepL',
});

export class DeepLError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
    readonly traceId: string | null = null
  ) {
    super(message);
    this.name = 'DeepLError';
  }

  /** 429 / 529 / 5xx / network — worth another attempt after a pause. */
  get retryable(): boolean {
    if (this.status === null) return true;
    return this.status === 429 || this.status === 529 || this.status >= 500;
  }

  get quotaExhausted(): boolean {
    return this.status === 456;
  }
}

export type DeepLFormality = 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';

export interface DeepLLanguage {
  /** BCP 47 as DeepL reports it, e.g. `de`, `en-GB`. */
  code: string;
  name: string;
  usableAsSource: boolean;
  usableAsTarget: boolean;
  formality: boolean;
  glossary: boolean;
}

export interface DeepLTranslation {
  text: string;
  /** Lower-cased root language DeepL detected, e.g. `en`. */
  detectedSourceLang: string;
  billedCharacters: number;
}

export type DeepLDocumentStatus = 'queued' | 'translating' | 'done' | 'error';

export interface DeepLDocumentHandle {
  documentId: string;
  documentKey: string;
}

export interface DeepLDocumentState {
  status: DeepLDocumentStatus;
  secondsRemaining: number | null;
  billedCharacters: number | null;
  message: string | null;
}

export interface DeepLGlossaryDictionary {
  sourceLang: string;
  targetLang: string;
  entryCount: number;
}

export interface DeepLGlossary {
  glossaryId: string;
  name: string;
  dictionaries: DeepLGlossaryDictionary[];
  creationTime: string;
}

export interface GlossaryEntry {
  source: string;
  target: string;
}

const translateResponseSchema = z.object({
  translations: z.array(
    z.object({
      detected_source_language: z.string(),
      text: z.string(),
      billed_characters: z.number().optional(),
    })
  ),
});

const languagesResponseSchema = z.array(
  z.object({
    lang: z.string(),
    name: z.string(),
    usable_as_source: z.boolean(),
    usable_as_target: z.boolean(),
    features: z.record(z.unknown()).optional(),
  })
);

const languagesCacheSchema = z.array(
  z.object({
    code: z.string(),
    name: z.string(),
    usableAsSource: z.boolean(),
    usableAsTarget: z.boolean(),
    formality: z.boolean(),
    glossary: z.boolean(),
  })
);

const documentHandleSchema = z.object({
  document_id: z.string(),
  document_key: z.string(),
});

const documentStatusSchema = z.object({
  status: z.enum(['queued', 'translating', 'done', 'error']),
  seconds_remaining: z.number().optional(),
  billed_characters: z.number().optional(),
  message: z.string().optional(),
  error_message: z.string().optional(),
});

const glossarySchema = z.object({
  glossary_id: z.string(),
  name: z.string(),
  dictionaries: z.array(
    z.object({
      source_lang: z.string(),
      target_lang: z.string(),
      entry_count: z.number(),
    })
  ),
  creation_time: z.string(),
});

const glossaryListSchema = z.union([
  z.object({ glossaries: z.array(glossarySchema) }),
  z.array(glossarySchema),
]);

const dictionaryEntriesSchema = z.union([
  z.object({ dictionaries: z.array(z.object({ entries: z.string() })).min(1) }),
  z.object({ entries: z.string() }),
]);

/** `en-GB` → `en`. Glossaries and detection work on root languages. */
export function rootLang(code: string): string {
  return code.split('-')[0]!.toLowerCase();
}

/** Free-plan keys carry a `:fx` suffix and live on a different host. */
export function baseUrlForKey(apiKey: string): string {
  return apiKey.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
}

export function parseTsvEntries(tsv: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const source = line.slice(0, tab).trim();
    const target = line.slice(tab + 1).trim();
    if (source && target) entries.push({ source, target });
  }
  return entries;
}

export function buildTsvEntries(entries: readonly GlossaryEntry[]): string {
  return entries.map((e) => `${e.source}\t${e.target}`).join('\n');
}

function toGlossary(raw: z.infer<typeof glossarySchema>): DeepLGlossary {
  return {
    glossaryId: raw.glossary_id,
    name: raw.name,
    dictionaries: raw.dictionaries.map((d) => ({
      sourceLang: d.source_lang.toLowerCase(),
      targetLang: d.target_lang.toLowerCase(),
      entryCount: d.entry_count,
    })),
    creationTime: raw.creation_time,
  };
}

export class DeepLService {
  private quotaExhaustedUntil = 0;
  readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl?: string
  ) {
    this.baseUrl = baseUrl ?? baseUrlForKey(apiKey);
  }

  async translateText(params: {
    text: readonly string[];
    targetLang: string;
    sourceLang?: string | null;
    formality?: DeepLFormality | null;
    glossaryId?: string | null;
  }): Promise<DeepLTranslation[]> {
    const body: Record<string, unknown> = {
      text: [...params.text],
      target_lang: params.targetLang,
      show_billed_characters: true,
    };
    if (params.sourceLang) body.source_lang = params.sourceLang;
    if (params.formality && params.formality !== 'default') body.formality = params.formality;
    if (params.glossaryId) body.glossary_id = params.glossaryId;

    const data = await this.json(
      '/v2/translate',
      { method: 'POST', body: JSON.stringify(body), json: true },
      translateResponseSchema
    );
    return data.translations.map((t) => ({
      text: t.text,
      detectedSourceLang: rootLang(t.detected_source_language),
      billedCharacters: t.billed_characters ?? 0,
    }));
  }

  /**
   * Languages for text translation, cached for an hour. A DeepL outage must
   * not take the language pickers down with it, so a stale copy (up to a
   * week old) is served when the fetch fails — the list changes rarely.
   */
  async getLanguages(): Promise<DeepLLanguage[]> {
    const cached = await getCachedJson(LANGUAGES_CACHE_KEY, languagesCacheSchema);
    if (cached) return cached;
    try {
      const raw = await this.json(
        '/v3/languages?resource=translate_text',
        { method: 'GET' },
        languagesResponseSchema
      );
      const languages: DeepLLanguage[] = raw.map((l) => ({
        code: l.lang,
        name: l.name,
        usableAsSource: l.usable_as_source,
        usableAsTarget: l.usable_as_target,
        formality: Boolean(l.features && 'formality' in l.features),
        glossary: Boolean(l.features && 'glossary' in l.features),
      }));
      await setCachedJson(LANGUAGES_CACHE_KEY, languages, LANGUAGES_TTL_SECONDS);
      await setCachedJson(LANGUAGES_STALE_CACHE_KEY, languages, LANGUAGES_STALE_TTL_SECONDS);
      return languages;
    } catch (error) {
      const stale = await getCachedJson(LANGUAGES_STALE_CACHE_KEY, languagesCacheSchema);
      if (stale) {
        log.warn(`[DeepL] languages fetch failed, serving stale copy: ${(error as Error).message}`);
        return stale;
      }
      throw error;
    }
  }

  async uploadDocument(params: {
    buffer: Buffer;
    filename: string;
    targetLang: string;
    sourceLang?: string | null;
    formality?: DeepLFormality | null;
    glossaryId?: string | null;
    outputFormat?: string | null;
  }): Promise<DeepLDocumentHandle> {
    const form = new FormData();
    // DeepL infers the input format from the filename's extension, so the
    // original name (already sanitized by the caller) goes along.
    // Copy into a plain Uint8Array: Node's Buffer is not a BlobPart to TypeScript.
    form.append('file', new Blob([new Uint8Array(params.buffer)]), params.filename);
    form.append('target_lang', params.targetLang);
    if (params.sourceLang) form.append('source_lang', params.sourceLang);
    if (params.formality && params.formality !== 'default')
      form.append('formality', params.formality);
    if (params.glossaryId) form.append('glossary_id', params.glossaryId);
    if (params.outputFormat) form.append('output_format', params.outputFormat);

    const data = await this.json(
      '/v2/document',
      { method: 'POST', body: form, timeoutMs: DEEPL_DOCUMENT_TIMEOUT_MS },
      documentHandleSchema
    );
    return { documentId: data.document_id, documentKey: data.document_key };
  }

  async getDocumentStatus(handle: DeepLDocumentHandle): Promise<DeepLDocumentState> {
    const data = await this.json(
      `/v2/document/${encodeURIComponent(handle.documentId)}`,
      { method: 'POST', body: JSON.stringify({ document_key: handle.documentKey }), json: true },
      documentStatusSchema
    );
    return {
      status: data.status,
      secondsRemaining: data.seconds_remaining ?? null,
      billedCharacters: data.billed_characters ?? null,
      message: data.message ?? data.error_message ?? null,
    };
  }

  /** One-shot: DeepL deletes the document on fetch. Never retried. */
  async downloadDocument(
    handle: DeepLDocumentHandle
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await this.fetchOnce(
      `/v2/document/${encodeURIComponent(handle.documentId)}/result`,
      {
        method: 'POST',
        body: JSON.stringify({ document_key: handle.documentKey }),
        json: true,
        timeoutMs: DEEPL_DOCUMENT_TIMEOUT_MS,
      }
    );
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
  }

  async listGlossaries(): Promise<DeepLGlossary[]> {
    const data = await this.json('/v3/glossaries', { method: 'GET' }, glossaryListSchema);
    const list = Array.isArray(data) ? data : data.glossaries;
    return list.map(toGlossary);
  }

  async getGlossary(glossaryId: string): Promise<DeepLGlossary> {
    const data = await this.json(
      `/v3/glossaries/${encodeURIComponent(glossaryId)}`,
      { method: 'GET' },
      glossarySchema
    );
    return toGlossary(data);
  }

  async createGlossary(
    name: string,
    dictionaries: ReadonlyArray<{
      sourceLang: string;
      targetLang: string;
      entries: readonly GlossaryEntry[];
    }>
  ): Promise<DeepLGlossary> {
    const data = await this.json(
      '/v3/glossaries',
      {
        method: 'POST',
        json: true,
        body: JSON.stringify({
          name,
          dictionaries: dictionaries.map((d) => ({
            source_lang: d.sourceLang,
            target_lang: d.targetLang,
            entries: buildTsvEntries(d.entries),
            entries_format: 'tsv',
          })),
        }),
      },
      glossarySchema
    );
    return toGlossary(data);
  }

  /** Replaces the whole dictionary for one language pair. */
  async replaceDictionary(
    glossaryId: string,
    pair: { sourceLang: string; targetLang: string },
    entries: readonly GlossaryEntry[]
  ): Promise<void> {
    await this.fetchOnce(`/v3/glossaries/${encodeURIComponent(glossaryId)}/dictionaries`, {
      method: 'PUT',
      json: true,
      body: JSON.stringify({
        source_lang: pair.sourceLang,
        target_lang: pair.targetLang,
        entries: buildTsvEntries(entries),
        entries_format: 'tsv',
      }),
      retry: true,
    });
  }

  async getDictionaryEntries(
    glossaryId: string,
    pair: { sourceLang: string; targetLang: string }
  ): Promise<GlossaryEntry[]> {
    const query = new URLSearchParams({
      source_lang: pair.sourceLang,
      target_lang: pair.targetLang,
    });
    const data = await this.json(
      `/v3/glossaries/${encodeURIComponent(glossaryId)}/entries?${query.toString()}`,
      { method: 'GET' },
      dictionaryEntriesSchema
    );
    const tsv = 'dictionaries' in data ? data.dictionaries[0]!.entries : data.entries;
    return parseTsvEntries(tsv);
  }

  async deleteDictionary(
    glossaryId: string,
    pair: { sourceLang: string; targetLang: string }
  ): Promise<void> {
    const query = new URLSearchParams({
      source_lang: pair.sourceLang,
      target_lang: pair.targetLang,
    });
    await this.fetchOnce(
      `/v3/glossaries/${encodeURIComponent(glossaryId)}/dictionaries?${query.toString()}`,
      { method: 'DELETE', retry: true }
    );
  }

  // ── transport ─────────────────────────────────────────────────────────

  private async json<S extends z.ZodTypeAny>(
    path: string,
    init: RequestInit & { json?: boolean; timeoutMs?: number },
    schema: S
  ): Promise<z.infer<S>> {
    const res = await this.fetchOnce(path, { ...init, retry: true });
    const raw: unknown = await res.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      throw new DeepLError(
        `DeepL ${path}: unerwartete Antwortform (${parsed.error.issues[0]?.message ?? 'schema'})`,
        res.status
      );
    }
    return parsed.data as z.infer<S>;
  }

  /**
   * One HTTP call, optionally wrapped in `withRetry`. Throws `DeepLError` for
   * every non-2xx status with DeepL's own message and the `X-Trace-ID` that
   * identifies the request in their logs.
   */
  private async fetchOnce(
    path: string,
    init: RequestInit & { json?: boolean; timeoutMs?: number; retry?: boolean }
  ): Promise<Response> {
    if (Date.now() < this.quotaExhaustedUntil) {
      throw new DeepLError('DeepL-Kontingent erschöpft (456)', 456, 'quota_exceeded');
    }
    if (deeplCircuit.isOpen()) {
      throw new DeepLError('DeepL vorübergehend nicht erreichbar (Circuit offen)', null);
    }

    const attempt = async (): Promise<Response> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? DEEPL_TIMEOUT_MS);
      try {
        const headers: Record<string, string> = {
          Authorization: `DeepL-Auth-Key ${this.apiKey}`,
          'User-Agent': 'Gruenerator',
        };
        if (init.json) headers['Content-Type'] = 'application/json';
        let res: Response;
        try {
          res = await fetch(`${this.baseUrl}${path}`, {
            ...(init.method ? { method: init.method } : {}),
            ...(init.body != null ? { body: init.body } : {}),
            headers,
            signal: controller.signal,
          });
        } catch (error) {
          const message = (error as Error).name === 'AbortError' ? 'timeout' : String(error);
          throw new DeepLError(`DeepL ${path}: ${message}`, null);
        }
        if (res.ok) return res;
        throw await this.toError(path, res);
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const res = init.retry
        ? await withRetry(attempt, {
            maxRetries: 2,
            delayMs: 1000,
            label: 'DeepL',
            isRecoverable: (e) => e instanceof DeepLError && e.retryable,
          })
        : await attempt();
      deeplCircuit.recordSuccess();
      return res;
    } catch (error) {
      if (error instanceof DeepLError) {
        if (error.quotaExhausted) this.quotaExhaustedUntil = Date.now() + QUOTA_PAUSE_MS;
        if (error.retryable) deeplCircuit.recordFailure();
      }
      throw error;
    }
  }

  private async toError(path: string, res: Response): Promise<DeepLError> {
    const traceId = res.headers.get('x-trace-id');
    let message = res.statusText || `HTTP ${res.status}`;
    let code: string | null = null;
    try {
      // Two shapes: `{message, code?}` from the API, `{error: {message}}` from
      // DeepL's edge — reading both keeps a gateway incident from crashing us.
      const body = (await res.json()) as {
        message?: string;
        code?: string;
        error?: { message?: string };
      };
      message = body.message ?? body.error?.message ?? message;
      code = body.code ?? null;
    } catch {
      // non-JSON error body — keep the status text
    }
    log.warn(`[DeepL] ${path} → ${res.status} ${message} (X-Trace-ID: ${traceId ?? 'none'})`);
    return new DeepLError(`DeepL ${res.status}: ${message}`, res.status, code, traceId);
  }

  /** Test-only. */
  _resetForTests(): void {
    this.quotaExhaustedUntil = 0;
    deeplCircuit.reset();
  }
}

let _instance: DeepLService | null = null;

/** Singleton when DEEPL_API_KEY is set, null otherwise (feature off). */
export function getDeepLService(): DeepLService | null {
  if (!env.DEEPL_API_KEY) return null;
  if (!_instance) {
    _instance = new DeepLService(env.DEEPL_API_KEY);
    log.info(`[DeepL] Service initialized (${_instance.baseUrl})`);
  }
  return _instance;
}

/** Test-only: reset the singleton. */
export function _resetDeepLServiceForTests(): void {
  _instance = null;
  deeplCircuit.reset();
}
