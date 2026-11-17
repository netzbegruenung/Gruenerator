import { toast } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';

import McpSection from '@/features/mcp/components/McpSection';
import ToolApprovalsSection from '@/features/mcp/components/ToolApprovalsSection';
import { mcpServersQuery } from '@/features/mcp/hooks/useMcpServers';

const onSuccess = (message: string) => toast.success(message);
const onError = (message: string) => toast.error(message);

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(mcpServersQuery);
};

// This tab is itself lazy-loaded by SettingsDialog, so its sections load with it.
const ConnectorsTab = () => (
  <div className="flex flex-col gap-8">
    <McpSection
      onSuccess={onSuccess}
      onError={onError}
      afterConnected={<ToolApprovalsSection onSuccess={onSuccess} onError={onError} />}
    />
  </div>
);

export default ConnectorsTab;
