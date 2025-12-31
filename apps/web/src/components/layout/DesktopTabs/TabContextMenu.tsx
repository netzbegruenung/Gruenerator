import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';

interface TabContextMenuProps {
  tabId: string;
  position: { x: number; y: number };
  onClose: () => void;
}

const TabContextMenu: React.FC<TabContextMenuProps> = ({ tabId, position, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { tabs, closeTab, closeOtherTabs, closeTabsToRight, duplicateTab, setActiveTab } = useDesktopTabsStore();

  const tab = tabs.find(t => t.id === tabId);
  const tabIndex = tabs.findIndex(t => t.id === tabId);
  const isOnlyTab = tabs.length === 1;
  const hasTabsToRight = tabIndex < tabs.length - 1;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleClose = () => {
    if (!isOnlyTab) {
      const wasActive = tabs.find(t => t.id === tabId)?.id === useDesktopTabsStore.getState().activeTabId;
      closeTab(tabId);
      if (wasActive) {
        const remainingTabs = tabs.filter(t => t.id !== tabId);
        const newActiveIndex = Math.min(tabIndex, remainingTabs.length - 1);
        if (remainingTabs[newActiveIndex]) {
          navigate(remainingTabs[newActiveIndex].route);
        }
      }
    }
    onClose();
  };

  const handleCloseOthers = () => {
    closeOtherTabs(tabId);
    if (tab) {
      setActiveTab(tabId);
      navigate(tab.route);
    }
    onClose();
  };

  const handleCloseToRight = () => {
    closeTabsToRight(tabId);
    onClose();
  };

  const handleDuplicate = () => {
    duplicateTab(tabId);
    if (tab) {
      navigate(tab.route);
    }
    onClose();
  };

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: position.y,
    left: position.x,
  };

  return (
    <div
      ref={menuRef}
      className="tab-context-menu"
      style={menuStyle}
      role="menu"
    >
      <button
        className="tab-context-menu-item"
        onClick={handleDuplicate}
        role="menuitem"
      >
        Tab duplizieren
      </button>

      <div className="tab-context-menu-divider" />

      <button
        className="tab-context-menu-item"
        onClick={handleClose}
        disabled={isOnlyTab}
        role="menuitem"
      >
        Tab schließen
      </button>

      <button
        className="tab-context-menu-item"
        onClick={handleCloseOthers}
        disabled={isOnlyTab}
        role="menuitem"
      >
        Andere Tabs schließen
      </button>

      <button
        className="tab-context-menu-item"
        onClick={handleCloseToRight}
        disabled={!hasTabsToRight}
        role="menuitem"
      >
        Tabs rechts schließen
      </button>
    </div>
  );
};

export default TabContextMenu;
