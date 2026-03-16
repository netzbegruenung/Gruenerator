'use client';

import { useState } from 'react';
import {
  Globe,
  Wrench,
  Sparkles,
  Server,
  Share2,
  MessageSquare,
  BookOpen,
  Search,
  Check,
} from 'lucide-react';
import {
  useAgentStore,
  MODEL_OPTIONS,
  type ModelOption,
  type ThreadMode,
} from '../stores/chatStore';
import { notebookMentionables } from '../lib/mentionables';
import { ShareThreadDialog } from './thread/ShareThreadDialog';
import { Dropdown, DropdownItem, ToggleSwitch } from './ui/Dropdown';

const MODEL_ICONS: Record<ModelOption['icon'], typeof Sparkles> = {
  sparkles: Sparkles,
  server: Server,
};

const MODE_CONFIG: Array<{
  mode: ThreadMode;
  label: string;
  description: string;
  Icon: typeof MessageSquare;
}> = [
  { mode: 'chat', label: 'Chat', description: 'Vollständiger Assistent', Icon: MessageSquare },
  { mode: 'notebook', label: 'Notebook', description: 'Dokument-Suche', Icon: BookOpen },
  { mode: 'search', label: 'Suche', description: 'Web & Recherche', Icon: Search },
];

export function ToolToggles() {
  const enabledTools = useAgentStore((s) => s.enabledTools);
  const toggleTool = useAgentStore((s) => s.toggleTool);
  const selectedModel = useAgentStore((s) => s.selectedModel);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const threadId = useAgentStore((s) => s.currentThreadId);
  const threadMode = useAgentStore((s) => s.threadMode);
  const setThreadMode = useAgentStore((s) => s.setThreadMode);
  const selectedNotebookId = useAgentStore((s) => s.selectedNotebookId);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);
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
        badge={
          threadMode !== 'chat' ? (
            <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
              {MODE_CONFIG.find((m) => m.mode === threadMode)?.label}
            </span>
          ) : undefined
        }
      >
        {/* Thread Mode */}
        {MODE_CONFIG.map(({ mode, label, description, Icon }) => (
          <DropdownItem
            key={mode}
            icon={<Icon className="h-4 w-4 text-foreground-muted" />}
            label={label}
            description={description}
            onClick={() => setThreadMode(mode)}
            selected={threadMode === mode}
            trailing={
              threadMode === mode ? <Check className="h-4 w-4 text-secondary-600" /> : undefined
            }
          />
        ))}
        {threadMode === 'notebook' && (
          <div className="px-3 py-1.5">
            <select
              value={selectedNotebookId}
              onChange={(e) => setSelectedNotebook(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1 text-xs text-foreground"
            >
              {notebookMentionables.map((nb) => (
                <option key={nb.identifier} value={nb.identifier}>
                  {nb.avatar} {nb.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="border-t border-border my-1" />
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
