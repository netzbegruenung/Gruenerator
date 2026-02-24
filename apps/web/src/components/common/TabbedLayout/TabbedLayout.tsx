import React, { memo, useMemo, type ReactNode, type CSSProperties } from 'react';

import { cn } from '@/utils/cn';

export interface TabConfig<T extends string = string> {
  id: T;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
  disabled?: boolean;
  locked?: boolean;
}

export interface TabbedLayoutProps<T extends string = string> {
  /** Array of tab configurations */
  tabs: TabConfig<T>[];
  /** Currently active tab ID */
  activeTab: T;
  /** Callback when tab changes */
  onTabChange: (tabId: T) => void;
  /** Tab panel content - keyed by tab ID */
  children: Record<T, ReactNode>;
  /** Optional header content (title, etc.) shown above tabs */
  header?: ReactNode;
  /** Whether the layout is in compact mode (reduced header padding) */
  compact?: boolean;
  /** Whether to expand content to full width (e.g., after content is generated) */
  fullWidth?: boolean;
  /** Whether tabs are disabled */
  disabled?: boolean;
  /** Custom class name for the wrapper */
  className?: string;
  /** ARIA label for the tab list */
  ariaLabel?: string;
  /** Custom tab button renderer for advanced cases (dropdowns, etc.) */
  renderTab?: (tab: TabConfig<T>, isActive: boolean, onClick: () => void) => ReactNode;
  /** Loading fallback component */
  loadingFallback?: ReactNode;
}

const DEFAULT_LOADING_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '400px',
  color: 'var(--font-color-secondary)',
};

const DefaultLoadingFallback = memo(() => (
  <div style={DEFAULT_LOADING_STYLE}>
    <div className="loading-spinner" />
  </div>
));
DefaultLoadingFallback.displayName = 'DefaultLoadingFallback';

function TabbedLayoutInner<T extends string = string>({
  tabs,
  activeTab,
  onTabChange,
  children,
  header,
  compact = false,
  fullWidth = false,
  disabled = false,
  className = '',
  ariaLabel = 'Tab navigation',
  renderTab,
  loadingFallback,
}: TabbedLayoutProps<T>) {
  const handleTabClick = (tabId: T) => {
    if (!disabled && tabId !== activeTab) {
      onTabChange(tabId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, tabId: T) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleTabClick(tabId);
    }
  };

  return (
    <div
      className={cn(
        'tabbed-layout w-full flex flex-col items-center overflow-x-hidden pt-2xl',
        'max-md:px-md max-md:pt-lg',
        'max-[400px]:px-sm max-[400px]:pt-md',
        fullWidth && 'tabbed-layout--full-width',
        className
      )}
    >
      <header
        className={cn(
          'tabbed-layout__header w-full max-w-[800px] flex flex-col items-center gap-md px-md pb-lg box-border',
          'xl:max-w-[1000px] 3xl:max-w-[1100px]',
          'max-md:px-sm max-md:pb-md max-md:gap-sm',
          'max-[400px]:px-xs max-[400px]:pb-sm',
          compact && 'pb-sm gap-0 max-md:pb-xs max-[400px]:pb-xxs'
        )}
      >
        {header}
        <div
          className={cn(
            'flex flex-wrap justify-center gap-sm w-full max-[640px]:gap-xs',
            disabled && 'opacity-60 pointer-events-none'
          )}
          role="tablist"
          aria-label={ariaLabel}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;

            if (renderTab) {
              return (
                <React.Fragment key={tab.id}>
                  {renderTab(tab, isActive, () => handleTabClick(tab.id))}
                </React.Fragment>
              );
            }

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                className={cn(
                  'flex items-center gap-xs px-md py-sm',
                  'border border-foreground rounded-full',
                  'bg-transparent text-foreground text-[0.9rem] font-medium',
                  'cursor-pointer transition-all duration-150 whitespace-nowrap',
                  'hover:bg-background-alt',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'focus-visible:outline-2 focus-visible:outline-[var(--himmel)] focus-visible:outline-offset-2',
                  'max-[640px]:px-sm max-[640px]:py-xs max-[640px]:text-[0.85rem]',
                  'max-[400px]:px-sm max-[400px]:py-xs',
                  isActive &&
                    'bg-secondary-600 border-secondary-600 text-white hover:bg-secondary-600'
                )}
                onClick={() => handleTabClick(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                disabled={disabled || tab.disabled}
                tabIndex={isActive ? 0 : -1}
              >
                {tab.icon && (
                  <span
                    className={cn('flex items-center shrink-0', isActive && 'brightness-0 invert')}
                  >
                    {tab.icon}
                  </span>
                )}
                <span className="max-[640px]:hidden">{tab.label}</span>
                {tab.shortLabel && (
                  <span className="hidden max-[640px]:inline max-[400px]:text-[0.75rem]">
                    {tab.shortLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div
        className={cn(
          'w-full max-w-[800px] mx-auto grid grid-cols-1 grid-rows-1',
          'xl:max-w-[1000px] 3xl:max-w-[1100px]',
          'focus-visible:outline-2 focus-visible:outline-[var(--himmel)] focus-visible:outline-offset-[-2px] focus-visible:rounded-lg',
          fullWidth && 'max-w-full px-lg'
        )}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`tabpanel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            className={cn(
              'col-start-1 row-start-1 w-full min-w-0',
              tab.id !== activeTab && 'hidden'
            )}
            data-active={tab.id === activeTab}
          >
            {children[tab.id] ?? loadingFallback ?? <DefaultLoadingFallback />}
          </div>
        ))}
      </div>
    </div>
  );
}

export const TabbedLayout = memo(TabbedLayoutInner) as typeof TabbedLayoutInner;

export default TabbedLayout;
