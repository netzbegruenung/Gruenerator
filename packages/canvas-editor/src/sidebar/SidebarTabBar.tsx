import { memo, useCallback } from 'react';

import { useIsCanvasMobile } from '../hooks/useIsCanvasMobile';
import { AutoSaveIndicator } from '../components/TopBar/AutoSaveIndicator';

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
          'flex-1 min-w-0 flex flex-col items-center gap-1 border-none bg-transparent p-0 cursor-pointer select-none',
          isActive ? 'text-[var(--editor-active-fg)]' : 'text-[var(--editor-text-secondary)]',
          isDisabled && 'opacity-40 cursor-not-allowed'
        )}
        onClick={handleClick}
        disabled={isDisabled}
        aria-label={tab.ariaLabel}
        aria-pressed={isActive}
        data-tour={`canvas-tab-${tab.id}`}
        type="button"
      >
        <span
          className={cn(
            'flex items-center justify-center w-[52px] h-8 rounded-2xl transition-colors duration-150',
            isActive && 'bg-[var(--editor-active-bg)]'
          )}
        >
          <Icon size={20} />
        </span>
        <span className="text-[11px] font-bold tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
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
      data-tour={`canvas-tab-${tab.id}`}
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
  const isMobile = useIsCanvasMobile();

  const isHorizontal = horizontal || isMobile;

  // Eine feste Leiste: immer dieselben Einträge an derselben Stelle. Sie liegt
  // im Fluss unter dem Sheet (order-2), damit der Canvas darüber schrumpft,
  // statt verdeckt zu werden.
  if (isMobile) {
    return (
      <nav
        aria-label="Editor-Bereiche"
        data-suppress-feedback-launcher=""
        className="order-2 flex-none flex h-[calc(64px+env(safe-area-inset-bottom))] pt-2 px-1 pb-[env(safe-area-inset-bottom)] bg-[var(--editor-surface)] border-t border-[var(--editor-border)]"
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
      </nav>
    );
  }

  return (
    <div
      data-tour="canvas-tabs"
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

      <div className="sidebar-tab-bar__separator w-8 h-px bg-[var(--editor-border-strong)] my-sm" />

      <AutoSaveIndicator />
    </div>
  );
});
