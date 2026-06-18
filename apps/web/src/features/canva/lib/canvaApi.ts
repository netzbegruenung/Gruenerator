import apiClient from '@/components/utils/apiClient';

export interface CanvaStatus {
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
}

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
