import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  testMcpServer,
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

export function useMcpServers() {
  return useQuery<McpServerSummary[]>({
    queryKey: mcpKeys.list(),
    queryFn: fetchMcpServers,
    staleTime: 30_000,
  });
}

export function useCreateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: McpServerCreateInput) => createMcpServer(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mcpKeys.list() }),
  });
}

export function useUpdateMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { enabled?: boolean } }) =>
      updateMcpServer(id, patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mcpKeys.list() }),
  });
}

export function useDeleteMcpServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMcpServer(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: mcpKeys.list() }),
  });
}

export function useTestMcpServer() {
  return useMutation<McpServerTestResult, Error, string>({
    mutationFn: (id: string) => testMcpServer(id),
  });
}

export function useMcpRegistry(search: string) {
  return useQuery<McpRegistryPage>({
    queryKey: mcpKeys.registry(search),
    queryFn: () => fetchMcpRegistry(search || undefined),
    staleTime: 5 * 60_000,
  });
}

export { mcpKeys };
