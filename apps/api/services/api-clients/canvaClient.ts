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
const CANVA_REVOKE_URL = 'https://api.canva.com/rest/v1/oauth/revoke';
const CANVA_PROFILE_URL = 'https://api.canva.com/rest/v1/users/me/profile';
const CANVA_DESIGNS_URL = 'https://api.canva.com/rest/v1/designs';
const CANVA_FOLDERS_URL = 'https://api.canva.com/rest/v1/folders';
const CANVA_ASSET_UPLOADS_URL = 'https://api.canva.com/rest/v1/asset-uploads';
const CANVA_BRAND_TEMPLATES_URL = 'https://api.canva.com/rest/v1/brand-templates';
const CANVA_AUTOFILLS_URL = 'https://api.canva.com/rest/v1/autofills';
const CANVA_CAPABILITIES_URL = 'https://api.canva.com/rest/v1/users/me/capabilities';

/**
 * Scopes requested for the integration.
 *
 * Canva's security guidelines require the *minimum* scopes needed
 * (https://www.canva.dev/docs/connect/guidelines/security/), and unused scopes
 * are a common review blocker — so this list holds only what a call below uses:
 *
 *   design:meta:read           list the user's designs (listDesigns)
 *   design:content:read        read a design's data fields (getDesignDataset)
 *   design:content:write       create a design by autofill (createAutofillJob)
 *   brandtemplate:meta:read    list the team's brand templates (listBrandTemplates)
 *   brandtemplate:content:read read a brand template's data fields (getBrandTemplateDataset)
 *   profile:read               connected account name and plan capabilities
 *                              (getProfileDisplayName, getUserCapabilities)
 *   asset:read                 poll an upload job (getAssetUploadJob)
 *   asset:write                upload stickers and backgrounds (createAssetUploadJob)
 *   folder:write               a folder per sticker package (createFolder, moveFolderItem)
 *
 * A connection made before a scope was added lacks it; `missingCanvaScopes`
 * tells the settings to offer „Neu verbinden".
 */
export const CANVA_SCOPES = [
  'design:meta:read',
  'design:content:read',
  'design:content:write',
  'brandtemplate:meta:read',
  'brandtemplate:content:read',
  'profile:read',
  'asset:read',
  'asset:write',
  'folder:write',
] as const;

/** The requested scopes a stored grant (space-separated, as Canva returns it) does not cover. */
export function missingCanvaScopes(granted: string | null): string[] {
  const have = new Set((granted ?? '').split(/\s+/).filter(Boolean));
  return CANVA_SCOPES.filter((scope) => !have.has(scope));
}

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
 * Revoke a token at Canva. A refresh token takes its whole lineage with it
 * (every access token made from it) and the user's consent, so after this the
 * app is disconnected on Canva's side too, not just forgotten on ours.
 * https://www.canva.dev/docs/apps/rest-apis/reference/authentication/revoke-token/
 */
export async function revokeToken(creds: ClientCredentials, token: string): Promise<void> {
  await axios.post(CANVA_REVOKE_URL, new URLSearchParams({ token }).toString(), {
    headers: tokenHeaders(creds.clientId, creds.clientSecret),
  });
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

const folderResponseSchema = z.object({
  folder: z.object({ id: z.string(), name: z.string() }),
});

/**
 * Create a folder (requires folder:write). `parentFolderId` is a folder id or
 * one of Canva's two fixed ids, `root` (Projects) and `uploads`.
 */
export async function createFolder(
  accessToken: string,
  params: { name: string; parentFolderId: string }
): Promise<{ id: string; name: string }> {
  const response = await axios.post(
    CANVA_FOLDERS_URL,
    { name: params.name, parent_folder_id: params.parentFolderId },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return folderResponseSchema.parse(response.data).folder;
}

/** Move a design, folder or (non-video) asset into another folder (requires folder:write). */
export async function moveFolderItem(
  accessToken: string,
  params: { itemId: string; toFolderId: string }
): Promise<void> {
  await axios.post(
    `${CANVA_FOLDERS_URL}/move`,
    { item_id: params.itemId, to_folder_id: params.toFolderId },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

const assetUploadJobSchema = z.object({
  job: z.object({
    id: z.string(),
    status: z.enum(['in_progress', 'success', 'failed']),
    error: z.object({ code: z.string(), message: z.string() }).optional(),
    asset: z.object({ id: z.string() }).optional(),
  }),
});
export type CanvaAssetUploadJob = z.infer<typeof assetUploadJobSchema>['job'];

/** Canva caps an asset name at 50 characters (unencoded). */
const ASSET_NAME_MAX = 50;

/**
 * Start an asset upload job (requires asset:write). The body is the raw file;
 * the name travels base64-encoded in a header so umlauts and emoji survive.
 * https://www.canva.dev/docs/apps/rest-apis/reference/assets/create-asset-upload-job/
 */
export async function createAssetUploadJob(
  accessToken: string,
  params: { bytes: Buffer; name: string }
): Promise<CanvaAssetUploadJob> {
  const name = Array.from(params.name.trim() || 'Grünerator')
    .slice(0, ASSET_NAME_MAX)
    .join('');
  const response = await axios.post(CANVA_ASSET_UPLOADS_URL, params.bytes, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Asset-Upload-Metadata': JSON.stringify({
        name_base64: Buffer.from(name, 'utf8').toString('base64'),
      }),
    },
  });
  return assetUploadJobSchema.parse(response.data).job;
}

/** Poll an asset upload job (requires asset:read). */
export async function getAssetUploadJob(
  accessToken: string,
  jobId: string
): Promise<CanvaAssetUploadJob> {
  const response = await axios.get(`${CANVA_ASSET_UPLOADS_URL}/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return assetUploadJobSchema.parse(response.data).job;
}

const capabilitiesResponseSchema = z.object({ capabilities: z.array(z.string()).default([]) });

/**
 * Plan-bound features of the connected account (requires profile:read), e.g.
 * `autofill` and `brand_template` (Canva Pro, Teams, Enterprise).
 */
export async function getUserCapabilities(accessToken: string): Promise<string[]> {
  const response = await axios.get(CANVA_CAPABILITIES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return capabilitiesResponseSchema.parse(response.data).capabilities;
}

const brandTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  thumbnail: z.object({ url: z.string() }).optional(),
});
const listBrandTemplatesResponseSchema = z.object({
  items: z.array(brandTemplateSchema).default([]),
  continuation: z.string().optional(),
});
export type CanvaBrandTemplate = z.infer<typeof brandTemplateSchema>;

/**
 * Brand templates that have data fields (requires brandtemplate:meta:read).
 * https://www.canva.dev/docs/apps/rest-apis/reference/brand-templates/list-brand-templates/
 */
export async function listBrandTemplates(
  accessToken: string,
  params: { continuation?: string } = {}
): Promise<z.infer<typeof listBrandTemplatesResponseSchema>> {
  const search = new URLSearchParams({ dataset: 'non_empty', limit: '50' });
  if (params.continuation) search.set('continuation', params.continuation);
  const response = await axios.get(`${CANVA_BRAND_TEMPLATES_URL}?${search.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return listBrandTemplatesResponseSchema.parse(response.data);
}

/** Field name → field type. Canva also knows `chart` and `sheet`; callers decide what to offer. */
const datasetResponseSchema = z.object({
  dataset: z.record(z.string(), z.object({ type: z.string() })).default({}),
});
export type CanvaDataset = z.infer<typeof datasetResponseSchema>['dataset'];

/** The data fields of a design (requires design:content:read). */
export async function getDesignDataset(
  accessToken: string,
  designId: string
): Promise<CanvaDataset> {
  const response = await axios.get(`${CANVA_DESIGNS_URL}/${encodeURIComponent(designId)}/dataset`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return datasetResponseSchema.parse(response.data).dataset;
}

/** The data fields of a brand template (requires brandtemplate:content:read). */
export async function getBrandTemplateDataset(
  accessToken: string,
  brandTemplateId: string
): Promise<CanvaDataset> {
  const response = await axios.get(
    `${CANVA_BRAND_TEMPLATES_URL}/${encodeURIComponent(brandTemplateId)}/dataset`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return datasetResponseSchema.parse(response.data).dataset;
}

export type CanvaAutofillSource =
  | { type: 'create_from_design'; design_id: string }
  | { type: 'create_from_brand_template'; brand_template_id: string };

const autofillJobSchema = z.object({
  job: z.object({
    id: z.string(),
    status: z.enum(['in_progress', 'success', 'failed']),
    error: z.object({ code: z.string(), message: z.string() }).optional(),
    result: z
      .object({
        design: z.object({
          id: z.string().optional(),
          title: z.string().optional(),
          urls: z.object({ edit_url: z.string() }).optional(),
          url: z.string().optional(),
          thumbnail: z.object({ url: z.string() }).optional(),
        }),
        trial_information: z
          .object({ uses_remaining: z.number(), upgrade_url: z.string() })
          .optional(),
      })
      .optional(),
  }),
});
export type CanvaAutofillJob = z.infer<typeof autofillJobSchema>['job'];

/**
 * Start an autofill job that creates a NEW design from a design or brand
 * template (requires design:content:write). Text fields only for now; a field
 * left out keeps the template's own content.
 * https://www.canva.dev/docs/apps/rest-apis/reference/autofills/create-design-autofill-job/
 */
export async function createAutofillJob(
  accessToken: string,
  params: {
    source: CanvaAutofillSource;
    title?: string;
    data: Record<string, { type: 'text'; text: string }>;
  }
): Promise<CanvaAutofillJob> {
  const response = await axios.post(
    CANVA_AUTOFILLS_URL,
    { ...params.source, ...(params.title ? { title: params.title } : {}), data: params.data },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return autofillJobSchema.parse(response.data).job;
}

/** Poll an autofill job (requires design:meta:read). */
export async function getAutofillJob(
  accessToken: string,
  jobId: string
): Promise<CanvaAutofillJob> {
  const response = await axios.get(`${CANVA_AUTOFILLS_URL}/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return autofillJobSchema.parse(response.data).job;
}
