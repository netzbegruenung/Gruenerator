import React, { memo, useMemo, type ReactNode, type CSSProperties } from 'react';

import './TabbedLayout.css';

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
  /** Whether the layout is in compact mode */
  compact?: boolean;
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
  disabled = false,
  className = '',
  ariaLabel = 'Tab navigation',
  renderTab,
  loadingFallback,
}: TabbedLayoutProps<T>) {
  const wrapperClassName = useMemo(
    () => `tabbed-layout ${compact ? 'tabbed-layout--compact' : ''} ${className}`.trim(),
    [compact, className]
  );

  const headerClassName = useMemo(
    () => `tabbed-layout__header ${compact ? 'tabbed-layout__header--compact' : ''}`,
    [compact]
  );

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
    <div className={wrapperClassName}>
      <header className={headerClassName}>
        {header}
        <div
          className={`tabbed-layout__tabs ${disabled ? 'tabbed-layout__tabs--disabled' : ''}`}
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
                className={`tabbed-layout__tab ${isActive ? 'tabbed-layout__tab--active' : ''}`}
                onClick={() => handleTabClick(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, tab.id)}
                disabled={disabled || tab.disabled}
                tabIndex={isActive ? 0 : -1}
              >
                {tab.icon && <span className="tabbed-layout__tab-icon">{tab.icon}</span>}
                <span className="tabbed-layout__tab-label">{tab.label}</span>
                {tab.shortLabel && (
                  <span className="tabbed-layout__tab-label-short">{tab.shortLabel}</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <div className="tabbed-layout__content">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            id={`tabpanel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            className="tabbed-layout__panel"
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
