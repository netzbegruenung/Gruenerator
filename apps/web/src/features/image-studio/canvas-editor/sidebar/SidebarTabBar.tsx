import { useState, useEffect } from 'react';
import { FaCheck } from 'react-icons/fa';
import { useAutoSaveStore } from '../../hooks/useAutoSaveStore';
import type { SidebarTabBarProps, SidebarTabId } from './types';

export function SidebarTabBar({
  tabs,
  activeTab,
  onTabClick,
  onExport,
  disabledTabs = [],
  horizontal = false,
}: SidebarTabBarProps) {
  // Read autoSaveStatus directly from store to avoid prop-drilling re-renders
  const autoSaveStatus = useAutoSaveStore((s) => s.autoSaveStatus);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 900
  );
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Show "saved" indicator briefly after save completes
  useEffect(() => {
    if (autoSaveStatus === 'saved') {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [autoSaveStatus]);

  // Auto-detect horizontal layout on mobile
  const isHorizontal = horizontal || isMobile;

  return (
    <div className={`sidebar-tab-bar ${isHorizontal ? 'sidebar-tab-bar--horizontal' : ''}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isDisabled = disabledTabs.includes(tab.id);
        const isAlternativesLoading = tab.id === 'alternatives' && isDisabled;

        return (
          <button
            key={tab.id}
            className={`sidebar-tab-bar__tab ${isActive ? 'sidebar-tab-bar__tab--active' : ''} ${isAlternativesLoading ? 'sidebar-tab-bar__tab--loading' : ''}`}
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

      {/* Auto-save status indicator */}
      {autoSaveStatus && (
        <div
          className={`sidebar-tab-bar__auto-save ${
            autoSaveStatus === 'saving' ? 'sidebar-tab-bar__auto-save--saving' : ''
          } ${showSaved ? 'sidebar-tab-bar__auto-save--saved' : ''}`}
          title={
            autoSaveStatus === 'saving' ? 'Wird gespeichert...' :
            autoSaveStatus === 'saved' ? 'Gespeichert' :
            autoSaveStatus === 'error' ? 'Fehler beim Speichern' : ''
          }
        >
          {autoSaveStatus === 'saving' && (
            <div className="sidebar-tab-bar__auto-save-spinner" />
          )}
          {showSaved && (
            <FaCheck size={14} className="sidebar-tab-bar__auto-save-check" />
          )}
        </div>
      )}
    </div>
  );
}
