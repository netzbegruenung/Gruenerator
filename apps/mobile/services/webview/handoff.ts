/**
 * Turns the app's Bearer session into a WebView URL that loads logged in.
 *
 * Two steps on purpose. A WebView only attaches `source.headers` to the
 * *initial* top-level request, so authenticating the handoff with a header
 * would depend on platform behaviour we do not control. Minting the token over
 * the normal API client (where the Bearer interceptor definitely applies) and
 * passing it as a query parameter does not.
 *
 * Server side: `apps/api/plugins/webViewHandoff.ts`.
 */

import { getGlobalApiClient, API_ENDPOINTS } from '../api';

const WEB_BASE = 'https://gruenerator.eu';

interface HandoffMintResponse {
  token: string;
  expiresIn: number;
}

/**
 * Returns the URL to load in the WebView. The server validates `redirect`
 * against its own allowlist of embeddable paths — this is not the security
 * boundary, it just carries the destination.
 *
 * Throws if the session cannot be exchanged; the caller shows an error rather
 * than loading a logged-out page.
 */
export async function mintWebViewHandoff(targetPath: string): Promise<string> {
  const response = await getGlobalApiClient().post<HandoffMintResponse>(
    API_ENDPOINTS.AUTH_WEB_HANDOFF_MINT
  );

  const token = response.data?.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Handoff mint returned no token');
  }

  const params = new URLSearchParams({ ott: token, redirect: targetPath });
  return `${WEB_BASE}/api/auth/v2/web-handoff?${params.toString()}`;
}
