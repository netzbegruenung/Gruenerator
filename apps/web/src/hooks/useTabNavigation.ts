import { useState, useCallback } from 'react';
import { announceToScreenReader } from '../utils/focusManagement';

interface TabConfig {
    key: string;
    label: string;
}

type OnTabChangeCallback = ((tabKey: string) => void) | null;

/**
 * Custom hook for managing tab navigation state and behavior
 * @param initialTab - The initially active tab
 * @param availableTabs - Available tabs configuration
 * @param onTabChange - Optional callback when tab changes
 * @returns Tab navigation state and handlers
 */
export const useTabNavigation = (
    initialTab: string,
    availableTabs: TabConfig[] = [],
    onTabChange: OnTabChangeCallback = null
) => {
    const [currentTab, setCurrentTab] = useState(initialTab);

    const handleTabClick = useCallback((tabKey: string) => {
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

    const setCurrentTabDirect = useCallback((tabKey: string | ((prev: string) => string)) => {
        setCurrentTab(tabKey);
    }, []);

    return {
        currentTab,
        setCurrentTab: setCurrentTabDirect,
        handleTabClick,
        availableTabs
    };
};
