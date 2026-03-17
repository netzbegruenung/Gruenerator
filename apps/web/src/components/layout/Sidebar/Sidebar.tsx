import { useCanvasSidebarStore, SIDEBAR_FONT_SIZES } from '@gruenerator/canvas-editor';
import { useAgentStore } from '@gruenerator/chat';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { FaCheck } from 'react-icons/fa';
import { PiSun, PiMoon, PiHouse, PiX, PiStarFill } from 'react-icons/pi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { getFavouriteItemsById } from '../../../config/sidebarFavouritesConfig';
import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarFavouritesStore from '../../../stores/sidebarFavouritesStore';
import useSidebarStore from '../../../stores/sidebarStore';
import { StatusBadge } from '../../common/StatusBadge';
import {
  getMenuItems,
  getDirectMenuItems,
  getMobileOnlyMenuItems,
  getFooterLinks,
  type MenuItemType,
  type MenuSection,
} from '../Header/menuData';

import SidebarSection from './SidebarSection';

import { cn } from '@/utils/cn';
import '../../../assets/styles/components/layout/sidebar.css';

interface SidebarProps {
  isDesktop?: boolean;
  onNavigate?: (path: string, title: string) => void;
}

const menuLinkClass = (active: boolean, disabled?: boolean) =>
  cn(
    'flex items-center gap-md py-sm px-xs pl-2 mx-2 rounded-sm min-h-[40px] no-underline whitespace-nowrap transition-colors text-foreground hover:bg-hover-alt active:bg-[var(--hover-color)]',
    active && 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

const iconClass =
  'text-[1.4rem] text-foreground shrink-0 w-6 flex items-center justify-center transition-colors xl:text-[1.5rem] 2xl:text-[1.6rem] 2xl:w-7';

const Sidebar = ({ isDesktop = false, onNavigate }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, close, open, toggle, forceExpanded } = useSidebarStore();
  const isMobile = useIsMobile();

  const canvasIsActive = useCanvasSidebarStore((s) => s.isActive);
  const canvasTabs = useCanvasSidebarStore((s) => s.tabs);
  const canvasActiveTab = useCanvasSidebarStore((s) => s.activeTab);
  const canvasDisabledTabs = useCanvasSidebarStore((s) => s.disabledTabs);
  const canvasOnTabClick = useCanvasSidebarStore((s) => s.onTabClick);
  const canvasAutoSaveStatus = useCanvasSidebarStore((s) => s.autoSaveStatus);
  const canvasPanelContent = useCanvasSidebarStore((s) => s.panelContent);
  const [showCanvasSaved, setShowCanvasSaved] = useState(false);

  useEffect(() => {
    if (canvasAutoSaveStatus === 'saved') {
      setShowCanvasSaved(true);
      const timer = setTimeout(() => setShowCanvasSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [canvasAutoSaveStatus]);

  useLazyAuth();
  const { user } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();

  const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
  const igelModeEnabled = useMemo(() => getBetaFeatureState('igel_modus'), [getBetaFeatureState]);
  const workplaceEnabled = useMemo(() => getBetaFeatureState('workplace'), [getBetaFeatureState]);
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );

  const menuItems = useMemo(
    () =>
      getMenuItems({
        databaseBetaEnabled,
        igelModeEnabled,
        isAustrian,
      }),
    [databaseBetaEnabled, igelModeEnabled, isAustrian]
  );

  const directMenuItems = useMemo(
    () => getDirectMenuItems({ databaseBetaEnabled, isAustrian, workplace: workplaceEnabled }),
    [databaseBetaEnabled, isAustrian, workplaceEnabled]
  );
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

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          setDarkMode(document.documentElement.getAttribute('data-theme') === 'dark');
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

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

  const toggleSection = useCallback((sectionKey: string) => {
    setActiveSection((prev) => (prev === sectionKey ? null : sectionKey));
  }, []);

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const handleLinkClick = useCallback(
    (path: string, title: string = '') => {
      if (onNavigate) {
        onNavigate(path, title);
      } else {
        navigate(path);
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
      navigate('/chat');
    }
  }, [navigate, onNavigate, location.pathname]);

  const toggleDarkMode = useCallback(() => {
    const newTheme = darkMode ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    setDarkMode(!darkMode);
  }, [darkMode]);

  const titleClass = cn(
    'font-semibold text-[0.95rem] text-foreground-heading leading-snug transition-all duration-150 font-[Raleway,PT_Sans,Arial,sans-serif] xl:text-[1rem] 2xl:text-[1.05rem]',
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

      {/* Sidebar Header - Home & Close */}
      {!isDesktop && sidebarExpanded && (
        <div className="flex items-center justify-between p-2 shrink-0">
          <button
            className="flex items-center justify-center w-10 h-10 p-0 border-none bg-transparent cursor-pointer rounded-sm text-foreground-heading text-[1.4rem] transition-colors hover:bg-hover-alt"
            onClick={() => handleLinkClick('/', 'Start')}
            type="button"
            title="Zur Startseite"
            aria-label="Zur Startseite"
          >
            <PiHouse aria-hidden="true" />
          </button>
          <button
            className="flex items-center justify-center w-10 h-10 p-0 border-none bg-transparent cursor-pointer rounded-sm text-foreground-heading text-[1.4rem] transition-colors hover:bg-hover-alt"
            onClick={close}
            type="button"
            aria-label="Menü schließen"
          >
            <PiX aria-hidden="true" />
          </button>
        </div>
      )}

      <nav
        className={cn(
          'flex-none overflow-x-hidden pb-sm',
          isDesktop ? 'pt-3' : !sidebarExpanded && 'pt-12'
        )}
      >
        {/* Canvas editor tabs — replaces normal nav when canvas is active */}
        {canvasIsActive ? (
          <div className="flex flex-col gap-0.5 p-0" style={{ paddingTop: 'var(--spacing-small)' }}>
            {canvasTabs.map((tab) => {
              const Icon = tab.icon;
              const isTabActive = canvasActiveTab === tab.id;
              const isTabDisabled = canvasDisabledTabs.includes(tab.id);
              return (
                <Tooltip key={tab.id}>
                  <TooltipTrigger asChild>
                    <button
                      className={menuLinkClass(isTabActive, isTabDisabled)}
                      onClick={() => !isTabDisabled && canvasOnTabClick?.(tab.id)}
                      disabled={isTabDisabled}
                      aria-label={tab.ariaLabel}
                      aria-pressed={isTabActive}
                      type="button"
                    >
                      <Icon aria-hidden="true" className={iconClass} />
                      <span className={titleClass}>{tab.label}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" hidden={sidebarExpanded}>
                    {tab.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}

            {/* Auto-save indicator */}
            {canvasAutoSaveStatus && (
              <div
                className={cn(
                  'flex items-center gap-md py-sm px-xs pl-2 mx-2 rounded-sm min-h-8 no-underline whitespace-nowrap transition-colors text-foreground justify-center cursor-default transition-opacity duration-300',
                  canvasAutoSaveStatus === 'saving' || showCanvasSaved ? 'opacity-100' : 'opacity-0'
                )}
                title={
                  canvasAutoSaveStatus === 'saving'
                    ? 'Wird gespeichert...'
                    : canvasAutoSaveStatus === 'saved'
                      ? 'Gespeichert'
                      : canvasAutoSaveStatus === 'error'
                        ? 'Fehler beim Speichern'
                        : ''
                }
              >
                {canvasAutoSaveStatus === 'saving' && (
                  <div className="size-4 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)] rounded-full animate-spin" />
                )}
                {showCanvasSaved && <FaCheck size={14} className="text-green-500" />}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Direct menu items - main navigation */}
            {additionalItems.length > 0 && (
              <div className="flex flex-col gap-0.5 p-0">
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
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() =>
                            item.id === 'chat'
                              ? handleChatClick()
                              : handleLinkClick(item.path!, item.title)
                          }
                          className={menuLinkClass(isActive(item.path!))}
                          aria-current={isActive(item.path!) ? 'page' : undefined}
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
                      </TooltipTrigger>
                      <TooltipContent side="right" hidden={sidebarExpanded}>
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Link
                      key={item.id}
                      to={item.path!}
                      className={menuLinkClass(false)}
                      onClick={() =>
                        item.id === 'chat'
                          ? handleChatClick()
                          : handleLinkClick(item.path!, item.title)
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

            {/* Favourites */}
            <SidebarFavourites
              isOpen={isOpen}
              isDesktop={isDesktop}
              onLinkClick={handleLinkClick}
              isActive={isActive}
              forceExpanded={forceExpanded}
            />

            {/* Only render dropdown sections that have items */}
            {(Object.entries(menuItems) as [keyof typeof menuItems, MenuSection][])
              .filter(([_, menu]) => menu.items && menu.items.length > 0)
              .map(([key, menu]) => (
                <SidebarSection
                  key={key}
                  sectionKey={key}
                  title={menu.title}
                  items={menu.items}
                  isOpen={activeSection === key}
                  onToggle={() => toggleSection(key)}
                  onLinkClick={handleLinkClick}
                  isDesktop={isDesktop}
                  isActive={isActive}
                  sidebarExpanded={sidebarExpanded}
                />
              ))}
          </>
        )}
      </nav>

      {sidebarExpanded && (
        <div
          id="chat-thread-portal-slot"
          className="flex-1 flex flex-col overflow-hidden min-h-0 border-t border-grey-200 dark:border-grey-700"
        />
      )}

      {/* Footer - pushed to bottom */}
      <div className="mt-auto px-2 py-xs shrink-0 flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex items-center justify-center w-10 h-10 p-0 ml-2 border-none bg-transparent rounded-full cursor-pointer text-foreground-heading hover:bg-hover-alt transition-colors shrink-0 [&_svg]:text-[1.4rem] [&_svg]:shrink-0 [&_svg]:w-6"
              onClick={toggleDarkMode}
              aria-label={darkMode ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
            >
              {darkMode ? <PiMoon aria-hidden="true" /> : <PiSun aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" hidden={sidebarExpanded}>
            {darkMode ? 'Heller Modus' : 'Dunkler Modus'}
          </TooltipContent>
        </Tooltip>
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
    <TooltipProvider delayDuration={300}>
      {/* Mobile: Sheet overlay */}
      {isMobile && !isDesktop && (
        <Sheet open={isOpen} onOpenChange={(open) => (open ? undefined : close())}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-[85vw] max-w-[280px] p-0 bg-background border-r border-grey-200 dark:border-grey-700 flex flex-col gap-0 [&>div]:gap-0"
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
            'sidebar fixed top-0 left-0 h-dvh bg-background border-r border-grey-200 dark:border-grey-700 z-[1001] flex flex-col overflow-hidden transition-[width] duration-200',
            // Desktop (non-Tauri)
            !isDesktop && 'md:w-14',
            !isDesktop && sidebarExpanded && 'md:w-[280px]',
            // Tauri desktop mode
            isDesktop &&
              'top-[var(--titlebar-height)] h-[calc(100dvh-var(--titlebar-height))] bg-[var(--bar-background)]',
            isDesktop && !isOpen && 'w-16',
            isDesktop && isOpen && 'w-[220px]'
          )}
          aria-label="Hauptnavigation"
          onMouseEnter={isDesktop ? open : undefined}
          onMouseLeave={isDesktop && !forceExpanded ? close : undefined}
        >
          {sidebarInner}
        </aside>
      )}

      {canvasPanelContent && (
        <div
          className="fixed top-0 bottom-0 left-[var(--sidebar-collapsed-width)] z-[1005] w-auto min-w-[120px] max-w-[320px] bg-background rounded-br-xl shadow-[8px_0_24px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col"
          style={SIDEBAR_FONT_SIZES}
        >
          <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3 pt-[var(--header-height,48px)]">
            {canvasPanelContent}
          </div>
        </div>
      )}
    </TooltipProvider>
  );
};

function SidebarFavourites({
  isOpen,
  isDesktop,
  onLinkClick,
  isActive,
  forceExpanded,
}: {
  isOpen: boolean;
  isDesktop: boolean;
  onLinkClick: (path: string, title: string) => void;
  isActive: (path: string) => boolean;
  forceExpanded: boolean;
}) {
  const favouriteIds = useSidebarFavouritesStore((s) => s.favouriteIds);
  const removeFavourite = useSidebarFavouritesStore((s) => s.removeFavourite);
  const items = getFavouriteItemsById(favouriteIds);

  if (items.length === 0) return null;

  const expanded = isOpen || forceExpanded;

  const titleClass = cn(
    'font-semibold text-[0.95rem] text-foreground-heading leading-snug transition-all duration-150 font-[Raleway,PT_Sans,Arial,sans-serif] xl:text-[1rem] 2xl:text-[1.05rem]',
    expanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
  );

  return (
    <div className="flex flex-col gap-0.5 p-0 border-t border-grey-200 dark:border-grey-700 mt-1 pt-1">
      {items.map((item) => {
        const content = (
          <>
            {item.icon && (
              <item.icon
                aria-hidden="true"
                className="text-[1.4rem] text-foreground shrink-0 w-6 flex items-center justify-center transition-colors xl:text-[1.5rem] 2xl:text-[1.6rem] 2xl:w-7"
              />
            )}
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
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onLinkClick(item.path, item.title)}
                className={cn(menuLinkClass(isActive(item.path)), 'group')}
                aria-current={isActive(item.path) ? 'page' : undefined}
                type="button"
              >
                {content}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" hidden={expanded}>
              {item.title}
            </TooltipContent>
          </Tooltip>
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
}

export default Sidebar;
