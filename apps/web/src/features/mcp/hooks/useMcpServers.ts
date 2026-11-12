import { MCP_SERVER_MENTIONS_QUERY_KEY } from '@gruenerator/chat';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  testMcpServer,
  approveMcpServerTools,
  fetchMcpRegistry,
  type McpServerCreateInput,
  type McpServerSummary,
  type McpServerTestResult,
  type McpRegistryPage,
} from '../lib/mcpApi';

const mcpKeys = {
  all: ['mcp-servers'] as const,
  list: () => ['mcp-servers', 'list'] as const,
  registry: (search: string) => ['mcp-servers', 'registry', search] as const,
};

/** Shared by the hook and the Konnektoren tab's preload. */
export const mcpServersQuery = {
  queryKey: mcpKeys.list(),
  queryFn: fetchMcpServers,
  staleTime: 30_000,
};

/**
 * Refresh everything that lists the person's servers: the settings list AND the
 * chat's @mention list. The settings are a dialog over the chat, so without the
 * second key a freshly added server only became mentionable once the composer
 * remounted after its stale time — which looked like "first click Testen".
 */
export function invalidateMcpServers(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: mcpKeys.list() });
  void queryClient.invalidateQueries({ queryKey: MCP_SERVER_MENTIONS_QUERY_KEY });
}

export function useMcpServers() {
  return useQuery<McpServerSummary[]>(mcpServersQuery);
}

export function useCreateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: McpServerCreateInput) => createMcpServer(input),
    onSuccess: () => invalidateMcpServers(queryClient),
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateMcpServer>[1] }) =>
      updateMcpServer(id, patch),
    onSuccess: () => invalidateMcpServers(queryClient),
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => invalidateMcpServers(queryClient),
  });
}

export function useTestMcpServer() {
  const queryClient = useQueryClient();
  return useMutation<McpServerTestResult, Error, string>({
    mutationFn: (id: string) => testMcpServer(id),
    // A successful test writes the tool snapshot the row's tool list reads.
    onSuccess: () => invalidateMcpServers(queryClient),
  });
}

export function useApproveMcpServerTools() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveMcpServerTools(id),
    onSuccess: () => invalidateMcpServers(queryClient),
  });
}

export function useMcpRegistry(search: string) {
  return useQuery<McpRegistryPage>({
    queryKey: mcpKeys.registry(search),
    queryFn: () => fetchMcpRegistry(search || undefined),
    staleTime: 5 * 60_000,
  });
}
