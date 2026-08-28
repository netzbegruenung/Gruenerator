import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchToolApprovals,
  revokeToolApproval,
  type ChatToolApproval,
} from '../lib/toolApprovalsApi';

const toolApprovalKeys = {
  list: () => ['chat-tool-approvals', 'list'] as const,
};

export function useToolApprovals() {
  return useQuery<ChatToolApproval[]>({
    queryKey: toolApprovalKeys.list(),
    queryFn: fetchToolApprovals,
    staleTime: 30_000,
  });
}

export function useRevokeToolApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scopeKey: string) => revokeToolApproval(scopeKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: toolApprovalKeys.list() }),
  });
}
