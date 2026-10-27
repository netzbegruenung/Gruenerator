import {
  type CanvaAutofillFieldsResponse,
  type CanvaAutofillRequest,
  type CanvaAutofillResponse,
  type CanvaAutofillSource,
  type CanvaAutofillSourcesResponse,
  type CanvaAutofillSuggestRequest,
  type CanvaAutofillSuggestResponse,
  type CanvaCollectionExportResponse,
  type CanvaStatus,
  type MarketplaceCollectionId,
} from '@gruenerator/contracts';

import apiClient from '@/components/utils/apiClient';

export type { CanvaStatus };

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

// Opened in a popup as a top-level browser navigation (not via apiClient) so the
// session cookie is sent and the backend can redirect on to Canva.
export const CANVA_AUTH_START_URL = `${API_BASE}/canva/auth/start`;

export async function fetchCanvaStatus(): Promise<CanvaStatus> {
  const response = await apiClient.get<CanvaStatus>('/canva/status');
  return response.data;
}

export async function disconnectCanva(): Promise<void> {
  await apiClient.delete('/canva');
}

/** The stickers and backgrounds of one Marktplatz collection, into a new Canva folder. */
export async function exportCollectionToCanva(
  collectionId: MarketplaceCollectionId
): Promise<CanvaCollectionExportResponse> {
  const response = await apiClient.post<CanvaCollectionExportResponse>(
    `/canva/collections/${collectionId}/export`
  );
  return response.data;
}

export interface CanvaDesign {
  id: string;
  title: string;
  viewUrl: string;
  editUrl: string;
  thumbnailUrl: string | null;
  updatedAt: string | null;
}

export interface CanvaDesignsPage {
  designs: CanvaDesign[];
  continuation: string | null;
}

export async function fetchCanvaDesigns(params: {
  continuation?: string;
  query?: string;
}): Promise<CanvaDesignsPage> {
  const response = await apiClient.get<CanvaDesignsPage>('/canva/designs', {
    params: {
      ...(params.continuation ? { continuation: params.continuation } : {}),
      ...(params.query ? { query: params.query } : {}),
      limit: 24,
    },
  });
  return response.data;
}

export async function fetchCanvaAutofillSources(): Promise<CanvaAutofillSourcesResponse> {
  const response = await apiClient.get<CanvaAutofillSourcesResponse>('/canva/autofill/sources');
  return response.data;
}

export async function fetchCanvaAutofillFields(
  source: CanvaAutofillSource
): Promise<CanvaAutofillFieldsResponse> {
  const response = await apiClient.get<CanvaAutofillFieldsResponse>('/canva/autofill/fields', {
    params: source,
  });
  return response.data;
}

/** A NEW design from the source with its text fields filled; the source stays as it is. */
export async function createCanvaAutofill(
  request: CanvaAutofillRequest
): Promise<CanvaAutofillResponse> {
  const response = await apiClient.post<CanvaAutofillResponse>('/canva/autofill', request);
  return response.data;
}

/** The text fields, filled by the AI from a Studio request — a proposal, nothing reaches Canva. */
export async function suggestCanvaAutofill(
  request: CanvaAutofillSuggestRequest
): Promise<CanvaAutofillSuggestResponse> {
  const response = await apiClient.post<CanvaAutofillSuggestResponse>(
    '/canva/autofill/suggest',
    request
  );
  return response.data;
}
