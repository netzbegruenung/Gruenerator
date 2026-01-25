import { Fragment, type ReactNode } from 'react';

export interface Tab {
  key: string;
  label: string;
}

export type TabOrientation = 'vertical' | 'horizontal';

export interface TabNavigationProps {
  tabs: Tab[];
  currentTab: string;
  onTabClick: (key: string) => void;
  className?: string;
  orientation?: TabOrientation;
  getTabProps?: (key: string) => Record<string, unknown>;
  tabClassName?: string;
  additionalContent?: ReactNode;
  renderSubtabs?: (key: string) => ReactNode;
}

const TabNavigation = ({
  tabs,
  currentTab,
  onTabClick,
  className = '',
  orientation = 'vertical',
  getTabProps = () => ({}),
  tabClassName = '',
  additionalContent = null,
  renderSubtabs = () => null,
}: TabNavigationProps) => {
  const baseClassName =
    orientation === 'vertical' ? 'profile-vertical-navigation' : 'groups-horizontal-navigation';

  const tabBaseClassName =
    orientation === 'vertical' ? 'profile-vertical-tab' : 'groups-vertical-tab';

  return (
    <nav
      className={`${baseClassName} ${className}`}
      role="tablist"
      aria-label="Tab Navigation"
      aria-orientation={orientation}
    >
      {tabs.map((tab) => {
        const tabProps = getTabProps(tab.key);
        return (
          <Fragment key={tab.key}>
            <button
              className={`${tabBaseClassName} ${currentTab === tab.key ? 'active' : ''} ${tabClassName}`}
              onClick={() => onTabClick(tab.key)}
              role="tab"
              aria-selected={currentTab === tab.key}
              aria-controls={`${tab.key}-panel`}
              id={`${tab.key}-tab`}
              {...tabProps}
            >
              {tab.label}
            </button>
            {typeof renderSubtabs === 'function' && renderSubtabs(tab.key)}
          </Fragment>
        );
      })}
      {additionalContent && (
        <div className="navigation-additional-content">{additionalContent}</div>
      )}
    </nav>
  );
};

export default TabNavigation;
