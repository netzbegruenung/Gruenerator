import React, { useMemo, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getMenuItems } from '../Header/menuData';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';
import { PiHouse } from 'react-icons/pi';
import './desktop-sidebar.css';

const DesktopSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getBetaFeatureState } = useBetaFeatures();
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';
  const [expanded, setExpanded] = useState(false);

  const { createTab, tabs, activeTabId } = useDesktopTabsStore();

  const betaFeatures = useMemo(() => ({
    databaseBetaEnabled: getBetaFeatureState('database'),
    youBetaEnabled: getBetaFeatureState('you'),
    chatBetaEnabled: getBetaFeatureState('chat'),
    igelModeEnabled: getBetaFeatureState('igel_modus'),
    isAustrian
  }), [getBetaFeatureState, isAustrian]);

  const menuItems = useMemo(() => getMenuItems(betaFeatures), [betaFeatures]);

  const isActive = (path) => location.pathname === path;

  const handleNavigation = useCallback((path, title) => {
    const activeTab = tabs.find(t => t.id === activeTabId);

    if (activeTab && activeTab.route === path) {
      return;
    }

    createTab(path, title);
    navigate(path);
  }, [tabs, activeTabId, createTab, navigate]);

  return (
    <aside
      className={`desktop-sidebar ${expanded ? 'expanded' : ''}`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div className="sidebar-content">
        <div className="sidebar-logo">
          <img
            src="/images/logo-square.png"
            alt="Grünerator"
            className="sidebar-logo-icon"
          />
          {expanded && <span className="sidebar-logo-text">Grünerator</span>}
        </div>

        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          <button
            onClick={() => handleNavigation('/', 'Start')}
            className={`sidebar-item ${isActive('/') ? 'active' : ''}`}
            aria-current={isActive('/') ? 'page' : undefined}
            type="button"
          >
            <span className="sidebar-icon">
              <PiHouse aria-hidden="true" />
            </span>
            {expanded && <span className="sidebar-label">Start</span>}
          </button>

          {Object.entries(menuItems).map(([sectionKey, section]) => (
            <div key={sectionKey} className="sidebar-section">
              {expanded && (
                <span className="sidebar-section-title">{section.title}</span>
              )}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path, item.title)}
                  className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                  aria-current={isActive(item.path) ? 'page' : undefined}
                  title={!expanded ? item.title : undefined}
                  type="button"
                >
                  <span className="sidebar-icon">
                    {item.icon && <item.icon aria-hidden="true" />}
                  </span>
                  {expanded && <span className="sidebar-label">{item.title}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default DesktopSidebar;
