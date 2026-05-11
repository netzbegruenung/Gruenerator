import { useAgentStore } from '@gruenerator/chat';
import {
  SYSTEM_AGENTS,
  getSystemAgent,
  type Agent,
  type SystemAgentId,
} from '@gruenerator/shared/agents';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from '@gruenerator/ui';

// Hide from the modal's main list — already rendered at the top via
// DEFAULT_AGENT_ENTRIES; listing twice would just duplicate rows.
const HIDDEN_INVENTORY_AGENT_IDS = new Set<SystemAgentId>([
  'gruenerator-oeffentlichkeitsarbeit',
  'gruenerator-antrag',
  'gruenerator-suche',
]);

const VISIBLE_SYSTEM_AGENTS: readonly Agent[] = SYSTEM_AGENTS.filter(
  (a) => !HIDDEN_INVENTORY_AGENT_IDS.has(a.identifier as SystemAgentId)
);

const AGENT_ICONS: Partial<Record<SystemAgentId, IconType>> = {
  'gruenerator-universal': PiSparkle,
  'gruenerator-antrag': PiNotePencil,
  'gruenerator-suche': PiMagnifyingGlass,
  'gruenerator-oeffentlichkeitsarbeit': PiMegaphone,
  'gruenerator-buergerservice': PiChatsCircle,
  'gruenerator-rede-schreiber': PiMicrophone,
  'gruenerator-wahlprogramm': PiBookOpenText,
  'gruenerator-leichte-sprache': PiHandHeart,
  'gruenerator-docs-editor': PiFileText,
};

// All PR agents (universal + 7 per-LV variants) share PiMegaphone — the
// prefix check means new LV-PR agents need zero changes here.
function getAgentIcon(identifier: string): IconType {
  if (identifier.startsWith('gruenerator-oeffentlichkeitsarbeit')) return PiMegaphone;
  return AGENT_ICONS[identifier as SystemAgentId] ?? PiSparkle;
}

interface DefaultAgentEntry {
  key: string;
  label: string;
  identifier: string;
}

/**
 * Pinned defaults always shown in the sidebar regardless of favorites.
 * "Öffentlichkeitsarbeit" is the combined Presse + Social Media agent.
 * Splitting it into separate entries caused an Array.find first-match display
 * ambiguity (clicking Social Media showed "Pressemitteilung" because both
 * pointed at the same identifier) — single entry resolves that.
 * Icon comes from `getAgentIcon(identifier)` — single source of truth.
 */
const DEFAULT_AGENT_ENTRIES: readonly DefaultAgentEntry[] = [
  {
    key: 'default-oeffentlichkeitsarbeit',
    label: 'Öffentlichkeitsarbeit',
    identifier: 'gruenerator-oeffentlichkeitsarbeit',
  },
  {
    key: 'default-antrag',
    label: 'Anträge',
    identifier: 'gruenerator-antrag',
  },
  {
    key: 'default-suche',
    label: 'Suche',
    identifier: 'gruenerator-suche',
  },
  {
    key: 'default-suche',
    label: 'Suche',
    identifier: 'gruenerator-suche',
    Icon: PiMagnifyingGlass,
  },
  // Per-LV Öffentlichkeitsarbeit agents are intentionally NOT pinned here.
  // They are discoverable via the "Alle Agents" modal and the per-LV notebook
  // auto-select; users can favorite them to surface them in the sidebar.
  // Pinning them globally caused duplication with the favorites-driven
  // inventory rendering (same agent shown twice).
];
import { useEffect, useMemo, useCallback, useRef, useState, memo } from 'react';
import {
  PiSun,
  PiMoon,
  PiStarFill,
  PiSignIn,
  PiCaretRight,
  PiSparkle,
  PiMegaphone,
  PiNotePencil,
  PiMagnifyingGlass,
  PiChatsCircle,
  PiMicrophone,
  PiBookOpenText,
  PiHandHeart,
  PiFileText,
} from 'react-icons/pi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getFavouriteItemsById } from '../../../config/sidebarFavouritesConfig';
import { useUserAgents } from '../../../features/agents/api';
import useAgentFavoritesStore from '../../../stores/agentFavoritesStore';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { StatusBadge } from '../../common/StatusBadge';
import useDarkMode from '../../hooks/useDarkMode';
import {
  getDirectMenuItems,
  getMobileOnlyMenuItems,
  getFooterLinks,
  type MenuItemType,
} from '../Header/menuData';

import NewItemDropdown from './NewItemDropdown';
import { iconClass, menuLinkClass } from './sidebarStyles';

import type { IconType } from 'react-icons';

import { cn } from '@/utils/cn';
import '../../../assets/styles/components/layout/sidebar.css';

interface SidebarProps {
  isDesktop?: boolean;
  onNavigate?: (path: string, title: string) => void;
}

function NavTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactElement;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

const Sidebar = ({ isDesktop = false, onNavigate }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, close, open, toggle, forceExpanded } = useSidebarStore();
  const isMobile = useIsMobile();

  const user = useAuthStore((s) => s.user);
  const setLoginIntent = useAuthStore((s) => s.setLoginIntent);

  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const newMenuOpenRef = useRef(false);
  const [darkMode, toggleDarkMode] = useDarkMode();

  const directMenuItems = useMemo(() => getDirectMenuItems({ isAustrian }), [isAustrian]);
  const mobileOnlyItems = useMemo(() => getMobileOnlyMenuItems(), []);
  const additionalItems = useMemo<MenuItemType[]>(
    () => [...Object.values(directMenuItems), ...Object.values(mobileOnlyItems)],
    [directMenuItems, mobileOnlyItems]
  );
  const footerLinks = useMemo(() => getFooterLinks(), []);

  const sidebarExpanded = isOpen || forceExpanded;

  // Close sidebar on route change
  useEffect(() => {
    if (!forceExpanded) {
      close();
    }
  }, [location.pathname]);

  // Keyboard shortcuts: Escape to close, Ctrl/Cmd+B to toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
        return;
      }
      if (e.key === 'b' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close, toggle]);

  const isActive = useCallback(
    (path: string, activePaths?: string[], activeQuery?: Record<string, string>) => {
      const pathMatches = activePaths
        ? activePaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/'))
        : location.pathname === path;
      if (!pathMatches) return false;
      if (!activeQuery) {
        // Plain path match: if other entries claim a query param on this path,
        // the no-query entry should NOT highlight when those params are set —
        // but we don't know about siblings here. Keep current behaviour.
        return true;
      }
      const params = new URLSearchParams(location.search);
      return Object.entries(activeQuery).every(([key, value]) => params.get(key) === value);
    },
    [location.pathname, location.search]
  );

  const handleLinkClick = useCallback(
    (path: string, title: string = '') => {
      if (onNavigate) {
        onNavigate(path, title);
      } else {
        void navigate(path);
      }
      close();
    },
    [navigate, close, onNavigate]
  );

  const handleChatClick = useCallback(() => {
    useAgentStore.getState().setChatViewMode('overview');
    if (location.pathname.startsWith('/chat')) {
      return;
    }
    if (onNavigate) {
      onNavigate('/chat', 'Chat');
    } else {
      void navigate('/chat');
    }
  }, [navigate, onNavigate, location.pathname]);

  const handleMouseLeave = useCallback(() => {
    if (!newMenuOpenRef.current) {
      close();
    }
  }, [close]);

  const titleClass = cn(
    'font-semibold text-sm text-foreground-heading leading-tight transition-all duration-150 font-[Raleway,PT_Sans,Arial,sans-serif]',
    sidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
  );

  const badgeClass = cn(
    'ml-auto transition-opacity duration-150',
    sidebarExpanded ? 'opacity-100' : 'opacity-0'
  );

  // Shared sidebar content rendered in both mobile Sheet and desktop aside
  const sidebarInner = (
    <>
      {/* Logo - desktop (Tauri) only */}
      {isDesktop && (
        <button
          className="flex items-center gap-3 py-3 px-4 m-0 bg-transparent border-none rounded-none cursor-pointer transition-colors w-full border-b border-grey-200 dark:border-grey-700 hover:bg-hover-alt"
          onClick={() => handleLinkClick('/', 'Start')}
          type="button"
          title="Zur Startseite"
        >
          <img src="/images/logo-square.png" alt="Grünerator" className="w-8 h-8 shrink-0" />
          {isOpen && (
            <span className="font-semibold text-base whitespace-nowrap text-primary-600">
              Grünerator
            </span>
          )}
        </button>
      )}

      <nav className={cn('flex-none overflow-x-hidden pb-sm', isDesktop ? 'pt-3' : 'pt-12')}>
        {/* Direct menu items - main navigation */}
        {additionalItems.length > 0 && (
          <div className="flex flex-col gap-0 p-0">
            {additionalItems.map((item) =>
              !item.path ? (
                <span key={item.id} className={menuLinkClass(false, true)}>
                  {item.icon && <item.icon aria-hidden="true" className={iconClass} />}
                  <span className={titleClass}>{item.title}</span>
                  {item.badge && (
                    <span className={badgeClass}>
                      <StatusBadge type={item.badge} variant="sidebar" />
                    </span>
                  )}
                </span>
              ) : isDesktop ? (
                <NavTooltip key={item.id} label={item.title} collapsed={!sidebarExpanded}>
                  <button
                    onClick={() =>
                      item.id === 'chat'
                        ? handleChatClick()
                        : handleLinkClick(item.path!, item.title)
                    }
                    className={menuLinkClass(
                      isActive(item.path!, item.activePaths, item.activeQuery)
                    )}
                    aria-current={
                      isActive(item.path!, item.activePaths, item.activeQuery) ? 'page' : undefined
                    }
                    type="button"
                  >
                    {item.icon && <item.icon aria-hidden="true" className={iconClass} />}
                    <span className={titleClass}>{item.title}</span>
                    {item.badge && (
                      <span className={badgeClass}>
                        <StatusBadge type={item.badge} variant="sidebar" />
                      </span>
                    )}
                  </button>
                </NavTooltip>
              ) : (
                <Link
                  key={item.id}
                  to={item.path!}
                  className={menuLinkClass(false)}
                  onClick={() =>
                    item.id === 'chat' ? handleChatClick() : handleLinkClick(item.path!, item.title)
                  }
                >
                  {item.icon && <item.icon aria-hidden="true" className={iconClass} />}
                  <span className={titleClass}>{item.title}</span>
                  {item.badge && (
                    <span className={badgeClass}>
                      <StatusBadge type={item.badge} variant="sidebar" />
                    </span>
                  )}
                </Link>
              )
            )}
          </div>
        )}

        {/* New Item Dropdown */}
        <NewItemDropdown
          openRef={newMenuOpenRef}
          titleClass={titleClass}
          onChatClick={handleChatClick}
          onLinkClick={handleLinkClick}
          onClose={close}
        />

        {/* Favourites */}
        <SidebarFavourites
          isOpen={isOpen}
          isDesktop={isDesktop}
          onLinkClick={handleLinkClick}
          isActive={isActive}
          forceExpanded={forceExpanded}
        />
      </nav>

      {/* Unified scroll region: agents + threads scroll together (ChatGPT-style) */}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto scrollbar-thin',
          !sidebarExpanded && 'hidden'
        )}
      >
        {user && <SidebarAgents sidebarExpanded={sidebarExpanded} onLinkClick={handleLinkClick} />}

        <div id="chat-thread-portal-slot" className="mt-2" />
      </div>

      {/* Login button for unauthenticated users */}
      {!user && (
        <div className="mt-auto px-2 pt-xs shrink-0">
          <NavTooltip label="Anmelden" collapsed={!sidebarExpanded}>
            <Link to="/login" className={menuLinkClass(false)} onClick={() => setLoginIntent()}>
              <PiSignIn aria-hidden="true" className={iconClass} />
              <span className={titleClass}>Anmelden</span>
            </Link>
          </NavTooltip>
        </div>
      )}

      {/* Footer - pushed to bottom */}
      <div className={cn(user ? 'mt-auto' : '', 'px-2 py-xs shrink-0 flex items-center')}>
        <NavTooltip
          label={darkMode ? 'Heller Modus' : 'Dunkler Modus'}
          collapsed={!sidebarExpanded}
        >
          <button
            className="flex items-center justify-center w-10 h-10 p-0 ml-2 border-none bg-transparent rounded-full cursor-pointer text-foreground-heading hover:bg-hover-alt transition-colors shrink-0 [&_svg]:text-[1.4rem] [&_svg]:shrink-0 [&_svg]:w-6"
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
          >
            {darkMode ? <PiMoon aria-hidden="true" /> : <PiSun aria-hidden="true" />}
          </button>
        </NavTooltip>
        {!isDesktop &&
          sidebarExpanded &&
          footerLinks.map((item) => (
            <Link
              key={item.id}
              to={item.path!}
              className="flex items-center py-sm px-2.5 no-underline text-foreground rounded-sm transition-colors min-h-[40px] hover:bg-hover-alt"
              onClick={() => handleLinkClick(item.path!, item.title)}
            >
              <span className="font-medium text-[0.7rem] text-foreground whitespace-nowrap font-[Raleway,PT_Sans,Arial,sans-serif]">
                {item.title}
              </span>
            </Link>
          ))}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile: Sheet overlay */}
      {isMobile && !isDesktop && (
        <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[85vw] max-w-[280px] p-0 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl flex flex-col gap-0 [&>div]:gap-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {sidebarInner}
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop: fixed aside */}
      {(!isMobile || isDesktop) && (
        <aside
          className={cn(
            'sidebar fixed top-0 left-0 h-dvh z-[1001] flex flex-col overflow-hidden transition-[width] duration-200',
            // Desktop (non-Tauri) — frosted glass
            !isDesktop &&
              'md:w-14 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl border-r border-grey-200/60 dark:border-grey-800/60',
            !isDesktop && sidebarExpanded && 'md:w-[280px]',
            // Tauri desktop mode — keep native bar background, no blur
            isDesktop &&
              'top-[var(--titlebar-height)] h-[calc(100dvh-var(--titlebar-height))] bg-[var(--bar-background)]',
            isDesktop && !isOpen && 'w-16',
            isDesktop && isOpen && 'w-[220px]'
          )}
          aria-label="Hauptnavigation"
          onMouseEnter={isDesktop ? open : undefined}
          onMouseLeave={isDesktop && !forceExpanded ? handleMouseLeave : undefined}
        >
          {sidebarInner}
        </aside>
      )}
    </>
  );
};

const SidebarFavourites = memo(function SidebarFavourites({
  isOpen,
  isDesktop,
  onLinkClick,
  isActive,
  forceExpanded,
}: {
  isOpen: boolean;
  isDesktop: boolean;
  onLinkClick: (path: string, title: string) => void;
  isActive: (path: string, activePaths?: string[], activeQuery?: Record<string, string>) => boolean;
  forceExpanded: boolean;
}) {
  const favouriteIds = useSidebarFavouritesStore((s) => s.favouriteIds);
  const removeFavourite = useSidebarFavouritesStore((s) => s.removeFavourite);
  const items = getFavouriteItemsById(favouriteIds);

  if (items.length === 0) return null;

  const expanded = isOpen || forceExpanded;

  const titleClass = cn(
    'font-semibold text-sm text-foreground-heading leading-tight transition-all duration-150 font-[Raleway,PT_Sans,Arial,sans-serif]',
    expanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
  );

  return (
    <div className="flex flex-col gap-0 p-0 border-t border-grey-200 dark:border-grey-700 mt-1 pt-1">
      {items.map((item) => {
        const content = (
          <>
            {item.icon && <item.icon aria-hidden="true" className={iconClass} />}
            <span className={titleClass}>{item.title}</span>
            <button
              type="button"
              className={cn(
                'ml-auto shrink-0 text-primary-600 hover:text-red-500 transition-all p-0.5',
                expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeFavourite(item.id);
              }}
              aria-label={`${item.title} aus Favoriten entfernen`}
              title="Aus Favoriten entfernen"
            >
              <PiStarFill size={14} />
            </button>
          </>
        );

        return isDesktop ? (
          <NavTooltip key={item.id} label={item.title} collapsed={!expanded}>
            <button
              onClick={() => onLinkClick(item.path, item.title)}
              className={cn(menuLinkClass(isActive(item.path)), 'group')}
              aria-current={isActive(item.path) ? 'page' : undefined}
              type="button"
            >
              {content}
            </button>
          </NavTooltip>
        ) : (
          <Link
            key={item.id}
            to={item.path}
            className={cn(menuLinkClass(false), 'group')}
            onClick={() => onLinkClick(item.path, item.title)}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
});

const AGENTS_EXPANDED_KEY = 'sidebar-agents-expanded';

const SidebarAgents = memo(function SidebarAgents({
  sidebarExpanded,
  onLinkClick,
}: {
  sidebarExpanded: boolean;
  onLinkClick: (path: string, title: string) => void;
}) {
  const { data: userAgents = [] } = useUserAgents();
  // The "+ Neue*r Agent*in" CTA links to the unfinished agent-builder route at
  // /agents/new — dev-only. The user-agents list itself (which includes
  // virtualized custom_generators from the conversion work) is data-driven and
  // safe in prod: users only see their own data.
  const showCreateAgentCta = import.meta.env.DEV;

  const favoriteIdentifiers = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const favoriteAgents = useMemo(() => {
    const out: Agent[] = [];
    for (const identifier of favoriteIdentifiers) {
      if (HIDDEN_INVENTORY_AGENT_IDS.has(identifier as SystemAgentId)) continue;
      const agent = getSystemAgent(identifier);
      if (!agent) continue; // covers deleted agents + migration unknowns
      out.push(agent);
    }
    return out;
  }, [favoriteIdentifiers]);

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(AGENTS_EXPANDED_KEY);
      return stored === null ? true : stored === '1';
    } catch {
      return true;
    }
  });

  const toggle = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AGENTS_EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  const titleClass = cn(
    'text-sm text-foreground leading-tight transition-all duration-150 truncate',
    sidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
  );

  return (
    <div className="mt-3 px-xs">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-grey-500 hover:text-foreground transition-colors"
      >
        <span>Grünerator Agents</span>
        <PiCaretRight
          className={cn('h-3 w-3 shrink-0 transition-transform', isExpanded && 'rotate-90')}
          aria-hidden="true"
        />
      </button>
      {isExpanded && (
        <ul className="list-none m-0 p-0">
          {DEFAULT_AGENT_ENTRIES.map((entry) => {
            const Icon = getAgentIcon(entry.identifier);
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onLinkClick(`/chat?agent=${entry.identifier}`, entry.label)}
                  className={menuLinkClass(false)}
                >
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center text-secondary-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className={titleClass}>{entry.label}</span>
                </button>
              </li>
            );
          })}

          {favoriteAgents.map((agent) => {
            const Icon = getAgentIcon(agent.identifier);
            return (
              <li key={`fav-${agent.identifier}`}>
                <button
                  type="button"
                  onClick={() => onLinkClick(`/chat?agent=${agent.identifier}`, agent.title)}
                  className={menuLinkClass(false)}
                >
                  <span className="shrink-0 w-6 h-6 flex items-center justify-center text-secondary-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className={titleClass}>{agent.title}</span>
                </button>
              </li>
            );
          })}

          {userAgents.map((agent) => (
            <li key={agent.identifier}>
              <button
                type="button"
                onClick={() => onLinkClick(`/chat?agent=${agent.identifier}`, agent.title)}
                className={menuLinkClass(false)}
              >
                <span className="shrink-0 w-6 h-6 flex items-center justify-center text-secondary-600">
                  <PiSparkle aria-hidden="true" className="h-4 w-4" />
                </span>
                <span className={titleClass}>{agent.title}</span>
              </button>
            </li>
          ))}

          <li>
            <AllAgentsDialog onLinkClick={onLinkClick} titleClass={titleClass} />
          </li>

          {showCreateAgentCta && (
            <li>
              <button
                type="button"
                onClick={() => onLinkClick('/agents/new', 'Neue*r Agent*in')}
                className={cn(menuLinkClass(false), 'text-primary-600 dark:text-primary-300')}
              >
                <span className="shrink-0 w-6 h-6 flex items-center justify-center text-base">
                  +
                </span>
                <span className={titleClass}>Neue*r Agent*in</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
});

/**
 * Modal listing every non-social-media skill with star toggles.
 * Stars persist via `useAgentFavoritesStore`. Starred skills appear as
 * additional rows in the sidebar agents section.
 */
function AllAgentsDialog({
  onLinkClick,
  titleClass,
}: {
  onLinkClick: (path: string, title: string) => void;
  titleClass: string;
}) {
  const favoriteIdentifiers = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggle = useAgentFavoritesStore((s) => s.toggle);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(menuLinkClass(false), 'text-grey-500 hover:text-foreground')}
        >
          <span className="shrink-0 w-6 h-6 flex items-center justify-center text-base">⋯</span>
          <span className={titleClass}>Alle anzeigen</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alle Agents</DialogTitle>
        </DialogHeader>
        <ul className="list-none m-0 p-0 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {DEFAULT_AGENT_ENTRIES.map((entry) => {
            const Icon = getAgentIcon(entry.identifier);
            return (
              <li
                key={entry.key}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800/60"
              >
                <button
                  type="button"
                  onClick={() => onLinkClick(`/chat?agent=${entry.identifier}`, entry.label)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="shrink-0 w-7 h-7 flex items-center justify-center text-secondary-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{entry.label}</span>
                  </span>
                </button>
                <button
                  type="button"
                  disabled
                  className="shrink-0 p-1.5 rounded opacity-100 cursor-default"
                  aria-label="Standard-Favorit"
                  title="Standard-Favorit (immer angeheftet)"
                >
                  <PiStarFill size={16} className="text-primary-600" />
                </button>
              </li>
            );
          })}
          <li className="my-2 border-t border-grey-200 dark:border-grey-800" aria-hidden="true" />
          {VISIBLE_SYSTEM_AGENTS.map((agent) => {
            const isFav = favoriteIdentifiers.includes(agent.identifier);
            const Icon = getAgentIcon(agent.identifier);
            return (
              <li
                key={agent.identifier}
                className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800/60"
              >
                <button
                  type="button"
                  onClick={() => onLinkClick(`/chat?agent=${agent.identifier}`, agent.title)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span className="shrink-0 w-7 h-7 flex items-center justify-center text-secondary-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{agent.title}</span>
                    {agent.description && (
                      <span className="block text-xs text-grey-500 truncate">
                        {agent.description}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => toggle(agent.identifier)}
                  className="shrink-0 p-1.5 rounded hover:bg-grey-200 dark:hover:bg-grey-700"
                  aria-label={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                  title={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                >
                  <PiStarFill
                    size={16}
                    className={cn(isFav ? 'text-primary-600' : 'text-grey-300')}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export default memo(Sidebar);
