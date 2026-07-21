import { toast } from '@gruenerator/ui';

import CanvaSection from '@/features/canva/components/CanvaSection';
import McpSection from '@/features/mcp/components/McpSection';

const onSuccess = (message: string) => toast.success(message);
const onError = (message: string) => toast.error(message);

// This tab is itself lazy-loaded by SettingsDialog, so its sections load with it.
const ConnectorsTab = () => (
  <div className="flex flex-col gap-xl">
    <McpSection onSuccess={onSuccess} onError={onError} />
    {import.meta.env.DEV && <CanvaSection onSuccess={onSuccess} onError={onError} />}
  </div>
);

export default ConnectorsTab;
