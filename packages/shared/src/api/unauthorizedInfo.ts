import { type UnauthorizedInfo } from '../types/auth.js';

// Re-exported so the `fetch` stacks can take the helper and the type it returns
// from one import path.
export { type UnauthorizedInfo } from '../types/auth.js';

/**
 * Pull the 401 context out of a raw `fetch` Response.
 *
 * The axios stacks get this for free (axios pre-parses the body), but the
 * `fetch`-based stacks have to read it themselves — and a teardown triggered
 * without it reports `auth.401code: unknown`, losing the one tag that says
 * whether the backend held a token it could not resolve.
 *
 * `clone()` because callers may still read the body. A 401 with no JSON body
 * (reverse proxy, HTML error page) is not a swallowed fault: it is the answer
 * to "does this response name a code?", and the answer is no.
 */
export async function unauthorizedInfoFromResponse(
  response: Response,
  url?: string
): Promise<UnauthorizedInfo> {
  const body: unknown = await response
    .clone()
    .json()
    // swallow-ok: no body = no code, the caller still handles the 401.
    .catch(() => null);
  const parsed = (body ?? {}) as { code?: unknown; requestId?: unknown };
  const headerRequestId = response.headers.get('x-request-id');
  return {
    url,
    status: response.status,
    code: typeof parsed.code === 'string' ? parsed.code : undefined,
    requestId:
      typeof parsed.requestId === 'string' ? parsed.requestId : (headerRequestId ?? undefined),
  };
}
