'use client';

import { memo, useState } from 'react';
import {
  BookOpen,
  Check,
  ExternalLink,
  FileSearch,
  LayoutTemplate,
  Library,
  MessageSquare,
  Paperclip,
  Plug,
  PlusIcon,
  Settings,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
} from '@gruenerator/ui';
import { composerToolbarButtonClass } from '../../lib/utils';
import { useChatDensity } from './chatDensityContext';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';
import { useUserProfileStore } from '../../stores/userProfileStore';
import {
  getAgentMentionables,
  getCustomAgentMentionables,
  getMcpServerMentionables,
  toolMentionables,
  notebookMentionables,
  type Mentionable,
} from '../../lib/mentionables';
import { useAgentStore } from '../../stores/chatStore';
import {
  useScopedThreadMode,
  useScopedSelectedNotebookId,
  useScopedCustomSystemPrompt,
  useScopedSetThreadMode,
  useScopedSetSelectedNotebook,
  useScopedSetCustomSystemPrompt,
  useScopedSetCustomRoleName,
} from '../../lib/useScopedAgentState';
import { SkillLibraryModal } from '../skills/SkillLibraryModal';

export interface ComposerPreset {
  key: string;
  title: string;
  text: string;
}

interface PlusMenuProps {
  onInsertMention: (mentionable: Mentionable) => void;
  onOpenFileBrowser: () => void;
  onUploadFile: () => void;
  onOpenSkillsPage?: () => void;
  /** Surface-specific prompt presets shown as a "Vorlagen" submenu. */
  presets?: ComposerPreset[];
  onApplyPreset?: (text: string) => void;
  /** Include the thread-mode section (Chat / Rollen) and make the Notebooks
   * submenu switch the thread mode instead of inserting a mention.
   * Replaces the former standalone ToolToggles menu. */
  includeModes?: boolean;
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  insideAgent?: boolean;
}

const activeClass = 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300';

export const PlusMenu = memo(function PlusMenu({
  onInsertMention,
  onOpenFileBrowser,
  onUploadFile,
  onOpenSkillsPage,
  presets,
  onApplyPreset,
  includeModes = false,
  onNavigate,
  firstName,
  insideAgent = false,
}: PlusMenuProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompact = useChatDensity() === 'compact';
  const customAgents = getCustomAgentMentionables();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const quickSkills = getAgentMentionables().filter(
    (a) => a.isSystemDefault || favorites.includes(a.mention.toLowerCase())
  );
  const allQuickSkills = [...quickSkills, ...customAgents];

  const mcpConnectors = getMcpServerMentionables();
  const pinnedConnector = useAgentStore((s) => s.pinnedConnector);
  const setPinnedConnector = useAgentStore((s) => s.setPinnedConnector);

  // Pin (not one-off insert) a connector so its MCP scope holds across
  // follow-ups; selecting the pinned one again unpins.
  const togglePinnedConnector = (connector: Mentionable) => {
    const id = connector.identifier.slice(4); // strip 'mcp:'
    if (pinnedConnector?.id === id) {
      setPinnedConnector(null);
      return;
    }
    setPinnedConnector({ id, label: connector.title });
  };

  const threadMode = useScopedThreadMode();
  const selectedNotebookId = useScopedSelectedNotebookId();
  const customSystemPrompt = useScopedCustomSystemPrompt();
  const setThreadMode = useScopedSetThreadMode();
  const setSelectedNotebook = useScopedSetSelectedNotebook();
  const setCustomSystemPrompt = useScopedSetCustomSystemPrompt();
  const setCustomRoleName = useScopedSetCustomRoleName();
  const roles = useUserProfileStore((s) => s.roles);

  const showModes = includeModes && !insideAgent;
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

  const selectChatMode = () => {
    setCustomRoleName(null);
    setThreadMode('chat');
  };

  const selectRole = (roleIndex: number) => {
    const role = roles[roleIndex];
    if (role?.systemPrompt) {
      setCustomSystemPrompt(role.systemPrompt);
      setCustomRoleName(role.rolle);
      setThreadMode('eigener');
    }
  };

  const selectEigener = () => {
    if (!hasCustomPrompt) return;
    setThreadMode('eigener');
  };

  // One notebook list for both former entry points ("Quellen" mention insert
  // and ToolToggles thread mode): with modes it scopes the thread to the
  // notebook; without (assistant surfaces) it inserts the mention as before.
  const selectNotebook = (notebook: Mentionable) => {
    if (showModes) {
      setSelectedNotebook(notebook.identifier);
      setCustomRoleName(null);
      setThreadMode('notebook');
      return;
    }
    onInsertMention(notebook);
  };

  const handleMobileAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const rolesEntry = onNavigate ? (
    <DropdownMenuItem onSelect={() => onNavigate('/dein-gruenerator')}>
      <Settings className="h-3.5 w-3.5" />
      <span className="flex-1">Rollen einrichten</span>
    </DropdownMenuItem>
  ) : null;

  const desktopModeItems = showModes ? (
    <>
      <DropdownMenuItem
        onSelect={selectChatMode}
        className={threadMode === 'chat' ? activeClass : ''}
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Chat
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className={threadMode === 'eigener' ? activeClass : ''}>
          <Settings className="h-3.5 w-3.5" />
          <span className="flex-1 truncate">
            {threadMode === 'eigener' ? eigenerBadgeLabel : 'Rollen'}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
          {hasRoles ? (
            roles.map((role, i) => {
              const isActive = threadMode === 'eigener' && role.systemPrompt === customSystemPrompt;
              return (
                <DropdownMenuItem
                  key={`role-${i}`}
                  onSelect={() => selectRole(i)}
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
              onSelect={selectEigener}
              className={threadMode === 'eigener' ? activeClass : ''}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="flex-1">Eigener Chat</span>
            </DropdownMenuItem>
          )}
          {onNavigate && (
            <>
              <DropdownMenuSeparator />
              {rolesEntry}
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
    </>
  ) : null;

  const desktopContent = (
    <>
      {desktopModeItems}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Wand2 className="h-3.5 w-3.5" />
          Skills
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
          {allQuickSkills.map((skill) => {
            const Icon = skill.icon;
            return (
              <DropdownMenuItem key={skill.mention} onClick={() => onInsertMention(skill)}>
                {Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
                {skill.title}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
            <Library className="h-3.5 w-3.5" />
            Alle Skills durchsuchen...
          </DropdownMenuItem>
          {onOpenSkillsPage && (
            <DropdownMenuItem onClick={onOpenSkillsPage}>
              <ExternalLink className="h-3.5 w-3.5" />
              Zur Skill-Bibliothek
            </DropdownMenuItem>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {presets && presets.length > 0 && onApplyPreset && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LayoutTemplate className="h-3.5 w-3.5" />
            Vorlagen
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
            {presets.map((preset) => (
              <DropdownMenuItem key={preset.key} onClick={() => onApplyPreset(preset.text)}>
                {preset.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className={showModes && threadMode === 'notebook' ? activeClass : ''}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span className="flex-1 truncate">
            {showModes && threadMode === 'notebook' ? activeNotebookLabel : 'Notebooks'}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
          {notebookMentionables.map((notebook) => {
            const NbIcon = notebook.icon ?? BookOpen;
            const isActive =
              showModes && threadMode === 'notebook' && selectedNotebookId === notebook.identifier;
            return (
              <DropdownMenuItem
                key={notebook.identifier}
                onClick={() => selectNotebook(notebook)}
                className={isActive ? activeClass : ''}
              >
                <NbIcon className="h-3.5 w-3.5" />
                <span className="flex-1">{notebook.title}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Zap className="h-3.5 w-3.5" />
          Funktionen
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {toolMentionables.map((tool) => {
            const Icon = tool.icon;
            return (
              <DropdownMenuItem key={tool.identifier} onClick={() => onInsertMention(tool)}>
                {Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
                {tool.title}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {mcpConnectors.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={pinnedConnector ? activeClass : ''}>
            <Plug className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">
              {pinnedConnector ? pinnedConnector.label : 'Konnektoren'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
            {mcpConnectors.map((connector) => {
              const isActive = pinnedConnector?.id === connector.identifier.slice(4);
              return (
                <DropdownMenuItem
                  key={connector.identifier}
                  onClick={() => togglePinnedConnector(connector)}
                  className={isActive ? activeClass : ''}
                >
                  <Plug className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{connector.title}</span>
                  {isActive && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Paperclip className="h-3.5 w-3.5" />
          Dateien
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={onUploadFile}>
            <Upload className="h-3.5 w-3.5" />
            Datei hochladen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenFileBrowser}>
            <FileSearch className="h-3.5 w-3.5" />
            Dokument
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {includeModes && insideAgent && rolesEntry && (
        <>
          <DropdownMenuSeparator />
          {rolesEntry}
        </>
      )}
    </>
  );

  const mobileContent = (
    <>
      {showModes && (
        <ResponsiveMenuSection title="Modus">
          <ResponsiveMenuItem
            icon={<MessageSquare />}
            active={threadMode === 'chat'}
            onClick={() => handleMobileAction(selectChatMode)}
          >
            Chat
          </ResponsiveMenuItem>
          {hasRoles ? (
            roles.map((role, i) => (
              <ResponsiveMenuItem
                key={`role-${i}`}
                icon={<Settings />}
                active={threadMode === 'eigener' && role.systemPrompt === customSystemPrompt}
                onClick={() => handleMobileAction(() => selectRole(i))}
              >
                {role.rolle}
              </ResponsiveMenuItem>
            ))
          ) : (
            <ResponsiveMenuItem
              icon={<Settings />}
              active={threadMode === 'eigener'}
              disabled={!hasCustomPrompt}
              onClick={() => handleMobileAction(selectEigener)}
            >
              {eigenerBadgeLabel}
            </ResponsiveMenuItem>
          )}
          {onNavigate && (
            <ResponsiveMenuItem
              icon={<Settings />}
              onClick={() => handleMobileAction(() => onNavigate('/dein-gruenerator'))}
            >
              Rollen einrichten
            </ResponsiveMenuItem>
          )}
        </ResponsiveMenuSection>
      )}

      <ResponsiveMenuSection title="Dateien">
        <ResponsiveMenuItem icon={<Upload />} onClick={() => handleMobileAction(onUploadFile)}>
          Datei hochladen
        </ResponsiveMenuItem>
        <ResponsiveMenuItem
          icon={<FileSearch />}
          onClick={() => handleMobileAction(onOpenFileBrowser)}
        >
          Dokument
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Skills">
        {allQuickSkills.map((skill) => {
          const Icon = skill.icon;
          return (
            <ResponsiveMenuItem
              key={skill.mention}
              icon={Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
              onClick={() => handleMobileAction(() => onInsertMention(skill))}
            >
              {skill.title}
            </ResponsiveMenuItem>
          );
        })}
        <ResponsiveMenuItem
          icon={<Library />}
          onClick={() => {
            setMenuOpen(false);
            setLibraryOpen(true);
          }}
        >
          Alle Skills durchsuchen...
        </ResponsiveMenuItem>
        {onOpenSkillsPage && (
          <ResponsiveMenuItem
            icon={<ExternalLink />}
            onClick={() => {
              setMenuOpen(false);
              onOpenSkillsPage();
            }}
          >
            Zur Skill-Bibliothek
          </ResponsiveMenuItem>
        )}
      </ResponsiveMenuSection>

      {presets && presets.length > 0 && onApplyPreset && (
        <ResponsiveMenuSection title="Vorlagen">
          {presets.map((preset) => (
            <ResponsiveMenuItem
              key={preset.key}
              icon={<LayoutTemplate />}
              onClick={() => handleMobileAction(() => onApplyPreset(preset.text))}
            >
              {preset.title}
            </ResponsiveMenuItem>
          ))}
        </ResponsiveMenuSection>
      )}

      <ResponsiveMenuSection title="Notebooks">
        {notebookMentionables.map((notebook) => {
          const NbIcon = notebook.icon ?? BookOpen;
          return (
            <ResponsiveMenuItem
              key={notebook.identifier}
              icon={<NbIcon />}
              active={
                showModes && threadMode === 'notebook' && selectedNotebookId === notebook.identifier
              }
              onClick={() => handleMobileAction(() => selectNotebook(notebook))}
            >
              {notebook.title}
            </ResponsiveMenuItem>
          );
        })}
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Funktionen">
        {toolMentionables.map((tool) => {
          const Icon = tool.icon;
          return (
            <ResponsiveMenuItem
              key={tool.identifier}
              icon={Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
              onClick={() => handleMobileAction(() => onInsertMention(tool))}
            >
              {tool.title}
            </ResponsiveMenuItem>
          );
        })}
      </ResponsiveMenuSection>

      {mcpConnectors.length > 0 && (
        <ResponsiveMenuSection title="Konnektoren">
          {mcpConnectors.map((connector) => (
            <ResponsiveMenuItem
              key={connector.identifier}
              icon={<Plug />}
              active={pinnedConnector?.id === connector.identifier.slice(4)}
              onClick={() => handleMobileAction(() => togglePinnedConnector(connector))}
            >
              {connector.title}
            </ResponsiveMenuItem>
          ))}
        </ResponsiveMenuSection>
      )}

      {includeModes && insideAgent && onNavigate && (
        <ResponsiveMenuSection title="Profil">
          <ResponsiveMenuItem
            icon={<Settings />}
            onClick={() => handleMobileAction(() => onNavigate('/dein-gruenerator'))}
          >
            Rollen einrichten
          </ResponsiveMenuItem>
        </ResponsiveMenuSection>
      )}
    </>
  );

  const showModeBadge = showModes && threadMode !== 'chat';
  const badgeLabel =
    threadMode === 'eigener'
      ? eigenerBadgeLabel
      : threadMode === 'notebook'
        ? activeNotebookLabel
        : null;

  return (
    <>
      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        sheetTitle="Aktionen"
        trigger={
          <button
            type="button"
            aria-label="Aktionen und Modus"
            className={`${composerToolbarButtonClass(isCompact)} ${
              showModeBadge
                ? 'rounded-full border border-primary-200 text-primary-700 dark:border-primary-400/30 dark:text-primary-300'
                : ''
            }`}
          >
            <PlusIcon className={isCompact ? 'h-4 w-4 stroke-[1.5px]' : 'h-5 w-5 stroke-[1.5px]'} />
            {showModeBadge && badgeLabel && (
              <span className="max-w-32 truncate text-[12px] font-medium tracking-tight">
                {badgeLabel}
              </span>
            )}
          </button>
        }
        desktopContent={desktopContent}
        mobileContent={mobileContent}
      />

      <SkillLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(m) => {
          onInsertMention(m);
          setLibraryOpen(false);
        }}
      />
    </>
  );
});
