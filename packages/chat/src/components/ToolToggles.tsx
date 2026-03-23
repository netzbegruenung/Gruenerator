'use client';

import { useState } from 'react';
import {
  Globe,
  Wrench,
  Share2,
  MessageSquare,
  BookOpen,
  Search,
  FileSearch,
  BookMarked,
  FlaskConical,
  Settings,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@gruenerator/ui';
import { cn, composerToolbarButtonClass } from '../lib/utils';
import { MODEL_ICONS } from '../lib/modelIcons';
import { useShallow } from 'zustand/shallow';
import { useAgentStore, MODEL_OPTIONS, type ThreadMode, type ToolKey } from '../stores/chatStore';
import { notebookMentionables } from '../lib/mentionables';
import { ShareThreadDialog } from './thread/ShareThreadDialog';

const MODE_CONFIG: Array<{
  mode: ThreadMode;
  label: string;
  Icon: typeof MessageSquare;
}> = [
  { mode: 'chat', label: 'Chat', Icon: MessageSquare },
  { mode: 'notebook', label: 'Notebook', Icon: BookOpen },
  { mode: 'search', label: 'Suche', Icon: Search },
];

const TOOL_CONFIG: Array<{ key: ToolKey; label: string; Icon: typeof Globe }> = [
  { key: 'search', label: 'Dokumentensuche', Icon: FileSearch },
  { key: 'web', label: 'Websuche', Icon: Globe },
  { key: 'examples', label: 'Beispiele', Icon: BookMarked },
  { key: 'research', label: 'Recherche', Icon: FlaskConical },
];

interface ToolTogglesProps {
  onNavigate?: (path: string) => void;
  firstName?: string | null;
}

export function ToolToggles({ onNavigate, firstName }: ToolTogglesProps) {
  const {
    enabledTools,
    selectedModel,
    currentThreadId: threadId,
    threadMode,
    selectedNotebookId,
    customSystemPrompt,
  } = useAgentStore(
    useShallow((s) => ({
      enabledTools: s.enabledTools,
      selectedModel: s.selectedModel,
      currentThreadId: s.currentThreadId,
      threadMode: s.threadMode,
      selectedNotebookId: s.selectedNotebookId,
      customSystemPrompt: s.customSystemPrompt,
    }))
  );
  const toggleTool = useAgentStore((s) => s.toggleTool);
  const setSelectedModel = useAgentStore((s) => s.setSelectedModel);
  const setThreadMode = useAgentStore((s) => s.setThreadMode);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);
  const [shareOpen, setShareOpen] = useState(false);

  const hasCustomPrompt = !!customSystemPrompt;

  const current = MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0];
  const CurrentIcon = MODEL_ICONS[current.icon];
  const ActiveModeIcon =
    threadMode === 'eigener'
      ? Settings
      : (MODE_CONFIG.find((m) => m.mode === threadMode)?.Icon ?? MessageSquare);

  const eigenerBadgeLabel = firstName ? `${firstName}s Chat` : 'Eigener';

  const handleModeChange = (value: string) => {
    if (value === 'eigener' && !hasCustomPrompt) return;
    setThreadMode(value as ThreadMode);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={composerToolbarButtonClass}>
            <Wrench className="h-4 w-4" />
            {threadMode !== 'chat' && (
              <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                {threadMode === 'eigener'
                  ? eigenerBadgeLabel
                  : MODE_CONFIG.find((m) => m.mode === threadMode)?.label}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="top" align="start" className="w-48">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ActiveModeIcon className="h-3.5 w-3.5" />
              Modus
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={threadMode} onValueChange={handleModeChange}>
                {MODE_CONFIG.map(({ mode, label, Icon }) => (
                  <DropdownMenuRadioItem key={mode} value={mode}>
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
                <DropdownMenuRadioItem value="eigener" disabled={!hasCustomPrompt} className="pr-1">
                  <Settings className="h-3.5 w-3.5" />
                  <span className="flex-1">Eigener Chat</span>
                  {onNavigate && (
                    <button
                      type="button"
                      className="ml-1 rounded p-0.5 text-foreground-muted hover:text-foreground hover:bg-hover-overlay transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('/chat/settings');
                      }}
                      aria-label="Eigenen Chat bearbeiten"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                  )}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>

              {!hasCustomPrompt && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5">
                    <p className="text-[11px] text-foreground-muted">Noch nicht konfiguriert.</p>
                    {onNavigate && (
                      <button
                        type="button"
                        className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-500 transition-colors"
                        onClick={() => onNavigate('/chat/settings')}
                      >
                        <Settings className="h-3 w-3" />
                        Jetzt einrichten
                      </button>
                    )}
                  </div>
                </>
              )}

              {threadMode === 'notebook' && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1">
                    <select
                      value={selectedNotebookId}
                      onChange={(e) => setSelectedNotebook(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-1.5 py-0.5 text-[11px] text-foreground"
                    >
                      {notebookMentionables.map((nb) => (
                        <option key={nb.identifier} value={nb.identifier}>
                          {nb.avatar} {nb.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Wrench className="h-3.5 w-3.5" />
              Werkzeuge
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TOOL_CONFIG.map(({ key, label, Icon }) => (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={enabledTools[key]}
                  onCheckedChange={() => toggleTool(key)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CurrentIcon className="h-3.5 w-3.5" />
              Modell
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={selectedModel}
                onValueChange={(v) => setSelectedModel(v as typeof selectedModel)}
              >
                {MODEL_OPTIONS.map((model) => {
                  const Icon = MODEL_ICONS[model.icon];
                  return (
                    <DropdownMenuRadioItem key={model.id} value={model.id}>
                      <Icon className="h-3.5 w-3.5" />
                      {model.name}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {threadId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShareOpen(true)}>
                <Share2 className="h-3.5 w-3.5" />
                Teilen
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ShareThreadDialog threadId={threadId} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
