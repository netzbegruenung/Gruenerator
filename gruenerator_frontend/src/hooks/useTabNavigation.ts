import { useState, useCallback } from 'react';
import { announceToScreenReader } from '../utils/focusManagement';

/**
 * Custom hook for managing tab navigation state and behavior
 * @param {string} initialTab - The initially active tab
 * @param {Array<{key: string, label: string}>} availableTabs - Available tabs configuration
 * @param {Function} onTabChange - Optional callback when tab changes
 * @returns {Object} - Tab navigation state and handlers
 */
export const useTabNavigation = (initialTab, availableTabs = [], onTabChange = null) => {
    const [currentTab, setCurrentTab] = useState(initialTab);

    const handleTabClick = useCallback((tabKey) => {
        if (currentTab !== tabKey) {
            setCurrentTab(tabKey);
            
            // Find tab label for screen reader announcement
            const tab = availableTabs.find(t => t.key === tabKey);
            const tabLabel = tab?.label || tabKey;
            announceToScreenReader(`${tabLabel} Tab ausgewählt`);
            
            // Call optional callback
            if (onTabChange) {
                onTabChange(tabKey);
            }
        }
    }, [currentTab, availableTabs, onTabChange]);

    const setCurrentTabDirect = useCallback((tabKey) => {
        setCurrentTab(tabKey);
    }, []);

    return {
        currentTab,
        setCurrentTab: setCurrentTabDirect,
        handleTabClick,
        availableTabs
    };
};