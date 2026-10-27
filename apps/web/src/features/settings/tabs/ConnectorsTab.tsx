import { toast } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';

import CanvaSection from '@/features/canva/components/CanvaSection';
import McpSection from '@/features/mcp/components/McpSection';
import ToolApprovalsSection from '@/features/mcp/components/ToolApprovalsSection';
import { mcpServersQuery } from '@/features/mcp/hooks/useMcpServers';
import { useAuthStore } from '@/stores/authStore';

const onSuccess = (message: string) => toast.success(message);
const onError = (message: string) => toast.error(message);

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(mcpServersQuery);
};

// This tab is itself lazy-loaded by SettingsDialog, so its sections load with it.
// Canva: instance admins only until Canva has reviewed the app (the API gates it too).
const ConnectorsTab = () => {
  const isInstanceAdmin = useAuthStore((s) => s.user?.is_admin === true);
  return (
    <div className="flex flex-col gap-xl">
      <McpSection onSuccess={onSuccess} onError={onError} />
      <ToolApprovalsSection onSuccess={onSuccess} onError={onError} />
      {isInstanceAdmin && <CanvaSection onSuccess={onSuccess} onError={onError} />}
    </div>
  );
};

export default ConnectorsTab;
