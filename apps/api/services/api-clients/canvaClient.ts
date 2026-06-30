/**
 * Canva Connect API client (direct OAuth2 + PKCE, no Nango).
 *
 * Docs: https://www.canva.dev/docs/connect/
 *  - Authorize (browser):  https://www.canva.com/api/oauth/authorize
 *  - Token / refresh:      https://api.canva.com/rest/v1/oauth/token
 *  - Current user profile: https://api.canva.com/rest/v1/users/me/profile
 *
 * The token endpoint authenticates the integration with HTTP Basic
 * (client_id:client_secret) and expects an application/x-www-form-urlencoded body.
 */

import axios from 'axios';
import { z } from 'zod';

export const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
export const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const CANVA_PROFILE_URL = 'https://api.canva.com/rest/v1/users/me/profile';
const CANVA_DESIGNS_URL = 'https://api.canva.com/rest/v1/designs';

/**
 * Scopes requested for the integration.
 *
 * Canva's security guidelines require the *minimum* scopes needed
 * (https://www.canva.dev/docs/connect/guidelines/security/). The submission
 * questionnaire/demo video must justify each scope below. Currently *exercised*
 * scopes are marked [LIVE]; the rest are [PLANNED] and gate features that are
 * being built — re-confirm before submitting (unused scopes are a common review
 * blocker; trim any that slip).
 *
 *   design:meta:read         [LIVE]    list the user's designs (listDesigns)
 *   profile:read             [LIVE]    show connected account name (getProfileDisplayName)
 *   design:content:read      [PLANNED] read design content for import/preview
 *   design:content:write     [PLANNED] write generated content back into a design
 *   asset:read               [PLANNED] read uploaded assets
 *   asset:write              [PLANNED] upload Grünerator images as Canva assets
 *   brandtemplate:meta:read  [PLANNED] list Grüne brand templates
 *   brandtemplate:content:read [PLANNED] autofill brand templates
 */
export const CANVA_SCOPES = [
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'asset:read',
  'asset:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'profile:read',
] as const;

const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  scope: z.string().optional(),
});
export type CanvaTokenResponse = z.infer<typeof tokenResponseSchema>;

const profileResponseSchema = z.object({
  profile: z.object({
    display_name: z.string().optional(),
  }),
});

const designSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  thumbnail: z
    .object({
      width: z.number(),
      height: z.number(),
      url: z.string(),
    })
    .optional(),
  urls: z.object({
    edit_url: z.string(),
    view_url: z.string(),
  }),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
  page_count: z.number().optional(),
});
export type CanvaDesign = z.infer<typeof designSchema>;

const listDesignsResponseSchema = z.object({
  items: z.array(designSchema).default([]),
  continuation: z.string().optional(),
});
export type CanvaListDesignsResult = z.infer<typeof listDesignsResponseSchema>;

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

function tokenHeaders(clientId: string, clientSecret: string) {
  return {
    Authorization: basicAuthHeader(clientId, clientSecret),
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

/**
 * Build the Canva authorization URL the user's browser is redirected to.
 */
export function buildAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: CANVA_SCOPES.join(' '),
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
    state: params.state,
  });
  return `${CANVA_AUTHORIZE_URL}?${query.toString()}`;
}

/**
 * Exchange an authorization code (+ PKCE verifier) for access/refresh tokens.
 */
export async function exchangeCodeForTokens(
  creds: ClientCredentials,
  params: { code: string; codeVerifier: string; redirectUri: string }
): Promise<CanvaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const response = await axios.post(CANVA_TOKEN_URL, body.toString(), {
    headers: tokenHeaders(creds.clientId, creds.clientSecret),
  });
  return tokenResponseSchema.parse(response.data);
}

/**
 * Use a refresh token to obtain a fresh access token. Canva rotates refresh
 * tokens, so the response's refresh_token must be persisted too.
 */
export async function refreshTokens(
  creds: ClientCredentials,
  refreshToken: string
): Promise<CanvaTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await axios.post(CANVA_TOKEN_URL, body.toString(), {
    headers: tokenHeaders(creds.clientId, creds.clientSecret),
  });
  return tokenResponseSchema.parse(response.data);
}

/**
 * Fetch the connected user's display name (requires the profile:read scope).
 */
export async function getProfileDisplayName(accessToken: string): Promise<string | null> {
  const response = await axios.get(CANVA_PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const parsed = profileResponseSchema.parse(response.data);
  return parsed.profile.display_name ?? null;
}

/**
 * List the user's designs (requires the design:meta:read scope).
 * https://www.canva.dev/docs/connect/api-reference/designs/list-designs/
 */
export async function listDesigns(
  accessToken: string,
  params: { query?: string; limit?: number; continuation?: string } = {}
): Promise<CanvaListDesignsResult> {
  const search = new URLSearchParams();
  if (params.query) search.set('query', params.query);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.continuation) search.set('continuation', params.continuation);
  const qs = search.toString();

  const response = await axios.get(`${CANVA_DESIGNS_URL}${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return listDesignsResponseSchema.parse(response.data);
}
