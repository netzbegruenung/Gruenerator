import { type z } from 'zod';

import { createLogger } from '../../../utils/logger.js';
import { CircuitBreaker } from '../../search/searchRetryStrategy.js';

import { RemoteSourceUnavailableError } from './errors.js';
import { type RemoteSourceId } from './ids.js';

const log = createLogger('RemoteNotebookSource');

const TIMEOUT_MS = 5000;

export interface RemoteHttpConfig {
  id: RemoteSourceId;
  label: string;
  /** Zur Aufrufzeit gelesen, damit Tests und Neustarts ohne Modul-Reload greifen. */
  credentials: () => { baseUrl: string | undefined; apiKey: string | undefined };
}

export interface RemoteHttpClient {
  post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T>;
  resetBreakerForTests(): void;
}

/**
 * POST mit Bearer-Key, Zeitlimit und einem Breaker je Quelle. Jede Antwort
 * wird gegen ihr Schema geprüft — die fremde API ist eine Vertrauensgrenze.
 * Jeder Fehlschlag wird zu `RemoteSourceUnavailableError`; in den Breaker
 * zählen nur Fehler, die bei der Gegenseite liegen (Zeit, Netz, 5xx, 429,
 * Schema). Ein anderes 4xx ist unser Fehler und bleibt laut im Log.
 */
export function createRemoteHttpClient(config: RemoteHttpConfig): RemoteHttpClient {
  const breaker = new CircuitBreaker({
    failureThreshold: 2,
    resetTimeMs: 5 * 60 * 1000,
    label: `remote:${config.id}`,
  });
  const unavailable = (cause: string) =>
    new RemoteSourceUnavailableError(config.id, config.label, cause);

  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const { baseUrl, apiKey } = config.credentials();
    if (!baseUrl || !apiKey) throw unavailable('not configured');
    if (breaker.isOpen()) throw unavailable('circuit open');

    let response: Response;
    try {
      response = await fetch(new URL(path, baseUrl), {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      breaker.recordFailure();
      throw unavailable(error instanceof Error ? error.message : String(error));
    }

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) {
        breaker.recordFailure();
      } else {
        log.error(`[${config.id}] ${path} → HTTP ${response.status} (request rejected)`);
      }
      throw unavailable(`HTTP ${response.status}`);
    }

    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      breaker.recordFailure();
      log.error(`[${config.id}] ${path} → unexpected response shape`, parsed.error.issues);
      throw unavailable('unexpected response shape');
    }
    breaker.recordSuccess();
    return parsed.data;
  }

  return { post, resetBreakerForTests: () => breaker.reset() };
}
