import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDesktopTabsStore, type Tab as TabType } from '../../../stores/desktopTabsStore';

interface TabProps {
  tab: TabType;
  index: number;
  isActive: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, tabId: string, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}

const Tab: React.FC<TabProps> = ({
  tab,
  index,
  isActive,
  isDragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => {
  const tabRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setActiveTab, closeTab, tabs } = useDesktopTabsStore();

  const handleClick = () => {
    setActiveTab(tab.id);
    void navigate(tab.route);
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length > 1) {
      const currentIndex = tabs.findIndex((t) => t.id === tab.id);
      const wasActive = isActive;

      closeTab(tab.id);

      if (wasActive) {
        const remainingTabs = tabs.filter((t) => t.id !== tab.id);
        const newActiveIndex = Math.min(currentIndex, remainingTabs.length - 1);
        if (remainingTabs[newActiveIndex]) {
          void navigate(remainingTabs[newActiveIndex].route);
        }
      }
    }
  };

  const handleMiddleClick = (e: React.MouseEvent) => {
    if (e.button === 1 && tabs.length > 1) {
      e.preventDefault();
      handleClose(e);
    }
  };

  return (
    <div
      ref={tabRef}
      className={`desktop-tab ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${tab.isDirty ? 'dirty' : ''}`}
      role="tab"
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      draggable
      onClick={handleClick}
      onMouseDown={handleMiddleClick}
      onDragStart={(e: React.DragEvent) => onDragStart(e, tab.id, index)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(e, index);
      }}
      onDrop={(e) => onDrop(e, index)}
      onDragEnd={onDragEnd}
    >
      {tab.isLoading && <span className="tab-loading-indicator" />}

      {tab.isDirty && !tab.isLoading && (
        <span className="tab-dirty-indicator" aria-label="Ungespeicherte Änderungen" />
      )}

      <span className="tab-title">{tab.title}</span>

      {tabs.length > 1 && (
        <button
          className="tab-close-btn"
          onClick={handleClose}
          aria-label={`Tab "${tab.title}" schließen`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line
              x1="1"
              y1="1"
              x2="9"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <line
              x1="9"
              y1="1"
              x2="1"
              y2="9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
};

export default Tab;
