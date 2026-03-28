'use client';

import { memo, useState } from 'react';
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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
  ResponsiveMenuToggle,
} from '@gruenerator/ui';
import { cn, composerToolbarButtonClass } from '../lib/utils';
import { MODEL_ICONS } from '../lib/modelIcons';
import { useShallow } from 'zustand/shallow';
import { useAgentStore, MODEL_OPTIONS, type ThreadMode, type ToolKey } from '../stores/chatStore';
import { useUserProfileStore } from '../stores/userProfileStore';
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

export const ToolToggles = memo(function ToolToggles({ onNavigate, firstName }: ToolTogglesProps) {
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
  const [menuOpen, setMenuOpen] = useState(false);

  const roles = useUserProfileStore((s) => s.roles);
  const hasCustomPrompt = !!customSystemPrompt;
  const hasRoles = roles.length > 0;

  const current = MODEL_OPTIONS.find((m) => m.id === selectedModel) ?? MODEL_OPTIONS[0];
  const CurrentIcon = MODEL_ICONS[current.icon];
  const ActiveModeIcon =
    threadMode === 'eigener'
      ? Settings
      : (MODE_CONFIG.find((m) => m.mode === threadMode)?.Icon ?? MessageSquare);

  const setCustomSystemPrompt = useAgentStore((s) => s.setCustomSystemPrompt);

  const activeRoleName =
    threadMode === 'eigener' && hasRoles
      ? roles.find((r) => r.systemPrompt === customSystemPrompt)?.rolle
      : null;
  const eigenerBadgeLabel = activeRoleName || (firstName ? `${firstName}s Chat` : 'Eigener');

  const handleModeChange = (value: string) => {
    if (value === 'eigener' && !hasCustomPrompt && !hasRoles) return;
    if (value.startsWith('role:')) {
      const roleIndex = parseInt(value.slice(5), 10);
      const role = roles[roleIndex];
      if (role?.systemPrompt) {
        setCustomSystemPrompt(role.systemPrompt);
        setThreadMode('eigener');
      }
      return;
    }
    if (value !== 'eigener') {
      setThreadMode(value as ThreadMode);
    }
  };

  const desktopContent = (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ActiveModeIcon className="h-3.5 w-3.5" />
          Modus
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={
              threadMode === 'eigener' && hasRoles
                ? `role:${roles.findIndex((r) => r.systemPrompt === customSystemPrompt)}`
                : threadMode
            }
            onValueChange={handleModeChange}
          >
            {MODE_CONFIG.map(({ mode, label, Icon }) => (
              <DropdownMenuRadioItem key={mode} value={mode}>
                <Icon className="h-3.5 w-3.5" />
                {label}
              </DropdownMenuRadioItem>
            ))}
            {hasRoles ? (
              roles.map((role, i) => (
                <DropdownMenuRadioItem key={`role-${i}`} value={`role:${i}`} className="pr-1">
                  <Settings className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{role.rolle}</span>
                </DropdownMenuRadioItem>
              ))
            ) : (
              <DropdownMenuRadioItem value="eigener" disabled={!hasCustomPrompt} className="pr-1">
                <Settings className="h-3.5 w-3.5" />
                <span className="flex-1">Eigener Chat</span>
              </DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>

          {!hasRoles && !hasCustomPrompt && onNavigate && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] font-medium text-primary-600 hover:text-primary-500 transition-colors"
                  onClick={() => onNavigate('/dein-gruenerator')}
                >
                  <Settings className="h-3 w-3" />
                  Rollen einrichten
                </button>
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
    </>
  );

  const mobileContent = (
    <>
      <ResponsiveMenuSection title="Modus">
        {MODE_CONFIG.map(({ mode, label, Icon }) => (
          <ResponsiveMenuItem
            key={mode}
            icon={<Icon />}
            active={threadMode === mode}
            onClick={() => handleModeChange(mode)}
          >
            {label}
          </ResponsiveMenuItem>
        ))}
        {hasRoles ? (
          roles.map((role, i) => (
            <ResponsiveMenuItem
              key={`role-${i}`}
              icon={<Settings />}
              active={threadMode === 'eigener' && role.systemPrompt === customSystemPrompt}
              onClick={() => handleModeChange(`role:${i}`)}
            >
              {role.rolle}
            </ResponsiveMenuItem>
          ))
        ) : (
          <ResponsiveMenuItem
            icon={<Settings />}
            active={threadMode === 'eigener'}
            disabled={!hasCustomPrompt}
            onClick={() => handleModeChange('eigener')}
          >
            {eigenerBadgeLabel}
          </ResponsiveMenuItem>
        )}

        {threadMode === 'notebook' && (
          <div className="mt-2 px-3">
            <select
              value={selectedNotebookId}
              onChange={(e) => setSelectedNotebook(e.target.value)}
              className="w-full rounded-lg border border-grey-200 dark:border-grey-700 bg-background px-2.5 py-2 text-sm text-foreground"
            >
              {notebookMentionables.map((nb) => (
                <option key={nb.identifier} value={nb.identifier}>
                  {nb.avatar} {nb.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Werkzeuge">
        {TOOL_CONFIG.map(({ key, label, Icon }) => (
          <ResponsiveMenuToggle
            key={key}
            icon={<Icon />}
            label={label}
            checked={enabledTools[key]}
            onCheckedChange={() => toggleTool(key)}
          />
        ))}
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Modell">
        {MODEL_OPTIONS.map((model) => {
          const Icon = MODEL_ICONS[model.icon];
          return (
            <ResponsiveMenuItem
              key={model.id}
              icon={<Icon />}
              active={selectedModel === model.id}
              onClick={() => setSelectedModel(model.id as typeof selectedModel)}
            >
              {model.name}
            </ResponsiveMenuItem>
          );
        })}
      </ResponsiveMenuSection>

      {threadId && (
        <ResponsiveMenuSection title="Teilen">
          <ResponsiveMenuItem
            icon={<Share2 />}
            onClick={() => {
              setMenuOpen(false);
              setShareOpen(true);
            }}
          >
            Unterhaltung teilen
          </ResponsiveMenuItem>
        </ResponsiveMenuSection>
      )}
    </>
  );

  return (
    <>
      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        sheetTitle="Einstellungen"
        trigger={
          <button type="button" className={composerToolbarButtonClass}>
            <Wrench className="h-4 w-4" />
            {threadMode !== 'chat' && (
              <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-700 dark:bg-primary-900/30 dark:text-primary-400 max-w-24 truncate">
                {threadMode === 'eigener'
                  ? eigenerBadgeLabel
                  : MODE_CONFIG.find((m) => m.mode === threadMode)?.label}
              </span>
            )}
          </button>
        }
        desktopContent={desktopContent}
        mobileContent={mobileContent}
      />

      <ShareThreadDialog threadId={threadId} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
});
