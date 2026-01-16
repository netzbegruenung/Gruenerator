import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { PiSun, PiMoon } from 'react-icons/pi';
import { getMenuItems, getDirectMenuItems, getMobileOnlyMenuItems, getFooterLinks, type MenuItemType, type MenuSection } from '../Header/menuData';
import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
import useSidebarStore from '../../../stores/sidebarStore';
import Icon from '../../common/Icon';
import SidebarSection from './SidebarSection';
import '../../../assets/styles/components/layout/sidebar.css';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, close } = useSidebarStore();

  useLazyAuth();
  const { user } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();

  const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
  const chatBetaEnabled = useMemo(() => getBetaFeatureState('chat'), [getBetaFeatureState]);
  const igelModeEnabled = useMemo(() => getBetaFeatureState('igel_modus'), [getBetaFeatureState]);
  const notebookBetaEnabled = useMemo(() => getBetaFeatureState('notebook'), [getBetaFeatureState]);
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.getAttribute('data-theme') === 'dark'
  );

  const menuItems = useMemo(() => getMenuItems(
    { databaseBetaEnabled, chatBetaEnabled, igelModeEnabled, notebookBetaEnabled, isAustrian }
  ), [databaseBetaEnabled, chatBetaEnabled, igelModeEnabled, notebookBetaEnabled, isAustrian]);

  const directMenuItems = useMemo(() => getDirectMenuItems({ databaseBetaEnabled, chatBetaEnabled, notebookBetaEnabled, isAustrian }), [databaseBetaEnabled, chatBetaEnabled, notebookBetaEnabled, isAustrian]);
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

  const handleLinkClick = useCallback((path: string) => {
    navigate(path);
    close();
  }, [navigate, close]);

  const toggleDarkMode = useCallback(() => {
    const newTheme = darkMode ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    setDarkMode(!darkMode);
  }, [darkMode]);

  return (
    <aside
      className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}
      aria-label="Hauptnavigation"
    >
      <nav className="sidebar-nav">
        {/* Direct menu items - main navigation */}
        {additionalItems.length > 0 && (
          <div className="sidebar-main-nav">
            {additionalItems.map((item) => (
              <Link
                key={item.id}
                to={item.path}
                className="sidebar-menu-link"
                onClick={() => handleLinkClick(item.path)}
              >
                {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
                <span className="sidebar-item-title">{item.title}</span>
              </Link>
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
        {footerLinks.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className="sidebar-footer-link"
            onClick={() => handleLinkClick(item.path)}
          >
            <span className="sidebar-footer-link-title">{item.title}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;
