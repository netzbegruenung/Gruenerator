import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PiSun, PiMoon } from 'react-icons/pi';
import { getMenuItems, getDirectMenuItems, getMobileOnlyMenuItems, getFooterLinks, type MenuItemType, type MenuSection } from '../Header/menuData';
import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarStore from '../../../stores/sidebarStore';
import SidebarSection from './SidebarSection';
import { StatusBadge } from '../../common/StatusBadge';
import '../../../assets/styles/components/layout/sidebar.css';

interface SidebarProps {
  isDesktop?: boolean;
  onNavigate?: (path: string, title: string) => void;
}

const Sidebar = ({ isDesktop = false, onNavigate }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, close, open } = useSidebarStore();

  useLazyAuth();
  const { user } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();

  const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
  const chatBetaEnabled = useMemo(() => getBetaFeatureState('chat'), [getBetaFeatureState]);
  const igelModeEnabled = useMemo(() => getBetaFeatureState('igel_modus'), [getBetaFeatureState]);
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  );

  const menuItems = useMemo(() => getMenuItems(
    { databaseBetaEnabled, chatBetaEnabled, igelModeEnabled, isAustrian }
  ), [databaseBetaEnabled, chatBetaEnabled, igelModeEnabled, isAustrian]);

  const directMenuItems = useMemo(() => getDirectMenuItems({ databaseBetaEnabled, chatBetaEnabled, isAustrian }), [databaseBetaEnabled, chatBetaEnabled, isAustrian]);
  const mobileOnlyItems = useMemo(() => getMobileOnlyMenuItems(), []);
  const additionalItems = useMemo<MenuItemType[]>(() => [...Object.values(directMenuItems), ...Object.values(mobileOnlyItems)], [directMenuItems, mobileOnlyItems]);
  const footerLinks = useMemo(() => getFooterLinks(), []);

  // Close sidebar on route change
  useEffect(() => {
    close();
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
    setActiveSection(prev => prev === sectionKey ? null : sectionKey);
  }, []);

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const handleLinkClick = useCallback((path: string, title: string = '') => {
    if (onNavigate) {
      onNavigate(path, title);
    } else {
      navigate(path);
    }
    close();
  }, [navigate, close, onNavigate]);

  const toggleDarkMode = useCallback(() => {
    const newTheme = darkMode ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    setDarkMode(!darkMode);
  }, [darkMode]);

  return (
    <aside
      className={`sidebar ${isOpen ? 'sidebar--open' : ''} ${isDesktop ? 'sidebar--desktop' : ''}`}
      aria-label="Hauptnavigation"
      onMouseEnter={isDesktop ? open : undefined}
      onMouseLeave={isDesktop ? close : undefined}
    >
      {/* Logo - desktop only */}
      {isDesktop && (
        <button
          className="sidebar-logo"
          onClick={() => handleLinkClick('/', 'Start')}
          type="button"
          title="Zur Startseite"
        >
          <img
            src="/images/logo-square.png"
            alt="Grünerator"
            className="sidebar-logo-icon"
          />
          {isOpen && <span className="sidebar-logo-text">Grünerator</span>}
        </button>
      )}

      <nav className="sidebar-nav">
        {/* Direct menu items - main navigation */}
        {additionalItems.length > 0 && (
          <div className="sidebar-main-nav">
            {additionalItems.map((item) => (
              isDesktop ? (
                <button
                  key={item.id}
                  onClick={() => handleLinkClick(item.path, item.title)}
                  className={`sidebar-menu-link ${isActive(item.path) ? 'sidebar-menu-link--active' : ''}`}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                  title={!isOpen ? item.title : undefined}
                  type="button"
                >
                  {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
                  <span className="sidebar-item-title">{item.title}</span>
                  {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
                </button>
              ) : (
                <Link
                  key={item.id}
                  to={item.path}
                  className="sidebar-menu-link"
                  onClick={() => handleLinkClick(item.path, item.title)}
                >
                  {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
                  <span className="sidebar-item-title">{item.title}</span>
                  {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
                </Link>
              )
            ))}
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

        </nav>

      {/* Footer - pushed to bottom */}
      <div className="sidebar-footer">
        <button
          className="sidebar-theme-toggle"
          onClick={toggleDarkMode}
          aria-label={darkMode ? "Zum hellen Modus wechseln" : "Zum dunklen Modus wechseln"}
        >
          {darkMode ? <PiMoon aria-hidden="true" /> : <PiSun aria-hidden="true" />}
        </button>
        {!isDesktop && footerLinks.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className="sidebar-footer-link"
            onClick={() => handleLinkClick(item.path, item.title)}
          >
            <span className="sidebar-footer-link-title">{item.title}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;
