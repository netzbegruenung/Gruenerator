import { useCanvasSidebarStore, SIDEBAR_FONT_SIZES } from '@gruenerator/canvas-editor';
import { useAgentStore } from '@gruenerator/chat';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { FaCheck } from 'react-icons/fa';
import { PiSun, PiMoon, PiHouse, PiX } from 'react-icons/pi';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
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
import '../../../assets/styles/components/layout/sidebar.css';

interface SidebarProps {
  isDesktop?: boolean;
  onNavigate?: (path: string, title: string) => void;
}

const Sidebar = ({ isDesktop = false, onNavigate }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, close, open, forceExpanded, requestForceExpanded, releaseForceExpanded } =
    useSidebarStore();
  const isChatRoute = location.pathname.startsWith('/chat');

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

  // Close sidebar on route change (skip when forceExpanded)
  useEffect(() => {
    if (!forceExpanded) {
      close();
    }
  }, [location.pathname]);

  // Force sidebar open on /chat route
  useEffect(() => {
    if (isChatRoute) {
      requestForceExpanded('chat');
    } else {
      releaseForceExpanded('chat');
    }
  }, [isChatRoute, requestForceExpanded, releaseForceExpanded]);

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

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, close]);

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

  return (
    <>
      <aside
        className={`sidebar ${isOpen ? 'sidebar--open' : ''} ${isDesktop ? 'sidebar--desktop' : ''} ${forceExpanded && isOpen ? 'sidebar--chat' : ''}`}
        aria-label="Hauptnavigation"
        onMouseEnter={isDesktop ? open : undefined}
        onMouseLeave={isDesktop && !forceExpanded ? close : undefined}
      >
        {/* Logo - desktop only */}
        {isDesktop && (
          <button
            className="sidebar-logo"
            onClick={() => handleLinkClick('/', 'Start')}
            type="button"
            title="Zur Startseite"
          >
            <img src="/images/logo-square.png" alt="Grünerator" className="sidebar-logo-icon" />
            {isOpen && <span className="sidebar-logo-text">Grünerator</span>}
          </button>
        )}

        {/* Sidebar Header - Home & Close */}
        {!isDesktop && (
          <div className="sidebar-header">
            <button
              className="sidebar-header-btn"
              onClick={() => handleLinkClick('/', 'Start')}
              type="button"
              title="Zur Startseite"
              aria-label="Zur Startseite"
            >
              <PiHouse aria-hidden="true" />
            </button>
            <button
              className="sidebar-header-btn sidebar-header-close"
              onClick={close}
              type="button"
              aria-label="Menü schließen"
            >
              <PiX aria-hidden="true" />
            </button>
          </div>
        )}

        <nav className="sidebar-nav">
          {/* Canvas editor tabs — replaces normal nav when canvas is active */}
          {canvasIsActive ? (
            <div className="sidebar-main-nav" style={{ paddingTop: 'var(--spacing-small)' }}>
              {canvasTabs.map((tab) => {
                const Icon = tab.icon;
                const isTabActive = canvasActiveTab === tab.id;
                const isTabDisabled = canvasDisabledTabs.includes(tab.id);
                return (
                  <button
                    key={tab.id}
                    className={`sidebar-menu-link${isTabActive ? ' sidebar-menu-link--active' : ''}${isTabDisabled ? ' sidebar-menu-link--disabled' : ''}`}
                    onClick={() => !isTabDisabled && canvasOnTabClick?.(tab.id)}
                    disabled={isTabDisabled}
                    title={tab.label}
                    aria-label={tab.ariaLabel}
                    aria-pressed={isTabActive}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="sidebar-item-icon" />
                    <span className="sidebar-item-title">{tab.label}</span>
                  </button>
                );
              })}

              {/* Auto-save indicator */}
              {canvasAutoSaveStatus && (
                <div
                  className={`sidebar-menu-link justify-center cursor-default min-h-8 transition-opacity duration-300 ${canvasAutoSaveStatus === 'saving' || showCanvasSaved ? 'opacity-100' : 'opacity-0'}`}
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
                <div className="sidebar-main-nav">
                  {additionalItems.map((item) =>
                    !item.path ? (
                      <span
                        key={item.id}
                        className="sidebar-menu-link sidebar-menu-link--disabled"
                        title={!isOpen ? item.title : undefined}
                      >
                        {item.icon && (
                          <item.icon aria-hidden="true" className="sidebar-item-icon" />
                        )}
                        <span className="sidebar-item-title">{item.title}</span>
                        {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
                      </span>
                    ) : isDesktop ? (
                      <button
                        key={item.id}
                        onClick={() =>
                          item.id === 'chat'
                            ? handleChatClick()
                            : handleLinkClick(item.path!, item.title)
                        }
                        className={`sidebar-menu-link ${isActive(item.path!) ? 'sidebar-menu-link--active' : ''}`}
                        aria-current={isActive(item.path!) ? 'page' : undefined}
                        title={!isOpen ? item.title : undefined}
                        type="button"
                      >
                        {item.icon && (
                          <item.icon aria-hidden="true" className="sidebar-item-icon" />
                        )}
                        <span className="sidebar-item-title">{item.title}</span>
                        {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
                      </button>
                    ) : (
                      <Link
                        key={item.id}
                        to={item.path!}
                        className="sidebar-menu-link"
                        onClick={() =>
                          item.id === 'chat'
                            ? handleChatClick()
                            : handleLinkClick(item.path!, item.title)
                        }
                      >
                        {item.icon && (
                          <item.icon aria-hidden="true" className="sidebar-item-icon" />
                        )}
                        <span className="sidebar-item-title">{item.title}</span>
                        {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
                      </Link>
                    )
                  )}
                </div>
              )}

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
                    sidebarExpanded={isOpen}
                  />
                ))}
            </>
          )}
        </nav>

        <div id="chat-thread-portal-slot" className="sidebar-chat-threads" />

        {/* Footer - pushed to bottom */}
        <div className="sidebar-footer">
          <button
            className="sidebar-theme-toggle"
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
          >
            {darkMode ? <PiMoon aria-hidden="true" /> : <PiSun aria-hidden="true" />}
          </button>
          {!isDesktop &&
            footerLinks.map((item) => (
              <Link
                key={item.id}
                to={item.path!}
                className="sidebar-footer-link"
                onClick={() => handleLinkClick(item.path!, item.title)}
              >
                <span className="sidebar-footer-link-title">{item.title}</span>
              </Link>
            ))}
        </div>
      </aside>

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
    </>
  );
};

export default Sidebar;
