import { useCanvasSidebarStore, type SidebarTabId } from '@gruenerator/canvas-editor';
import { memo, useCallback, useState, useEffect } from 'react';
import { FaCheck } from 'react-icons/fa';

import { cn } from '@/utils/cn';

export const CanvasMobileTabBar = memo(function CanvasMobileTabBar() {
  const { tabs, activeTab, disabledTabs, onTabClick, autoSaveStatus } = useCanvasSidebarStore(
    (s) => ({
      tabs: s.tabs,
      activeTab: s.activeTab,
      disabledTabs: s.disabledTabs,
      onTabClick: s.onTabClick,
      autoSaveStatus: s.autoSaveStatus,
    })
  );

  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (autoSaveStatus === 'saved') {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoSaveStatus]);

  const handleTabClick = useCallback(
    (tabId: SidebarTabId) => {
      onTabClick?.(tabId);
    },
    [onTabClick]
  );

  if (tabs.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full flex items-center justify-evenly bg-background border-t border-t-grey-200 dark:border-t-grey-700 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] pt-2 pb-[calc(6px+env(safe-area-inset-bottom))] z-[100] min-h-[var(--mobile-tab-bar-height,60px)]">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isDisabled = disabledTabs.includes(tab.id);
        const isAlternativesLoading = tab.id === 'alternatives' && isDisabled;

        return (
          <button
            key={tab.id}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 mx-0.5 rounded-lg border-none cursor-pointer min-h-[48px] transition-[background-color,color] duration-200 bg-transparent [&>svg]:size-[22px] [&>svg]:shrink-0',
              isActive
                ? 'bg-[#E8F5EE] text-[#005538] dark:bg-primary-900/40 dark:text-primary-200'
                : 'text-grey-500 dark:text-grey-400',
              isDisabled && 'opacity-40 cursor-not-allowed',
              isAlternativesLoading && 'animate-canvas-pulse'
            )}
            onClick={() => handleTabClick(tab.id as SidebarTabId)}
            disabled={isDisabled}
            aria-label={tab.ariaLabel}
            aria-pressed={isActive}
            type="button"
          >
            <Icon size={22} />
            <span className="text-[10px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
              {tab.label}
            </span>
          </button>
        );
      })}

      {autoSaveStatus && (
        <div
          className={cn(
            'flex items-center justify-center size-8 opacity-0 transition-opacity duration-300',
            autoSaveStatus === 'saving' && 'opacity-100',
            showSaved && 'opacity-100'
          )}
        >
          {autoSaveStatus === 'saving' && (
            <div className="size-4 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)] rounded-full animate-auto-save-spin" />
          )}
          {showSaved && <FaCheck size={12} className="text-green-500 animate-auto-save-check" />}
        </div>
      )}
    </div>
  );
});
