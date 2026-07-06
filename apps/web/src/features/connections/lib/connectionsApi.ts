import apiClient from '@/components/utils/apiClient';

export interface ConnectionStatus {
  provider: string;
  label: string;
  services: string[];
  connected: boolean;
  connectionId: string | null;
  connectedAt: string | null;
}

export interface ConnectionsStatusResponse {
  providers: ConnectionStatus[];
}

export interface SessionTokenResponse {
  token: string;
}

export async function fetchConnectionStatus(): Promise<ConnectionStatus[]> {
  const response = await apiClient.get<ConnectionsStatusResponse>('/connections/status');
  return response.data.providers;
}

export async function createSessionToken(): Promise<string> {
  const response = await apiClient.post<SessionTokenResponse>('/connections/session-token');
  return response.data.token;
}

export async function disconnectProvider(providerKey: string): Promise<void> {
  await apiClient.delete(`/connections/${providerKey}`);
}

export interface ConnectionTestResult {
  ok: boolean;
  tools: string[];
  error: string | null;
}

export async function testConnection(providerKey: string): Promise<ConnectionTestResult> {
  const response = await apiClient.post<ConnectionTestResult>(`/connections/${providerKey}/test`);
  return response.data;
}
