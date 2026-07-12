import { useState, useEffect, memo, useCallback } from 'react';
import { FaCheck, FaExclamationTriangle } from 'react-icons/fa';
import { useMediaQuery } from '@gruenerator/shared/hooks';

import { useAutoSaveStore } from '../stores/useAutoSaveStore';

import type { SidebarTabBarProps, SidebarTabId, SidebarTab } from './types';

import { cn } from '../utils/cn';

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

  const handleClick = useCallback(() => {
    onTabClick(tab.id as SidebarTabId);
  }, [onTabClick, tab.id]);

  if (isMobile) {
    return (
      <button
        className={cn(
          'min-w-14 flex flex-col items-center justify-center gap-1 py-1.5 mx-0.5 rounded-[10px] border-none cursor-pointer min-h-[48px] transition-[background-color,color] duration-200 bg-transparent [&>svg]:size-[19px] [&>svg]:shrink-0',
          isActive
            ? 'bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)] font-bold'
            : 'text-[var(--editor-text-secondary)]',
          isDisabled && 'opacity-40 cursor-not-allowed'
        )}
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={tab.ariaLabel}
        aria-pressed={isActive}
        type="button"
      >
        <Icon size={19} />
        <span className="text-[9.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
          {tab.label}
        </span>
      </button>
    );
  }

  return (
    <button
      className={cn(
        'sidebar-tab-bar__tab w-[62px] py-[9px] flex flex-col items-center justify-center gap-1.5 border-none bg-transparent rounded-[10px] cursor-pointer text-[var(--editor-text-secondary)] transition-[background-color,color] duration-200 [&>svg]:size-[21px] [&>svg]:shrink-0 hover:enabled:bg-[var(--editor-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed',
        isActive &&
          'sidebar-tab-bar__tab--active bg-[var(--editor-active-bg)] text-[var(--editor-active-fg)] font-bold'
      )}
      onClick={handleClick}
      disabled={isDisabled}
      aria-label={tab.ariaLabel}
      aria-pressed={isActive}
      title={tab.label}
      type="button"
    >
      <Icon size={21} />
      <span className="sidebar-tab-bar__label text-[10.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
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
  const retryAutoSave = useAutoSaveStore((s) => s.retryAutoSave);
  const isMobile = useMediaQuery('(max-width: 899px)');
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (autoSaveStatus === 'saved') {
      setShowSaved(true);
      const timer = setTimeout(() => setShowSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoSaveStatus]);

  const isHorizontal = horizontal || isMobile;

  if (isMobile) {
    return (
      <div className="fixed bottom-0 left-0 right-0 w-full flex items-center justify-evenly overflow-x-auto bg-[var(--editor-surface)] border-t border-[var(--editor-border)] shadow-[0_-2px_8px_rgba(0,0,0,0.08)] pt-2 pb-[calc(6px+env(safe-area-inset-bottom))] z-[100] min-h-[var(--mobile-tab-bar-height,60px)]">
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
      </div>
    );
  }

  return (
    <div
      className={cn(
        'sidebar-tab-bar flex flex-col items-center justify-start gap-1 pt-2 shrink-0 w-[76px] h-full bg-[var(--editor-surface)] border-r border-[var(--editor-border)]',
        isHorizontal && 'flex-row'
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

      <div className="sidebar-tab-bar__separator w-8 h-px bg-grey-200 dark:bg-grey-700 my-sm" />

      {autoSaveStatus && (
        <div
          className={cn(
            'flex items-center justify-center size-10 opacity-0 transition-opacity duration-300',
            autoSaveStatus === 'saving' && 'opacity-100',
            autoSaveStatus === 'error' && 'opacity-100',
            showSaved && 'opacity-100'
          )}
          title={
            autoSaveStatus === 'saving'
              ? 'Wird gespeichert...'
              : autoSaveStatus === 'saved'
                ? 'Gespeichert'
                : autoSaveStatus === 'error'
                  ? 'Fehler beim Speichern — klicken zum Wiederholen'
                  : ''
          }
        >
          {autoSaveStatus === 'saving' && (
            <div className="size-4 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)] rounded-full animate-auto-save-spin" />
          )}
          {showSaved && <FaCheck size={14} className="text-green-500 animate-auto-save-check" />}
          {autoSaveStatus === 'error' && (
            <button
              className="bg-transparent border-none p-0 cursor-pointer flex items-center justify-center"
              onClick={() => retryAutoSave?.()}
              aria-label="Speichern erneut versuchen"
              type="button"
            >
              <FaExclamationTriangle size={14} className="text-red-500" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
