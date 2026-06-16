import { useAgentStore } from '@gruenerator/chat/stores';
import { getAgentSlug, getSystemAgent } from '@gruenerator/shared/agents';
import { sortByUsage } from '@gruenerator/shared/utils';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { type IconType } from 'react-icons';
import { PiSignIn, PiSparkle, PiStarFill } from 'react-icons/pi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getFavouriteItemsById } from '../../../config/sidebarFavouritesConfig';
import { useUserAgents } from '../../../features/agents/api';
import { useItemUsage } from '../../../features/usage/useItemUsage';
import useAgentFavoritesStore from '../../../stores/agentFavoritesStore';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { StatusBadge } from '../../common/StatusBadge';
import { getDirectMenuItems, getMobileOnlyMenuItems, type MenuItemType } from '../Header/menuData';

import NewItemDropdown from './NewItemDropdown';
import SidebarAccount from './SidebarAccount';
import { getAgentIcon } from './sidebarAgentConfig';
import { iconClass, menuLinkClass } from './sidebarStyles';

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
  const accountMenuOpenRef = useRef(false);

  const directMenuItems = useMemo(() => getDirectMenuItems({ isAustrian }), [isAustrian]);
  const mobileOnlyItems = useMemo(() => getMobileOnlyMenuItems(), []);
  const additionalItems = useMemo<MenuItemType[]>(
    () => [...Object.values(directMenuItems), ...Object.values(mobileOnlyItems)],
    [directMenuItems, mobileOnlyItems]
  );
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
    if (!newMenuOpenRef.current && !accountMenuOpenRef.current) {
      close();
    }
  }, [close]);

  const titleClass = cn(
    'min-w-0 flex-1 truncate text-left text-sm font-medium leading-tight transition-all duration-150',
    sidebarExpanded ? 'opacity-100 translate-x-0' : 'hidden'
  );

  const badgeClass = cn(
    'ml-auto transition-opacity duration-150',
    sidebarExpanded ? 'opacity-100' : 'hidden'
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
                <span key={item.id} className={menuLinkClass(false, true, !sidebarExpanded)}>
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
                      isActive(item.path!, item.activePaths, item.activeQuery),
                      false,
                      !sidebarExpanded
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
                  className={menuLinkClass(false, false, !sidebarExpanded)}
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
          collapsed={!sidebarExpanded}
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

      {/* Scroll region: chat threads */}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto scrollbar-thin',
          !sidebarExpanded && 'hidden'
        )}
      >
        <div id="chat-thread-portal-slot" className="mt-2" />
      </div>

      {/* Account block (authenticated) or login button */}
      {user ? (
        <SidebarAccount
          sidebarExpanded={sidebarExpanded}
          openRef={accountMenuOpenRef}
          onNavigate={handleLinkClick}
        />
      ) : (
        <div className="mt-auto px-2 py-2 shrink-0">
          <NavTooltip label="Anmelden" collapsed={!sidebarExpanded}>
            <Link
              to="/login"
              className={menuLinkClass(false, false, !sidebarExpanded)}
              onClick={() => setLoginIntent()}
            >
              <PiSignIn aria-hidden="true" className={iconClass} />
              <span className={titleClass}>Anmelden</span>
            </Link>
          </NavTooltip>
        </div>
      )}

      {/* Legal links - only shown when sidebar is expanded */}
      {sidebarExpanded && (
        <div className="shrink-0 px-4 pb-3 pt-1 flex items-center gap-2 text-xs text-foreground opacity-60">
          <Link
            to="/impressum"
            className="hover:text-primary-500 hover:underline transition-colors"
            onClick={() => handleLinkClick('/impressum', 'Impressum')}
          >
            Impressum
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/datenschutz"
            className="hover:text-primary-500 hover:underline transition-colors"
            onClick={() => handleLinkClick('/datenschutz', 'Datenschutz')}
          >
            Datenschutz
          </Link>
        </div>
      )}
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
            className="w-[85vw] max-w-[260px] p-0 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl flex flex-col gap-0 [&>div]:gap-0"
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
            !isDesktop && sidebarExpanded && 'md:w-[260px]',
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
  const configItems = getFavouriteItemsById(favouriteIds);

  const favoriteIdentifiers = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggleAgentFav = useAgentFavoritesStore((s) => s.toggle);
  const { data: userAgents = [] } = useUserAgents();
  const { data: agentUsage = {} } = useItemUsage('agent');

  // Agent favourites live in the normal favourites list (system + user agents).
  // Within the user's manual favourites, float the most-recently/most-used to
  // the top; never-used keep their add order.
  const agentItems = useMemo(() => {
    const rows: { identifier: string; title: string; Icon: IconType; path: string }[] = [];
    for (const identifier of favoriteIdentifiers) {
      const sys = getSystemAgent(identifier);
      if (sys) {
        rows.push({
          identifier,
          title: sys.title,
          Icon: getAgentIcon(identifier),
          path: `/agents/${getAgentSlug(identifier)}`,
        });
        continue;
      }
      const ua = userAgents.find((a) => a.identifier === identifier);
      if (ua) {
        rows.push({
          identifier,
          title: ua.title,
          Icon: PiSparkle,
          path: `/agents/${getAgentSlug(identifier)}`,
        });
      }
    }
    return sortByUsage(rows, (r) => r.identifier, agentUsage);
  }, [favoriteIdentifiers, userAgents, agentUsage]);

  const expanded = isOpen || forceExpanded;

  // Favourites only show in the expanded sidebar (no icon-only rail entries).
  if (!expanded) return null;
  if (configItems.length === 0 && agentItems.length === 0) return null;

  const titleClass = cn(
    'min-w-0 flex-1 truncate text-left text-sm font-medium leading-tight transition-all duration-150',
    expanded ? 'opacity-100 translate-x-0' : 'hidden'
  );

  const removeStar = (onRemove: () => void, title: string) => (
    <button
      type="button"
      className={cn(
        'ml-auto shrink-0 text-primary-600 hover:text-red-500 transition-all p-0.5',
        expanded ? 'opacity-100' : 'hidden'
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
      aria-label={`${title} aus Favoriten entfernen`}
      title="Aus Favoriten entfernen"
    >
      <PiStarFill size={14} />
    </button>
  );

  const renderRow = (
    key: string,
    icon: React.ReactNode,
    title: string,
    path: string,
    star: React.ReactNode
  ) => {
    const content = (
      <>
        {icon}
        <span className={titleClass}>{title}</span>
        {star}
      </>
    );
    return isDesktop ? (
      <NavTooltip key={key} label={title} collapsed={!expanded}>
        <button
          onClick={() => onLinkClick(path, title)}
          className={cn(menuLinkClass(isActive(path), false, !expanded), 'group')}
          aria-current={isActive(path) ? 'page' : undefined}
          type="button"
        >
          {content}
        </button>
      </NavTooltip>
    ) : (
      <Link
        key={key}
        to={path}
        className={cn(menuLinkClass(false, false, !expanded), 'group')}
        onClick={() => onLinkClick(path, title)}
      >
        {content}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-0 p-0 mt-2">
      {configItems.map((item) =>
        renderRow(
          item.id,
          item.icon ? <item.icon aria-hidden="true" className={iconClass} /> : null,
          item.title,
          item.path,
          removeStar(() => removeFavourite(item.id), item.title)
        )
      )}
      {agentItems.map((a) =>
        renderRow(
          `agent-${a.identifier}`,
          <a.Icon aria-hidden="true" className={iconClass} />,
          a.title,
          a.path,
          removeStar(() => toggleAgentFav(a.identifier), a.title)
        )
      )}
    </div>
  );
});

export default memo(Sidebar);
