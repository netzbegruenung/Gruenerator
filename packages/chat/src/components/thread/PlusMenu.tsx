'use client';

import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
  ResponsiveMenuToggle,
} from '@gruenerator/ui';
import {
  Check,
  ExternalLink,
  FileText,
  Globe,
  LayoutTemplate,
  Library,
  MessageSquare,
  Paperclip,
  Plug,
  PlusIcon,
  Settings,
  Telescope,
  Wand2,
  Zap,
} from 'lucide-react';
import { memo, useState } from 'react';

import { COMPOSER_TOOLS, type ComposerToolIconKey } from '../../lib/composerControls';
import { resolveMentionable, type Mentionable } from '../../lib/mentionables';
import {
  connectorId,
  connectorMentionables,
  creationMentionables,
  quickSkillMentionables,
} from '../../lib/plusMenu';
import {
  useScopedThreadMode,
  useScopedCustomRoleRef,
  useScopedCustomSystemPrompt,
  useScopedSetThreadMode,
  useScopedSetCustomSystemPrompt,
  useScopedSetCustomRoleName,
  useScopedSetCustomRoleRef,
} from '../../lib/useScopedAgentState';
import { composerToolbarButtonClass } from '../../lib/utils';
import { useAgentStore } from '../../stores/chatStore';
import { useSkillFavoritesStore } from '../../stores/skillFavoritesStore';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { SkillLibraryModal } from '../skills/SkillLibraryModal';

import { useChatDensity } from './chatDensityContext';

export interface ComposerPreset {
  key: string;
  title: string;
  text: string;
}

interface PlusMenuProps {
  onInsertMention: (mentionable: Mentionable) => void;
  /** Opens the file panel, which carries the local upload as its first row. */
  onOpenFileBrowser: () => void;
  onOpenSkillsPage?: () => void;
  /** Surface-specific prompt presets shown as a "Vorlagen" submenu. */
  presets?: ComposerPreset[];
  onApplyPreset?: (text: string) => void;
  /** Include the thread-scoped sections (Rollen, and the switch group) that only
   * make sense on a full chat surface. Assistant surfaces pass false. */
  includeModes?: boolean;
  onNavigate?: (path: string) => void;
  firstName?: string | null;
  insideAgent?: boolean;
}

const activeClass = 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300';

/**
 * Semantic icon key → component, for the switch group. The keys live in the
 * shared `COMPOSER_TOOLS` registry (which must stay renderer-agnostic so React
 * Native can read it); this map is web's half of that contract.
 */
const TOOL_ICONS: Record<ComposerToolIconKey, React.ComponentType<{ className?: string }>> = {
  globe: Globe,
  research: Telescope,
  document: FileText,
};

/** Grey secondary text next to a row's label. */
const Hint = ({ children }: { children: React.ReactNode }) => (
  <span className="truncate text-xs text-foreground-muted">{children}</span>
);

export const PlusMenu = memo(function PlusMenu({
  onInsertMention,
  onOpenFileBrowser,
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
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  // Own agents and learned recipes were reachable only via typeahead before.
  const allQuickSkills = quickSkillMentionables(favorites);
  const creationItems = creationMentionables();

  const mcpConnectors = connectorMentionables();
  const pinnedConnector = useAgentStore((s) => s.pinnedConnector);
  const setPinnedConnector = useAgentStore((s) => s.setPinnedConnector);
  const enabledTools = useAgentStore((s) => s.enabledTools);
  const toggleTool = useAgentStore((s) => s.toggleTool);

  // Pin (not one-off insert) a connector so its MCP scope holds across
  // follow-ups; selecting the pinned one again unpins.
  const togglePinnedConnector = (connector: Mentionable) => {
    const id = connectorId(connector);
    if (pinnedConnector?.id === id) {
      setPinnedConnector(null);
      return;
    }
    setPinnedConnector({ id, label: connector.title });
  };

  const threadMode = useScopedThreadMode();
  const customSystemPrompt = useScopedCustomSystemPrompt();
  const setThreadMode = useScopedSetThreadMode();
  const setCustomSystemPrompt = useScopedSetCustomSystemPrompt();
  const setCustomRoleName = useScopedSetCustomRoleName();
  const setCustomRoleRef = useScopedSetCustomRoleRef();
  const customRoleRef = useScopedCustomRoleRef();
  const roles = useUserProfileStore((s) => s.roles);

  const showModes = includeModes && !insideAgent;
  // Eine Katalogrolle bringt keinen Prompttext mit — ihr Auftrag ist
  // parteiintern und wird server-seitig aufgelöst. „Eigener Chat" ist deshalb
  // aktiv, sobald das eine ODER das andere gesetzt ist.
  const hasCustomPrompt = !!customSystemPrompt || !!customRoleRef;
  const hasRoles = roles.length > 0;

  const activeRoleName =
    threadMode === 'eigener' && hasRoles
      ? (
          roles.find((r) => r.ebene === customRoleRef?.ebene && r.rolle === customRoleRef?.rolle) ??
          roles.find((r) => r.systemPrompt && r.systemPrompt === customSystemPrompt)
        )?.rolle
      : null;
  const eigenerBadgeLabel = activeRoleName || (firstName ? `${firstName}s Chat` : 'Eigener');

  const selectChatMode = () => {
    setCustomRoleName(null);
    setCustomRoleRef(null);
    setThreadMode('chat');
  };

  const selectRole = (roleIndex: number) => {
    const role = roles[roleIndex];
    if (!role) return;
    // Katalogrolle: nur die Referenz, der Auftrag kommt vom Server. Frei
    // eingetippte Rollen tragen weiterhin ihren KI-erzeugten Text.
    setCustomRoleRef({ ebene: role.ebene, rolle: role.rolle });
    setCustomSystemPrompt(role.systemPrompt ?? null);
    setCustomRoleName(role.rolle);
    setThreadMode('eigener');
  };

  const selectEigener = () => {
    if (!hasCustomPrompt) return;
    setThreadMode('eigener');
  };

  const handleMobileAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const isRoleActive = (roleIndex: number): boolean => {
    const role = roles[roleIndex];
    return (
      threadMode === 'eigener' &&
      !!role &&
      role.ebene === customRoleRef?.ebene &&
      role.rolle === customRoleRef?.rolle
    );
  };

  const rolesEntry = onNavigate ? (
    <DropdownMenuItem onSelect={() => onNavigate('/dein-gruenerator')}>
      <Settings className="h-3.5 w-3.5" />
      <span className="flex-1">Rollen einrichten</span>
    </DropdownMenuItem>
  ) : null;

  const activeConnectorCount = pinnedConnector ? 1 : 0;

  // ── Group 1: add context ───────────────────────────────────────────────────
  // Eine Zeile statt drei: das Hochladen steht als erste Zeile im Dateipanel
  // selbst, und einen Link fügt man schneller ein, als man ihn im Menü sucht.
  const desktopAttachItems = (
    <DropdownMenuItem onClick={onOpenFileBrowser}>
      <Paperclip className="h-3.5 w-3.5" />
      <span className="flex-1">Datei hinzufügen</span>
      <Hint>Hochladen, Dokumente, Notizbücher</Hint>
    </DropdownMenuItem>
  );

  // ── Group 2: namespaces ────────────────────────────────────────────────────
  const desktopNamespaceItems = (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Wand2 className="h-3.5 w-3.5" />
          Rezepte
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
            Alle Rezepte durchsuchen…
          </DropdownMenuItem>
          {onOpenSkillsPage && (
            <DropdownMenuItem onClick={onOpenSkillsPage}>
              <ExternalLink className="h-3.5 w-3.5" />
              Zur Rezept-Bibliothek
            </DropdownMenuItem>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      {showModes && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={threadMode === 'eigener' ? activeClass : ''}>
            <Settings className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Rollen</span>
            {threadMode === 'eigener' && <Hint>{eigenerBadgeLabel}</Hint>}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
            <DropdownMenuItem
              onSelect={selectChatMode}
              className={threadMode === 'chat' ? activeClass : ''}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="flex-1">Ohne Rolle</span>
              {threadMode === 'chat' && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {hasRoles ? (
              roles.map((role, i) => (
                <DropdownMenuItem
                  key={`role-${i}`}
                  onSelect={() => selectRole(i)}
                  className={isRoleActive(i) ? activeClass : ''}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{role.rolle}</span>
                  {isRoleActive(i) && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))
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
      )}

      {mcpConnectors.length > 0 && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={pinnedConnector ? activeClass : ''}>
            <Plug className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Konnektoren</span>
            {activeConnectorCount > 0 && <Hint>{`${activeConnectorCount} an`}</Hint>}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
            {mcpConnectors.map((connector) => {
              const isActive = pinnedConnector?.id === connectorId(connector);
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
          <Zap className="h-3.5 w-3.5" />
          <span className="flex-1">Erstellen</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
          {creationItems.map((tool) => {
            const Icon = tool.icon;
            return (
              <DropdownMenuItem
                key={`${tool.type}:${tool.mention}`}
                onClick={() => onInsertMention(tool)}
              >
                {Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
                {tool.title}
              </DropdownMenuItem>
            );
          })}
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
    </>
  );

  // ── Group 3: switches ──────────────────────────────────────────────────────
  // A `toggle` row keeps the menu open (`onSelect` preventDefault) because
  // flipping two of these in a row is the normal case; a `once` row closes it,
  // since it has just written into the composer.
  const desktopToolItems = showModes ? (
    <>
      {COMPOSER_TOOLS.map((tool) => {
        const Icon = TOOL_ICONS[tool.icon];
        if (tool.kind === 'toggle') {
          return (
            <DropdownMenuCheckboxItem
              key={tool.key}
              indicatorSide="right"
              checked={enabledTools[tool.key] !== false}
              onCheckedChange={() => toggleTool(tool.key)}
              onSelect={(e) => e.preventDefault()}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="flex-1">{tool.label}</span>
              <Hint>{tool.description}</Hint>
            </DropdownMenuCheckboxItem>
          );
        }
        const mentionable = resolveMentionable(tool.mention);
        if (!mentionable) return null;
        return (
          <DropdownMenuItem key={tool.mention} onClick={() => onInsertMention(mentionable)}>
            <Icon className="h-3.5 w-3.5" />
            <span className="flex-1">{tool.label}</span>
            <Hint>{tool.description}</Hint>
          </DropdownMenuItem>
        );
      })}
    </>
  ) : null;

  const desktopContent = (
    <>
      {desktopAttachItems}
      <DropdownMenuSeparator />
      {desktopNamespaceItems}
      {desktopToolItems && (
        <>
          <DropdownMenuSeparator />
          {desktopToolItems}
        </>
      )}
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
      <ResponsiveMenuSection title="Hinzufügen">
        <ResponsiveMenuItem
          icon={<Paperclip />}
          onClick={() => handleMobileAction(onOpenFileBrowser)}
        >
          Datei hinzufügen
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Rezepte">
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
          Alle Rezepte durchsuchen…
        </ResponsiveMenuItem>
        {onOpenSkillsPage && (
          <ResponsiveMenuItem
            icon={<ExternalLink />}
            onClick={() => {
              setMenuOpen(false);
              onOpenSkillsPage();
            }}
          >
            Zur Rezept-Bibliothek
          </ResponsiveMenuItem>
        )}
      </ResponsiveMenuSection>

      {showModes && (
        <ResponsiveMenuSection title="Rollen">
          <ResponsiveMenuItem
            icon={<MessageSquare />}
            active={threadMode === 'chat'}
            onClick={() => handleMobileAction(selectChatMode)}
          >
            Ohne Rolle
          </ResponsiveMenuItem>
          {hasRoles ? (
            roles.map((role, i) => (
              <ResponsiveMenuItem
                key={`role-${i}`}
                icon={<Settings />}
                active={isRoleActive(i)}
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

      {mcpConnectors.length > 0 && (
        <ResponsiveMenuSection title="Konnektoren">
          {mcpConnectors.map((connector) => (
            <ResponsiveMenuItem
              key={connector.identifier}
              icon={<Plug />}
              active={pinnedConnector?.id === connectorId(connector)}
              onClick={() => handleMobileAction(() => togglePinnedConnector(connector))}
            >
              {connector.title}
            </ResponsiveMenuItem>
          ))}
        </ResponsiveMenuSection>
      )}

      <ResponsiveMenuSection title="Erstellen">
        {creationItems.map((tool) => {
          const Icon = tool.icon;
          return (
            <ResponsiveMenuItem
              key={`${tool.type}:${tool.mention}`}
              icon={Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null}
              onClick={() => handleMobileAction(() => onInsertMention(tool))}
            >
              {tool.title}
            </ResponsiveMenuItem>
          );
        })}
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

      {showModes && (
        <ResponsiveMenuSection title="Werkzeuge">
          {COMPOSER_TOOLS.map((tool) => {
            const Icon = TOOL_ICONS[tool.icon];
            if (tool.kind === 'toggle') {
              return (
                <ResponsiveMenuToggle
                  key={tool.key}
                  icon={<Icon />}
                  label={tool.label}
                  checked={enabledTools[tool.key] !== false}
                  onCheckedChange={() => toggleTool(tool.key)}
                />
              );
            }
            const mentionable = resolveMentionable(tool.mention);
            if (!mentionable) return null;
            return (
              <ResponsiveMenuItem
                key={tool.mention}
                icon={<Icon />}
                onClick={() => handleMobileAction(() => onInsertMention(mentionable))}
              >
                {tool.label}
              </ResponsiveMenuItem>
            );
          })}
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

  const showModeBadge = showModes && threadMode === 'eigener';

  return (
    <>
      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        sheetTitle="Aktionen"
        dropdownClassName="w-[22rem]"
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
            {showModeBadge && (
              <span className="max-w-32 truncate text-[12px] font-medium tracking-tight">
                {eigenerBadgeLabel}
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
