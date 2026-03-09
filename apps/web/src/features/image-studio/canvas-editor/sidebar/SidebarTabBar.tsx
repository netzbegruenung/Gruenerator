import { useState, useEffect, memo, useCallback } from 'react';
import { FaCheck } from 'react-icons/fa';

import { useAutoSaveStore } from '../../hooks/useAutoSaveStore';

import type { SidebarTabBarProps, SidebarTabId, SidebarTab } from './types';

import { cn } from '@/utils/cn';

interface TabButtonProps {
  tab: SidebarTab;
  isActive: boolean;
  isDisabled: boolean;
  isMobile: boolean;
  onTabClick: (tabId: SidebarTabId) => void;
}

const TabButton = memo(function TabButton({
  tab,
  isActive,
  isDisabled,
  isMobile,
  onTabClick,
}: TabButtonProps) {
  const Icon = tab.icon;
  const isAlternativesLoading = tab.id === 'alternatives' && isDisabled;

  const handleClick = useCallback(() => {
    onTabClick(tab.id as SidebarTabId);
  }, [onTabClick, tab.id]);

  return (
    <button
      className={cn(
        'sidebar-tab-bar__tab relative w-[72px] h-14 flex flex-col items-center justify-center gap-0.5 border-none bg-transparent rounded-lg cursor-pointer text-foreground transition-[background-color,color] duration-200 p-1 [&>svg]:size-[22px] [&>svg]:shrink-0 hover:enabled:bg-background-alt disabled:opacity-40 disabled:cursor-not-allowed',
        'max-canvas-mobile:shrink-0 max-canvas-mobile:min-w-[44px] max-canvas-mobile:w-auto max-canvas-mobile:h-[52px] max-canvas-mobile:p-1',
        isActive &&
          'sidebar-tab-bar__tab--active bg-background-alt text-[var(--interactive-accent-color)] before:content-[""] before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-6 before:bg-[var(--interactive-accent-color)] before:rounded-r max-canvas-mobile:before:left-1/2 max-canvas-mobile:before:top-0 max-canvas-mobile:before:bottom-auto max-canvas-mobile:before:-translate-x-1/2 max-canvas-mobile:before:translate-y-0 max-canvas-mobile:before:w-6 max-canvas-mobile:before:h-[3px] max-canvas-mobile:before:rounded-b max-canvas-mobile:before:rounded-t-none',
        isAlternativesLoading && 'animate-canvas-pulse'
      )}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={tab.ariaLabel}
      aria-pressed={isActive}
      title={tab.label}
      type="button"
    >
      <Icon size={isMobile ? 20 : 22} />
      <span className="sidebar-tab-bar__label text-[length:var(--font-size-xxs)] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-full max-canvas-mobile:text-[7px]">
        {tab.label}
      </span>
    </button>
  );
});

export const SidebarTabBar = memo(function SidebarTabBar({
  tabs,
  activeTab,
  onTabClick,
  onExport,
  disabledTabs = [],
  horizontal = false,
}: SidebarTabBarProps) {
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

  useEffect(() => {
    if (autoSaveStatus === 'saved') {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [autoSaveStatus]);

  const isHorizontal = horizontal || isMobile;

  return (
    <div
      className={cn(
        'sidebar-tab-bar flex flex-col items-center gap-sm shrink-0 w-16 h-full bg-background shadow-[4px_0_12px_rgba(0,0,0,0.08)] pt-[var(--header-height,48px)] pb-md',
        isHorizontal && 'flex-row',
        'max-canvas-mobile:fixed max-canvas-mobile:bottom-0 max-canvas-mobile:left-0 max-canvas-mobile:right-0 max-canvas-mobile:w-full max-canvas-mobile:h-[var(--mobile-tab-bar-height,60px)] max-canvas-mobile:flex-row max-canvas-mobile:overflow-x-auto max-canvas-mobile:overflow-y-hidden max-canvas-mobile:[-webkit-overflow-scrolling:touch] max-canvas-mobile:[scrollbar-width:none] max-canvas-mobile:bg-background max-canvas-mobile:border-t max-canvas-mobile:border-t-[var(--border-subtle)] max-canvas-mobile:shadow-[0_-2px_8px_rgba(0,0,0,0.08)] max-canvas-mobile:py-1 max-canvas-mobile:px-1.5 max-canvas-mobile:pb-[calc(4px+env(safe-area-inset-bottom))] max-canvas-mobile:gap-0.5 max-canvas-mobile:items-center max-canvas-mobile:justify-start max-canvas-mobile:z-[100] max-canvas-mobile:[&::-webkit-scrollbar]:hidden max-canvas-mobile:pt-0 max-canvas-mobile:border-r-0 max-canvas-mobile:shadow-none max-canvas-mobile:w-full max-canvas-mobile:h-[var(--mobile-tab-bar-height,60px)]'
      )}
    >
      {tabs.map((tab) => (
        <TabButton
          key={tab.id}
          tab={tab}
          isActive={activeTab === tab.id}
          isDisabled={disabledTabs.includes(tab.id)}
          isMobile={isMobile}
          onTabClick={onTabClick}
        />
      ))}

      <div className="sidebar-tab-bar__separator w-8 h-px bg-grey-200 dark:bg-grey-700 my-sm max-canvas-mobile:w-px max-canvas-mobile:h-8 max-canvas-mobile:mx-xs max-canvas-mobile:my-0 max-canvas-mobile:shrink-0" />

      {autoSaveStatus && (
        <div
          className={cn(
            'flex items-center justify-center size-10 opacity-0 transition-opacity duration-300',
            autoSaveStatus === 'saving' && 'opacity-100',
            showSaved && 'opacity-100'
          )}
          title={
            autoSaveStatus === 'saving'
              ? 'Wird gespeichert...'
              : autoSaveStatus === 'saved'
                ? 'Gespeichert'
                : autoSaveStatus === 'error'
                  ? 'Fehler beim Speichern'
                  : ''
          }
        >
          {autoSaveStatus === 'saving' && (
            <div className="size-4 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)] rounded-full animate-auto-save-spin" />
          )}
          {showSaved && <FaCheck size={14} className="text-green-500 animate-auto-save-check" />}
        </div>
      )}
    </div>
  );
});
