import React from 'react';
import PropTypes from 'prop-types';

const TabNavigation = ({
    tabs,
    currentTab,
    onTabClick,
    className = '',
    orientation = 'vertical', // 'vertical' or 'horizontal'
    getTabProps = () => ({}),
    tabClassName = ''
}) => {
    const baseClassName = orientation === 'vertical' 
        ? 'profile-vertical-navigation' 
        : 'groups-horizontal-navigation';
    
    const tabBaseClassName = orientation === 'vertical'
        ? 'profile-vertical-tab'
        : 'groups-vertical-tab';

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
                    <button
                        key={tab.key}
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
                );
            })}
        </nav>
    );
};

TabNavigation.propTypes = {
    tabs: PropTypes.arrayOf(PropTypes.shape({
        key: PropTypes.string.isRequired,
        label: PropTypes.string.isRequired
    })).isRequired,
    currentTab: PropTypes.string.isRequired,
    onTabClick: PropTypes.func.isRequired,
    className: PropTypes.string,
    orientation: PropTypes.oneOf(['vertical', 'horizontal']),
    getTabProps: PropTypes.func,
    tabClassName: PropTypes.string
};

export default TabNavigation;