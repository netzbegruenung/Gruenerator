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

const CONNECTION_MESSAGE_RE =
  /fetch failed|connect timeout|ETIMEDOUT|ECONNREFUSED|getaddrinfo|network|socket hang up|other side closed/i;

function walkCauses(err: unknown, max = 6): Error[] {
  const chain: Error[] = [];
  let current = err;
  for (let i = 0; i < max && current instanceof Error; i++) {
    chain.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return chain;
}

/**
 * True when the error is a connection-level failure (search index unreachable),
 * as opposed to a query/validation error or a genuine empty result.
 */
export function isConnectionError(err: unknown): boolean {
  for (const e of walkCauses(err)) {
    const code = (e as { code?: string }).code;
    if (code && CONNECTION_ERROR_CODES.has(code)) return true;
    if (CONNECTION_MESSAGE_RE.test(e.message)) return true;
  }
  return false;
}

/**
 * Human-readable description that keeps the underlying cause + error code,
 * e.g. `fetch failed [UND_ERR_CONNECT_TIMEOUT] ← Connect Timeout Error`,
 * instead of the useless bare `fetch failed`.
 */
export function describeFetchError(err: unknown): string {
  const parts = walkCauses(err).map((e) => {
    const code = (e as { code?: string }).code;
    return code ? `${e.message} [${code}]` : e.message;
  });
  return parts.length > 0 ? parts.join(' ← ') : String(err);
}
