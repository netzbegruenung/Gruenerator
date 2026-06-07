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
