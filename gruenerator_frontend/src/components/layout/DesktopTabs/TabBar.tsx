import React, { useRef, useState, useCallback, Component, ErrorInfo, ReactNode } from 'react';
import { useDesktopTabsStore } from '../../../stores/desktopTabsStore';
import Tab from './Tab';
import NewTabButton from './NewTabButton';
import './desktop-tabs.css';

interface ErrorBoundaryState {
  hasError: boolean;
}

class TabBarErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[TabBar] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="tab-bar-container" style={{ flex: 1 }} />;
    }
    return this.props.children;
  }
}

const TabBarContent: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { tabs, activeTabId, draggedTabId, setDraggedTab, reorderTabs } = useDesktopTabsStore();
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string, index: number) => {
    setDraggedTab(tabId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  }, [setDraggedTab]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);

    if (!isNaN(fromIndex) && fromIndex !== toIndex) {
      reorderTabs(fromIndex, toIndex);
    }

    setDragOverIndex(null);
    setDraggedTab(null);
  }, [reorderTabs, setDraggedTab]);

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    setDraggedTab(null);
  }, [setDraggedTab]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  return (
    <div
      className="tab-bar-container"
      ref={containerRef}
      role="tablist"
      aria-label="Offene Tabs"
    >
      <div
        className="tab-bar-scroll"
        ref={scrollRef}
        onWheel={handleWheel}
      >
        <div className="tab-bar-inner">
          {tabs.map((tab, index) => (
            <Tab
              key={tab.id}
              tab={tab}
              index={index}
              isActive={tab.id === activeTabId}
              isDragging={tab.id === draggedTabId}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          ))}
          <NewTabButton />
        </div>
      </div>
    </div>
  );
};

const TabBar: React.FC = () => (
  <TabBarErrorBoundary>
    <TabBarContent />
  </TabBarErrorBoundary>
);

export default TabBar;
