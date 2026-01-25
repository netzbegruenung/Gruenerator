import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDesktopTabsStore } from '../stores/desktopTabsStore';
import { isDesktopApp } from '../utils/platform';

export const useTabKeyboardShortcuts = () => {
  const navigate = useNavigate();
  const {
    createTab,
    closeTab,
    switchToNextTab,
    switchToPreviousTab,
    switchToTab,
    activeTabId,
    tabs,
  } = useDesktopTabsStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isDesktopApp()) return;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (isCtrlOrCmd && e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        createTab('/', 'Start');
        navigate('/');
        return;
      }

      if (isCtrlOrCmd && e.key.toLowerCase() === 'w' && !e.shiftKey) {
        e.preventDefault();
        if (tabs.length > 1 && activeTabId) {
          const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
          closeTab(activeTabId);
          const remainingTabs = tabs.filter((t) => t.id !== activeTabId);
          const newActiveIndex = Math.min(currentIndex, remainingTabs.length - 1);
          if (remainingTabs[newActiveIndex]) {
            navigate(remainingTabs[newActiveIndex].route);
          }
        }
        return;
      }

      if (isCtrlOrCmd && e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          switchToPreviousTab();
          const { tabs: currentTabs, activeTabId: newActiveId } = useDesktopTabsStore.getState();
          const activeTab = currentTabs.find((t) => t.id === newActiveId);
          if (activeTab) navigate(activeTab.route);
        } else {
          switchToNextTab();
          const { tabs: currentTabs, activeTabId: newActiveId } = useDesktopTabsStore.getState();
          const activeTab = currentTabs.find((t) => t.id === newActiveId);
          if (activeTab) navigate(activeTab.route);
        }
        return;
      }

      if (isCtrlOrCmd && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (index < tabs.length) {
          switchToTab(index);
          navigate(tabs[index].route);
        }
        return;
      }

      if (isCtrlOrCmd && e.key === '0') {
        e.preventDefault();
        if (tabs.length > 0) {
          const lastIndex = tabs.length - 1;
          switchToTab(lastIndex);
          navigate(tabs[lastIndex].route);
        }
        return;
      }
    },
    [
      createTab,
      closeTab,
      switchToNextTab,
      switchToPreviousTab,
      switchToTab,
      activeTabId,
      tabs,
      navigate,
    ]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};
