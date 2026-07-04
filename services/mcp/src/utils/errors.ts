/**
 * Error classification for outbound connection failures (Qdrant, embeddings, …).
 *
 * `fetch()` / the Qdrant client reject with an opaque `TypeError: fetch failed`
 * on connection-level problems — the actionable detail (DNS, refused, TLS,
 * connect timeout) lives on `err.cause`. These helpers unwrap that chain so
 * logs say *why* the connection failed and callers can distinguish a real
 * infra outage from an empty result set.
 */

// Node/undici connection-level error codes. A search that trips any of these is
// an infrastructure problem (search index unreachable), NOT "no results".
const CONNECTION_ERROR_CODES = new Set([
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_HEADERS_TIMEOUT',
]);

// Specific connection markers only. Deliberately no bare "network" — that word
// appears in plenty of non-connection (validation/query) error messages and
// would misclassify a permanent error as a retryable outage.
const CONNECTION_MESSAGE_RE =
  /fetch failed|connect timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|other side closed/i;

const UNAVAILABLE_TAIL =
  'Das ist ein vorübergehendes technisches Problem – bitte in ein paar Minuten erneut versuchen.';

function walkCauses(err: unknown, max = 6): Error[] {
  const chain: Error[] = [];
  let current = err;
  for (let i = 0; i < max && current instanceof Error; i++) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

function isConnectionChain(chain: Error[]): boolean {
  for (const e of chain) {
    const code = (e as { code?: string }).code;
    if (code && CONNECTION_ERROR_CODES.has(code)) return true;
    if (CONNECTION_MESSAGE_RE.test(e.message)) return true;
  }
  return false;
}

function formatChain(chain: Error[], err: unknown): string {
  if (chain.length === 0) return String(err);
  return chain
    .map((e) => {
      const code = (e as { code?: string }).code;
      return code ? `${e.message} [${code}]` : e.message;
    })
    .join(' ← ');
}

/**
 * True when the error is a connection-level failure (search index unreachable),
 * as opposed to a query/validation error or a genuine empty result.
 */
export function isConnectionError(err: unknown): boolean {
  return isConnectionChain(walkCauses(err));
}

/**
 * Human-readable description that keeps the underlying cause + error code,
 * e.g. `fetch failed [UND_ERR_CONNECT_TIMEOUT] ← Connect Timeout Error`.
 */
export function describeFetchError(err: unknown): string {
  return formatChain(walkCauses(err), err);
}

/**
 * Walk the cause chain once and return both the description and the
 * connection-vs-other classification (avoids the double/triple walk of calling
 * describeFetchError + isConnectionError separately in a catch block).
 */
export function classifyError(err: unknown): { detail: string; isConnection: boolean } {
  const chain = walkCauses(err);
  return { detail: formatChain(chain, err), isConnection: isConnectionChain(chain) };
}

/**
 * Canonical "search index unreachable" tool response. One source of truth for
 * the user-facing copy + the `errorType: 'search_unavailable'` contract that
 * clients branch on. `detail` should come from classifyError; `extra` carries
 * tool-specific context (collection, query, empty arrays …).
 */
export function connectionErrorResponse(
  detail: string,
  extra: Record<string, unknown> = {},
  subject = 'Die Wissensdatenbank'
): Record<string, unknown> {
  return {
    error: true,
    errorType: 'search_unavailable',
    message: `${subject} ist derzeit nicht erreichbar (Verbindungsproblem zum Suchindex). ${UNAVAILABLE_TAIL}`,
    technicalDetail: detail,
    ...extra,
  };
}
