'use client';

import { useState } from 'react';
import { Globe, Wrench, Sparkles, Server, Share2 } from 'lucide-react';
import { useAgentStore, MODEL_OPTIONS, type ModelOption } from '../stores/chatStore';
import { ShareThreadDialog } from './thread/ShareThreadDialog';
import { Dropdown, DropdownItem, ToggleSwitch } from './ui/Dropdown';

const MODEL_ICONS: Record<ModelOption['icon'], typeof Sparkles> = {
  sparkles: Sparkles,
  server: Server,
};

export function ToolToggles() {
  const enabledTools = useAgentStore((s) => s.enabledTools);
  const toggleTool = useAgentStore((s) => s.toggleTool);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const threadId = useAgentStore((s) => s.currentThreadId);
  const [shareOpen, setShareOpen] = useState(false);

  const webEnabled = enabledTools.web;

  const current = MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0];
  const next = MODEL_OPTIONS[(MODEL_OPTIONS.indexOf(current) + 1) % MODEL_OPTIONS.length];
  const CurrentIcon = MODEL_ICONS[current.icon];

  return (
    <>
      <Dropdown
        align="left"
        direction="up"
        width="w-64"
        showChevron={false}
        trigger={<Wrench className="h-4 w-4" />}
      >
        <DropdownItem
          icon={<Globe className="h-4 w-4 text-tool-web" />}
          iconClassName={webEnabled ? 'bg-tool-web-bg' : 'bg-surface'}
          label="Websuche"
          description="Aktuelle Nachrichten & Infos"
          onClick={() => toggleTool('web')}
          trailing={<ToggleSwitch enabled={webEnabled} />}
        />
        <div className="border-t border-border my-1" />
        <DropdownItem
          icon={<CurrentIcon className="h-4 w-4 text-foreground-muted" />}
          label={current.name}
          description={`Wechseln zu ${next.name}`}
          onClick={() => setSelectedModel(next.id)}
        />
        {threadId && (
          <>
            <div className="border-t border-border my-1" />
            <DropdownItem
              icon={<Share2 className="h-4 w-4 text-foreground-muted" />}
              label="Chat teilen"
              description="Mit Gruppe zusammenarbeiten"
              onClick={() => setShareOpen(true)}
            />
          </>
        )}
      </Dropdown>

      <ShareThreadDialog threadId={threadId} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
