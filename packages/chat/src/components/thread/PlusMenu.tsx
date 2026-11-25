'use client';

import { roleShortLabel } from '@gruenerator/shared/roles';
import { mcpBrandColor } from '@gruenerator/shared/utils';
import {
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  ResponsiveMenu,
  ResponsiveMenuSection,
  ResponsiveMenuItem,
  ResponsiveMenuToggle,
} from '@gruenerator/ui';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  LayoutTemplate,
  Library,
  MessageSquare,
  Paperclip,
  Plug,
  PlusIcon,
  Search,
  Settings,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import { createElement, memo, useRef, useState } from 'react';

import { useRecipeLibrary } from '../../hooks/useRecipeLibrary';
import {
  COMPOSER_MODES_TITLE,
  COMPOSER_TOOLS,
  composerModeDef,
  type ComposerIconKey,
} from '../../lib/composerControls';
import { connectorBrandIcon, legibleBrandColor } from '../../lib/connectorBrand';
import { resolveMentionable, type Mentionable } from '../../lib/mentionables';
import { buildMentionSections } from '../../lib/mentionSections';
import {
  CONNECTOR_STATUS_LABEL,
  connectorId,
  connectorMentionables,
  featuredCreationMentionables,
  moreCreationGroups,
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
import { useChatConfigStore } from '../../stores/chatConfigStore';
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
  /** Opens the file panel (cloud, documents, notebooks — and upload again). */
  onOpenFileBrowser: () => void;
  /** Opens the system file picker directly. Without it, the menu offers one
   * "Datei hinzufügen" row that goes through the panel. */
  onUploadFromDevice?: () => void;
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

/**
 * A connector's own logo in its brand colour, the plug when it has none —
 * the same mark the pinned-connector chip in the composer shows.
 */
const ConnectorIcon = ({ title }: { title: string }) => {
  const Icon = connectorBrandIcon(title);
  if (!Icon) return <Plug className="h-3.5 w-3.5" />;
  const brand = mcpBrandColor(title);
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 text-[var(--brand-light)] dark:text-[var(--brand-dark)]"
      style={
        {
          '--brand-light': legibleBrandColor(brand, 'light'),
          '--brand-dark': legibleBrandColor(brand, 'dark'),
        } as React.CSSProperties
      }
    >
      {/* createElement: the logo is looked up per connector, not declared here. */}
      {createElement(Icon, { className: 'h-3.5 w-3.5' })}
    </span>
  );
};

/** Amber note on a connector that needs something before it works fully. */
const ConnectorStatusNote = ({ connector }: { connector: Mentionable }) =>
  connector.connectorStatus ? (
    <span className="flex shrink-0 items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {CONNECTOR_STATUS_LABEL[connector.connectorStatus]}
    </span>
  ) : null;

/**
 * Filters the whole menu, ChatGPT-style. Keys stay in the field — Radix's
 * menu typeahead would otherwise jump to an item on every letter — except
 * ArrowDown (into the results), Tab and Escape. Escape closes the menu even
 * with a query: Radix listens for it on the document in the capture phase.
 */
const MenuSearchField = ({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) => (
  <div className="relative px-1 pb-1">
    <Search
      className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-foreground-muted"
      aria-hidden="true"
    />
    <input
      type="search"
      aria-label="Im Menü suchen"
      placeholder="Suchen …"
      value={value}
      // Desktop only: the dropdown opens on an explicit click, while on a phone
      // focusing would throw the keyboard over the sheet.
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.currentTarget
            .closest('[role="menu"]')
            ?.querySelector<HTMLElement>('[role^="menuitem"]')
            ?.focus();
          return;
        }
        if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
      }}
      className="w-full rounded-md border border-grey-200 bg-transparent py-1.5 pr-2.5 pl-8 text-sm outline-none placeholder:text-foreground-muted focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:border-grey-700"
    />
  </div>
);

type SearchSection = { label: string; items: Mentionable[] };

/**
 * Owns the query, so a keystroke re-renders the field and the results only.
 * Held in `PlusMenu`, every letter rebuilt the whole menu. `children` is the
 * normal content, created by the parent and therefore skipped while typing.
 * Unmounts with the menu, so every open starts with an empty query.
 */
const MenuSearch = ({
  autoFocus,
  renderResults,
  children,
}: {
  autoFocus?: boolean;
  renderResults: (query: string, sections: SearchSection[]) => React.ReactNode;
  children: React.ReactNode;
}) => {
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  // The same sections, in the same order, as the `@` popover: one search.
  const sections = trimmed
    ? buildMentionSections(trimmed).map((section) => ({
        label: section.label,
        items: section.kind === 'flat' ? section.items : section.groups.flatMap((g) => g.items),
      }))
    : null;
  return (
    <>
      <MenuSearchField value={query} onChange={setQuery} autoFocus={autoFocus} />
      {sections ? renderResults(trimmed, sections) : children}
    </>
  );
};

export const PlusMenu = memo(function PlusMenu({
  onInsertMention,
  onOpenFileBrowser,
  onUploadFromDevice,
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
  const featuredItems = featuredCreationMentionables();
  const { create: moreCreateItems, analyse: analyseItems } = moreCreationGroups();
  const onOpenConnectorSettings = useChatConfigStore((s) => s.onOpenConnectorSettings);

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

  // With a way to manage them, the section stays even when nothing is
  // connected — otherwise nobody without a connector learns they exist.
  const showConnectors = mcpConnectors.length > 0 || !!onOpenConnectorSettings;
  const connectorsNeedingAttention = mcpConnectors.filter((c) => c.connectorStatus).length;
  const connectorsHint = pinnedConnector
    ? '1 an'
    : connectorsNeedingAttention > 0
      ? CONNECTOR_STATUS_LABEL[mcpConnectors.find((c) => c.connectorStatus)!.connectorStatus!]
      : null;

  // ── Group 1: add context ───────────────────────────────────────────────────
  // Uploading is the commonest act here, so it opens the system picker in one
  // click; everything already stored goes through the panel. A link is
  // pasted faster than it is found in a menu.
  const desktopAttachItems = onUploadFromDevice ? (
    <>
      <DropdownMenuItem onClick={onUploadFromDevice}>
        <Upload className="h-3.5 w-3.5" />
        <span className="flex-1">Vom Gerät hochladen</span>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={onOpenFileBrowser}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="flex-1 whitespace-nowrap">Vorhandene Datei</span>
        <Hint>Cloud, Dokumente, Notebooks</Hint>
      </DropdownMenuItem>
    </>
  ) : (
    <DropdownMenuItem onClick={onOpenFileBrowser}>
      <Paperclip className="h-3.5 w-3.5" />
      <span className="flex-1 whitespace-nowrap">Datei hinzufügen</span>
      <Hint>Hochladen, Cloud, Dokumente, Notebooks</Hint>
    </DropdownMenuItem>
  );

  const mentionIcon = (item: Mentionable) => {
    if (item.identifier.startsWith('mcp:')) return <ConnectorIcon title={item.title} />;
    const Icon = item.icon;
    return Icon ? <Icon className="h-4 w-4 text-secondary-600" /> : null;
  };

  const desktopCreateItem = (tool: Mentionable) => (
    <DropdownMenuItem key={`${tool.type}:${tool.mention}`} onClick={() => onInsertMention(tool)}>
      {mentionIcon(tool)}
      {tool.title}
    </DropdownMenuItem>
  );

  // ── Group 2: the visual products, flat, and the rest of „Erstellen" ────────
  const desktopCreationItems = (
    <>
      {featuredItems.map(desktopCreateItem)}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Zap className="h-3.5 w-3.5" />
          <span className="flex-1">
            {featuredItems.length > 0 ? 'Mehr erstellen' : 'Erstellen'}
          </span>
        </DropdownMenuSubTrigger>
        {/* Sized to the room Radix measured, not to a fixed 24rem that cut the
            last rows off without a scroll hint. */}
        <DropdownMenuSubContent className="max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto">
          {moreCreateItems.map(desktopCreateItem)}
          {analyseItems.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-foreground-muted">
                Auswerten
              </DropdownMenuLabel>
              {analyseItems.map(desktopCreateItem)}
            </>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );

  const renderDesktopResults = (query: string, sections: SearchSection[]) =>
    sections.length === 0 ? (
      <p className="px-2 py-3 text-sm text-foreground-muted">Nichts gefunden für „{query}“</p>
    ) : (
      <div className="max-h-[22rem] overflow-y-auto">
        {sections.map((section) => (
          <div key={section.label}>
            <DropdownMenuLabel className="text-xs text-foreground-muted">
              {section.label}
            </DropdownMenuLabel>
            {section.items.map((item) => (
              <DropdownMenuItem
                key={`${section.label}:${item.type}:${item.identifier}:${item.mention}`}
                onClick={() => onInsertMention(item)}
              >
                {mentionIcon(item)}
                <span className="flex-1 truncate">{item.title}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </div>
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

      {showConnectors && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={pinnedConnector ? activeClass : ''}>
            <Plug className="h-3.5 w-3.5" />
            <span className="flex-1 truncate">Konnektoren</span>
            {connectorsHint && <Hint>{connectorsHint}</Hint>}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[24rem] w-64 overflow-y-auto">
            {mcpConnectors.map((connector) => {
              const isActive = pinnedConnector?.id === connectorId(connector);
              return (
                <DropdownMenuItem
                  key={connector.identifier}
                  onClick={() => togglePinnedConnector(connector)}
                  className={isActive ? activeClass : ''}
                >
                  <ConnectorIcon title={connector.title} />
                  <span className="flex-1 truncate">{connector.title}</span>
                  <ConnectorStatusNote connector={connector} />
                  {isActive && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              );
            })}
            {onOpenConnectorSettings && (
              <>
                {mcpConnectors.length > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={onOpenConnectorSettings}>
                  <Settings className="h-3.5 w-3.5" />
                  <span className="flex-1">
                    {mcpConnectors.length > 0 ? 'Konnektoren verwalten' : 'Konnektor verbinden'}
                  </span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

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
      <MenuSearch autoFocus renderResults={renderDesktopResults}>
        <>
          {desktopAttachItems}
          <DropdownMenuSeparator />
          {desktopCreationItems}
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
      </MenuSearch>
    </>
  );

  // ── Mobile sheet: two levels ───────────────────────────────────────────────
  // No search field here: the sheet focuses its first field on open, which on
  // a phone throws the keyboard over the menu — and `@` in the composer finds
  // the same. The switches come right after the attach rows so they stay on
  // the first screen.
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

  const mobileCreateItem = (tool: Mentionable) => (
    <ResponsiveMenuItem
      key={`${tool.type}:${tool.mention}`}
      icon={mentionIcon(tool)}
      onClick={() => handleMobileAction(() => onInsertMention(tool))}
    >
      {tool.title}
    </ResponsiveMenuItem>
  );

  const mobileTopLevel = (
    <>
      <ResponsiveMenuSection title="Hinzufügen">
        {onUploadFromDevice ? (
          <>
            <ResponsiveMenuItem
              icon={<Upload />}
              onClick={() => handleMobileAction(onUploadFromDevice)}
            >
              Vom Gerät hochladen
            </ResponsiveMenuItem>
            <ResponsiveMenuItem
              icon={<FolderOpen />}
              onClick={() => handleMobileAction(onOpenFileBrowser)}
            >
              Vorhandene Datei
            </ResponsiveMenuItem>
          </>
        ) : (
          <ResponsiveMenuItem
            icon={<Paperclip />}
            onClick={() => handleMobileAction(onOpenFileBrowser)}
          >
            Datei hinzufügen
          </ResponsiveMenuItem>
        )}
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

      <ResponsiveMenuSection title="Erstellen">
        {featuredItems.map(mobileCreateItem)}
        {drillRow('erstellen', <Zap />, featuredItems.length > 0 ? 'Mehr erstellen' : 'Erstellen')}
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
        {showConnectors && drillRow('konnektoren', <Plug />, 'Konnektoren', connectorsHint)}
        {presets &&
          presets.length > 0 &&
          onApplyPreset &&
          drillRow('vorlagen', <LayoutTemplate />, 'Vorlagen')}
      </ResponsiveMenuSection>

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
      body: (
        <>
          {mcpConnectors.map((connector) => (
            <ResponsiveMenuItem
              key={connector.identifier}
              icon={<ConnectorIcon title={connector.title} />}
              active={pinnedConnector?.id === connectorId(connector)}
              onClick={() => handleMobileAction(() => togglePinnedConnector(connector))}
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 truncate">{connector.title}</span>
                <ConnectorStatusNote connector={connector} />
              </span>
            </ResponsiveMenuItem>
          ))}
          {onOpenConnectorSettings && (
            <ResponsiveMenuItem
              icon={<Settings />}
              onClick={() => handleMobileAction(onOpenConnectorSettings)}
            >
              {mcpConnectors.length > 0 ? 'Konnektoren verwalten' : 'Konnektor verbinden'}
            </ResponsiveMenuItem>
          )}
        </>
      ),
    },
    erstellen: {
      title: featuredItems.length > 0 ? 'Mehr erstellen' : 'Erstellen',
      body: (
        <>
          {moreCreateItems.map(mobileCreateItem)}
          {analyseItems.length > 0 && (
            <ResponsiveMenuSection title="Auswerten" className="mt-3 mb-0">
              {analyseItems.map(mobileCreateItem)}
            </ResponsiveMenuSection>
          )}
        </>
      ),
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
