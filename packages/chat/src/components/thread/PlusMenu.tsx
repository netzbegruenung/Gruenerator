'use client';

import { roleShortLabel } from '@gruenerator/shared/roles';
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
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LayoutTemplate,
  Library,
  MessageSquare,
  Paperclip,
  Plug,
  PlusIcon,
  Settings,
  Wand2,
  Zap,
} from 'lucide-react';
import { memo, useRef, useState } from 'react';

import { useRecipeLibrary } from '../../hooks/useRecipeLibrary';
import {
  COMPOSER_MODES_TITLE,
  COMPOSER_TOOLS,
  composerModeDef,
  type ComposerIconKey,
} from '../../lib/composerControls';
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
  useScopedSetActiveRole,
} from '../../lib/useScopedAgentState';
import {
  composerActiveChipClass,
  composerActiveChipIconClass,
  composerToolbarButtonClass,
} from '../../lib/utils';
import { useAgentStore } from '../../stores/chatStore';
import { useUserProfileStore } from '../../stores/userProfileStore';
import { SkillLibraryModal } from '../skills/SkillLibraryModal';

import { useChatDensity } from './chatDensityContext';
import { TOOL_ICONS } from './composerToolIcons';

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

/** Web's half of the `COMPOSER_MODES` icon contract, like `TOOL_ICONS`. */
const MODE_ICONS: Record<ComposerIconKey, React.ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  notebook: BookOpen,
  custom: Settings,
};

const CHAT_MODE = composerModeDef('chat');
const EIGENER_MODE = composerModeDef('eigener');
const ChatModeIcon = MODE_ICONS[CHAT_MODE.icon];
const EigenerModeIcon = MODE_ICONS[EIGENER_MODE.icon];

type MobilePanel = 'rezepte' | 'rollen' | 'konnektoren' | 'erstellen' | 'vorlagen';

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
  // Mobile only: which section the sheet has drilled into (null = top level).
  const [mobilePanel, setMobilePanel] = useState<MobilePanel | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isCompact = useChatDensity() === 'compact';
  const { items: libraryItems } = useRecipeLibrary();
  const favorites = libraryItems.filter((i) => i.kind === 'recipe').map((i) => i.ref.toLowerCase());
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
  // Kontoweit, nicht oberflächen-lokal: „welche Rolle bin ich" gilt für jeden
  // neuen Chat und jedes Gerät — anders als der Thread-Zustand daneben. In
  // einer eingebetteten Fläche schreibt der Haken nichts, siehe dort.
  const setActiveRole = useScopedSetActiveRole();

  const showModes = includeModes && !insideAgent;
  // Eine Katalogrolle bringt keinen Prompttext mit — ihr Auftrag ist
  // parteiintern und wird server-seitig aufgelöst. „Eigener Chat" ist deshalb
  // aktiv, sobald das eine ODER das andere gesetzt ist.
  const hasCustomPrompt = !!customSystemPrompt || !!customRoleRef;
  const hasRoles = roles.length > 0;

  const activeRole =
    threadMode === 'eigener' && hasRoles
      ? (roles.find((r) => r.ebene === customRoleRef?.ebene && r.rolle === customRoleRef?.rolle) ??
        roles.find((r) => r.systemPrompt && r.systemPrompt === customSystemPrompt))
      : null;
  const activeRoleName = activeRole?.rolle ?? null;
  const eigenerBadgeLabel = activeRoleName || (firstName ? `${firstName}s Chat` : 'Eigener');
  // Im Chip steht die Kurzform, im Menü und im Tooltip die volle Bezeichnung —
  // „Mitarbeiter*in Landesgeschäftsstelle" wurde dort bisher mitten im Wort
  // abgeschnitten.
  const eigenerChipLabel = activeRole
    ? roleShortLabel(activeRole.ebene, activeRole.rolle)
    : eigenerBadgeLabel;

  // Alle vier Felder, nicht drei: der Prompttext einer frei getippten Rolle
  // blieb hier liegen und lief als Persona weiter, ohne dass noch ein Chip
  // davon erzählte (#2929). Dass „Eigener Chat" damit ohne Rollenwahl nicht
  // mehr anklickbar ist (`hasCustomPrompt`), ist die Auflösung einer
  // Asymmetrie und keine neue: für Katalogrollen war der Eintrag schon immer
  // aus, weil ihre `customRoleRef` hier seit jeher genullt wird.
  const selectChatMode = () => {
    setCustomSystemPrompt(null);
    setCustomRoleName(null);
    setCustomRoleRef(null);
    setThreadMode('chat');
    setActiveRole(null);
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
    setActiveRole({ ebene: role.ebene, rolle: role.rolle });
  };

  const selectEigener = () => {
    if (!hasCustomPrompt) return;
    setThreadMode('eigener');
  };

  // Every open starts at the top level, wherever the last one was left.
  const handleOpenChange = (open: boolean) => {
    setMenuOpen(open);
    if (!open) setMobilePanel(null);
  };

  const handleMobileAction = (action: () => void) => {
    handleOpenChange(false);
    action();
  };

  // Moving between levels swaps the sheet's whole content; without moving the
  // focus it is left on a button that no longer exists.
  const showMobilePanel = (panel: MobilePanel | null) => {
    setMobilePanel(panel);
    requestAnimationFrame(() => panelRef.current?.querySelector('button')?.focus());
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
      <Hint>Hochladen, Cloud, Dokumente, Notebooks</Hint>
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
            <EigenerModeIcon className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">{COMPOSER_MODES_TITLE}</span>
            {threadMode === 'eigener' && <Hint>{eigenerBadgeLabel}</Hint>}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[24rem] overflow-y-auto">
            <DropdownMenuItem
              onSelect={selectChatMode}
              className={threadMode === 'chat' ? activeClass : ''}
            >
              <ChatModeIcon className="h-3.5 w-3.5" />
              <span className="flex-1">{CHAT_MODE.label}</span>
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
                  <EigenerModeIcon className="h-3.5 w-3.5" />
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
                <EigenerModeIcon className="h-3.5 w-3.5" />
                <span className="flex-1">{EIGENER_MODE.label}</span>
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

  // ── Mobile sheet: two levels ───────────────────────────────────────────────
  // The top level mirrors the desktop menu (attach row, one row per section,
  // the switches); a section row swaps the sheet to that section's list. All
  // sections expanded at once ran to ~40 rows, with the switches last.
  const drillRow = (
    panel: MobilePanel,
    icon: React.ReactNode,
    label: string,
    hint?: string | null
  ) => (
    <ResponsiveMenuItem
      icon={icon}
      onClick={() => showMobilePanel(panel)}
      active={
        (panel === 'rollen' && threadMode === 'eigener') ||
        (panel === 'konnektoren' && !!pinnedConnector)
      }
    >
      <span className="flex items-center gap-2">
        <span className="flex-1 truncate">{label}</span>
        {hint && <Hint>{hint}</Hint>}
        <ChevronRight className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden="true" />
      </span>
    </ResponsiveMenuItem>
  );

  const mobileTopLevel = (
    <>
      <ResponsiveMenuSection title="Hinzufügen">
        <ResponsiveMenuItem
          icon={<Paperclip />}
          onClick={() => handleMobileAction(onOpenFileBrowser)}
        >
          Datei hinzufügen
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Bereiche">
        {drillRow('rezepte', <Wand2 />, 'Rezepte')}
        {showModes &&
          drillRow(
            'rollen',
            <EigenerModeIcon />,
            COMPOSER_MODES_TITLE,
            threadMode === 'eigener' ? eigenerBadgeLabel : null
          )}
        {mcpConnectors.length > 0 &&
          drillRow(
            'konnektoren',
            <Plug />,
            'Konnektoren',
            activeConnectorCount > 0 ? `${activeConnectorCount} an` : null
          )}
        {drillRow('erstellen', <Zap />, 'Erstellen')}
        {presets &&
          presets.length > 0 &&
          onApplyPreset &&
          drillRow('vorlagen', <LayoutTemplate />, 'Vorlagen')}
      </ResponsiveMenuSection>

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

  const mobilePanelContent: Record<MobilePanel, { title: string; body: React.ReactNode }> = {
    rezepte: {
      title: 'Rezepte',
      body: (
        <>
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
              handleOpenChange(false);
              setLibraryOpen(true);
            }}
          >
            Alle Rezepte durchsuchen…
          </ResponsiveMenuItem>
          {onOpenSkillsPage && (
            <ResponsiveMenuItem
              icon={<ExternalLink />}
              onClick={() => handleMobileAction(onOpenSkillsPage)}
            >
              Zur Rezept-Bibliothek
            </ResponsiveMenuItem>
          )}
        </>
      ),
    },
    rollen: {
      title: COMPOSER_MODES_TITLE,
      body: (
        <>
          <ResponsiveMenuItem
            icon={<ChatModeIcon />}
            active={threadMode === 'chat'}
            onClick={() => handleMobileAction(selectChatMode)}
          >
            {CHAT_MODE.label}
          </ResponsiveMenuItem>
          {hasRoles ? (
            roles.map((role, i) => (
              <ResponsiveMenuItem
                key={`role-${i}`}
                icon={<EigenerModeIcon />}
                active={isRoleActive(i)}
                onClick={() => handleMobileAction(() => selectRole(i))}
              >
                {role.rolle}
              </ResponsiveMenuItem>
            ))
          ) : (
            <ResponsiveMenuItem
              icon={<EigenerModeIcon />}
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
        </>
      ),
    },
    konnektoren: {
      title: 'Konnektoren',
      body: mcpConnectors.map((connector) => (
        <ResponsiveMenuItem
          key={connector.identifier}
          icon={<Plug />}
          active={pinnedConnector?.id === connectorId(connector)}
          onClick={() => handleMobileAction(() => togglePinnedConnector(connector))}
        >
          {connector.title}
        </ResponsiveMenuItem>
      )),
    },
    erstellen: {
      title: 'Erstellen',
      body: creationItems.map((tool) => {
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
      }),
    },
    vorlagen: {
      title: 'Vorlagen',
      body: (presets ?? []).map((preset) => (
        <ResponsiveMenuItem
          key={preset.key}
          icon={<LayoutTemplate />}
          onClick={() => handleMobileAction(() => onApplyPreset?.(preset.text))}
        >
          {preset.title}
        </ResponsiveMenuItem>
      )),
    },
  };

  const activePanel = mobilePanel ? mobilePanelContent[mobilePanel] : null;
  const mobileContent = (
    <div ref={panelRef}>
      {activePanel ? (
        <>
          <ResponsiveMenuItem
            icon={<ChevronLeft />}
            onClick={() => showMobilePanel(null)}
            className="mb-1 font-semibold"
          >
            {activePanel.title}
          </ResponsiveMenuItem>
          {activePanel.body}
        </>
      ) : (
        mobileTopLevel
      )}
    </div>
  );

  const showModeBadge = showModes && threadMode === 'eigener';

  return (
    <>
      <ResponsiveMenu
        open={menuOpen}
        onOpenChange={handleOpenChange}
        sheetTitle="Aktionen"
        dropdownClassName="w-[22rem]"
        trigger={
          <button
            type="button"
            aria-label={
              showModeBadge ? `Aktionen und Modus — ${eigenerBadgeLabel}` : 'Aktionen und Modus'
            }
            title={showModeBadge ? eigenerBadgeLabel : undefined}
            className={
              showModeBadge
                ? composerActiveChipClass(isCompact)
                : composerToolbarButtonClass(isCompact)
            }
          >
            {/* Im Chip trägt das Plus die Strichstärke des fetten Labels mit
                (Variante 2c); ohne Rolle bleibt es der dünne Toolbar-Knopf. */}
            <PlusIcon
              className={
                showModeBadge
                  ? `${composerActiveChipIconClass} stroke-[2.4px]`
                  : isCompact
                    ? 'h-4 w-4 stroke-[1.5px]'
                    : 'h-5 w-5 stroke-[1.5px]'
              }
            />
            {showModeBadge && <span className="max-w-32 truncate">{eigenerChipLabel}</span>}
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
