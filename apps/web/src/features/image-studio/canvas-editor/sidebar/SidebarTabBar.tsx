import { useState, useEffect } from 'react';
import { FaCheck, FaSave } from 'react-icons/fa';
import { useCanvasEditorStore } from '../../../../stores/canvasEditorStore';
import type { SidebarTabBarProps, SidebarTabId } from './types';



export function SidebarTabBar({
  tabs,
  activeTab,
  onTabClick,
  onExport,
  onSave,
  disabledTabs = [],
  horizontal = false,
}: SidebarTabBarProps) {


  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900
  );

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auto-detect horizontal layout on mobile
  const isHorizontal = horizontal || isMobile;


  return (
    <div className={`sidebar-tab-bar ${isHorizontal ? 'sidebar-tab-bar--horizontal' : ''}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isDisabled = disabledTabs.includes(tab.id);

        return (
          <button
            key={tab.id}
            className={`sidebar-tab-bar__tab ${isActive ? 'sidebar-tab-bar__tab--active' : ''}`}
            onClick={() => {
              onTabClick(tab.id as SidebarTabId);
            }}
            disabled={isDisabled}
            aria-label={tab.ariaLabel}
            aria-pressed={isActive}
            title={tab.label}
            type="button"
          >
            <Icon size={isMobile ? 20 : 22} />
            <span className="sidebar-tab-bar__label">{tab.label}</span>
          </button>
        );
      })}



      <div className="sidebar-tab-bar__separator" />

      {(onExport || onSave) && (
        <>
          <div className="sidebar-tab-bar__separator" />
          {onSave && (
            <button
              className="sidebar-tab-bar__tab sidebar-tab-bar__tab--save"
              onClick={onSave}
              aria-label="Speichern"
              title="Speichern"
              type="button"
            >
              <FaSave size={20} />
            </button>
          )}
          {onExport && (
            <button
              className="sidebar-tab-bar__tab sidebar-tab-bar__tab--export"
              onClick={onExport}
              aria-label="Fertig"
              title="Fertig"
              type="button"
              style={{ color: 'var(--primary-600)' }}
            >
              <FaCheck size={20} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
