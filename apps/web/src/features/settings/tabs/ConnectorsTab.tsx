import { toast } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';

import WebsitesSection, { prefetch as prefetchWebsites } from './WebsitesSection';
import WolkeSection, { prefetch as prefetchWolke } from './WolkeSection';

import CanvaSection from '@/features/canva/components/CanvaSection';
import McpSection from '@/features/mcp/components/McpSection';
import ToolApprovalsSection from '@/features/mcp/components/ToolApprovalsSection';
import { mcpServersQuery } from '@/features/mcp/hooks/useMcpServers';

const onSuccess = (message: string) => toast.success(message);
const onError = (message: string) => toast.error(message);

export const prefetch = (queryClient: QueryClient) => {
  prefetchWolke(queryClient);
  prefetchWebsites(queryClient);
  void queryClient.prefetchQuery(mcpServersQuery);
};

// Alles, was der Grünerator von außen liest, an einer Stelle. Die Wolke zuerst:
// sie richten fast alle ein. Die Websites stehen unter den Diensten samt deren
// Freigaben.
//
// This tab is itself lazy-loaded by SettingsDialog, so its sections load with it.
const ConnectorsTab = () => (
  <div className="flex flex-col gap-xl">
    <WolkeSection />
    <hr className="m-0 border-grey-200 dark:border-grey-700" />
    <McpSection onSuccess={onSuccess} onError={onError} />
    <ToolApprovalsSection onSuccess={onSuccess} onError={onError} />
    <hr className="m-0 border-grey-200 dark:border-grey-700" />
    <WebsitesSection />
    {import.meta.env.DEV && <CanvaSection onSuccess={onSuccess} onError={onError} />}
  </div>
);

export default ConnectorsTab;
