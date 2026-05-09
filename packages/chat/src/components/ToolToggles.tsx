'use client';

import { memo } from 'react';
import { Wrench, MessageSquare, BookOpen, Settings } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { composerToolbarButtonClass } from '../lib/utils';
import { useChatDensity } from './thread/chatDensityContext';
import { useShallow } from 'zustand/shallow';
import { useAgentStore, type ThreadMode } from '../stores/chatStore';
import { useUserProfileStore } from '../stores/userProfileStore';
import { notebookMentionables } from '../lib/mentionables';

const MODE_CONFIG: Array<{
  mode: ThreadMode;
  label: string;
  Icon: typeof MessageSquare;
}> = [
  { mode: 'chat', label: 'Chat', Icon: MessageSquare },
];

interface ToolTogglesProps {
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  insideAgent?: boolean;
}

export const ToolToggles = memo(function ToolToggles({
  onNavigate,
  firstName,
  insideAgent = false,
}: ToolTogglesProps) {
  const isCompact = useChatDensity() === 'compact';
  const { threadMode, selectedNotebookId, customSystemPrompt } = useAgentStore(
    useShallow((s) => ({
      threadMode: s.threadMode,
      selectedNotebookId: s.selectedNotebookId,
      customSystemPrompt: s.customSystemPrompt,
    }))
  );
  const setThreadMode = useAgentStore((s) => s.setThreadMode);
  const setSelectedNotebook = useAgentStore((s) => s.setSelectedNotebook);
  const setCustomSystemPrompt = useAgentStore((s) => s.setCustomSystemPrompt);
  const setCustomRoleName = useAgentStore((s) => s.setCustomRoleName);

  const roles = useUserProfileStore((s) => s.roles);
  const hasCustomPrompt = !!customSystemPrompt;
  const hasRoles = roles.length > 0;

  const activeNotebookLabel =
    threadMode === 'notebook'
      ? (notebookMentionables.find((nb) => nb.identifier === selectedNotebookId)?.title ??
        'Notebook')
      : null;

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
        setCustomRoleName(role.rolle);
        setThreadMode('eigener');
      }
      return;
    }
    if (value.startsWith('notebook:')) {
      const id = value.slice('notebook:'.length);
      setSelectedNotebook(id);
      setCustomRoleName(null);
      setThreadMode('notebook');
      return;
    }
    if (value !== 'eigener') {
      setCustomRoleName(null);
      setThreadMode(value as ThreadMode);
    }
  };

  const activeClass = 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300';

  const rolesEntry = onNavigate ? (
    <DropdownMenuItem onSelect={() => onNavigate('/dein-gruenerator')}>
      <Settings className="h-3.5 w-3.5" />
      <span className="flex-1">Rollen einrichten</span>
    </DropdownMenuItem>
  ) : null;

  const rolesEntryMobile = onNavigate ? (
    <ResponsiveMenuItem icon={<Settings />} onClick={() => onNavigate('/dein-gruenerator')}>
      Rollen einrichten
    </ResponsiveMenuItem>
  ) : null;

  const desktopContent = insideAgent ? (
    <>{rolesEntry}</>
  ) : (
    <>
      {MODE_CONFIG.map(({ mode, label, Icon }) => (
        <DropdownMenuItem
          key={mode}
          onSelect={() => handleModeChange(mode)}
          className={threadMode === mode ? activeClass : ''}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </DropdownMenuItem>
      ))}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={threadMode === 'notebook' ? activeClass : ''}>
          <BookOpen className="h-3.5 w-3.5" />
          <span className="flex-1 truncate">
            {threadMode === 'notebook' ? activeNotebookLabel : 'Notebooks'}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {notebookMentionables.map((nb) => {
            const isActive = threadMode === 'notebook' && selectedNotebookId === nb.identifier;
            return (
              <DropdownMenuItem
                key={`notebook-${nb.identifier}`}
                onSelect={() => handleModeChange(`notebook:${nb.identifier}`)}
                className={isActive ? activeClass : ''}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span className="flex-1 truncate">{nb.title}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {hasRoles ? (
        roles.map((role, i) => {
          const isActive = threadMode === 'eigener' && role.systemPrompt === customSystemPrompt;
          return (
            <DropdownMenuItem
              key={`role-${i}`}
              onSelect={() => handleModeChange(`role:${i}`)}
              className={isActive ? activeClass : ''}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="flex-1 truncate">{role.rolle}</span>
            </DropdownMenuItem>
          );
        })
      ) : (
        <DropdownMenuItem
          disabled={!hasCustomPrompt}
          onSelect={() => handleModeChange('eigener')}
          className={threadMode === 'eigener' ? activeClass : ''}
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="flex-1">Eigener Chat</span>
        </DropdownMenuItem>
      )}

      {!hasRoles && !hasCustomPrompt && onNavigate && (
        <>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5">
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-medium text-primary-600 transition-colors hover:text-primary-500"
              onClick={() => onNavigate('/dein-gruenerator')}
            >
              <Settings className="h-3 w-3" />
              Rollen einrichten
            </button>
          </div>
        </>
      )}
    </>
  );

  const mobileContent = insideAgent ? (
    <ResponsiveMenuSection title="Profil">{rolesEntryMobile}</ResponsiveMenuSection>
  ) : (
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
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Notebooks">
        {notebookMentionables.map((nb) => (
          <ResponsiveMenuItem
            key={`notebook-${nb.identifier}`}
            icon={<BookOpen />}
            active={threadMode === 'notebook' && selectedNotebookId === nb.identifier}
            onClick={() => handleModeChange(`notebook:${nb.identifier}`)}
          >
            {nb.title}
          </ResponsiveMenuItem>
        ))}
      </ResponsiveMenuSection>
    </>
  );

  const showModeBadge = !insideAgent && threadMode !== 'chat';

  return (
    <ResponsiveMenu
      sheetTitle={insideAgent ? 'Profil' : 'Modus'}
      trigger={
        <button
          type="button"
          className={`${composerToolbarButtonClass(isCompact)} ${
            showModeBadge
              ? 'rounded-full border border-primary-200 text-primary-700 dark:border-primary-400/30 dark:text-primary-300'
              : ''
          }`}
        >
          <Wrench className="h-4 w-4" />
          {showModeBadge && (
            <span className="max-w-32 truncate text-[12px] font-medium tracking-tight">
              {threadMode === 'eigener'
                ? eigenerBadgeLabel
                : threadMode === 'notebook'
                  ? activeNotebookLabel
                  : MODE_CONFIG.find((m) => m.mode === threadMode)?.label}
            </span>
          )}
        </button>
      }
      desktopContent={desktopContent}
      mobileContent={mobileContent}
    />
  );
});
