import { useCanvasSidebarStore, SIDEBAR_FONT_SIZES } from '@gruenerator/canvas-editor';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck } from 'react-icons/fa';

const CanvasSidebarPanel = () => {
  const canvasTabs = useCanvasSidebarStore((s) => s.tabs);
  const canvasActiveTab = useCanvasSidebarStore((s) => s.activeTab);
  const canvasDisabledTabs = useCanvasSidebarStore((s) => s.disabledTabs);
  const canvasOnTabClick = useCanvasSidebarStore((s) => s.onTabClick);
  const canvasAutoSaveStatus = useCanvasSidebarStore((s) => s.autoSaveStatus);
  const canvasPanelContent = useCanvasSidebarStore((s) => s.panelContent);
  const [showCanvasSaved, setShowCanvasSaved] = useState(false);

  useEffect(() => {
    if (canvasAutoSaveStatus === 'saved') {
      setShowCanvasSaved(true);
      const timer = setTimeout(() => setShowCanvasSaved(false), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [canvasAutoSaveStatus]);

  return (
    <>
      <div className="sidebar-main-nav" style={{ paddingTop: 'var(--spacing-small)' }}>
        {canvasTabs.map((tab) => {
          const Icon = tab.icon;
          const isTabActive = canvasActiveTab === tab.id;
          const isTabDisabled = canvasDisabledTabs.includes(tab.id);
          return (
            <button
              key={tab.id}
              className={`sidebar-menu-link${isTabActive ? ' sidebar-menu-link--active' : ''}${isTabDisabled ? ' sidebar-menu-link--disabled' : ''}`}
              onClick={() => !isTabDisabled && canvasOnTabClick?.(tab.id)}
              disabled={isTabDisabled}
              title={tab.label}
              aria-label={tab.ariaLabel}
              aria-pressed={isTabActive}
              type="button"
            >
              <Icon aria-hidden="true" className="sidebar-item-icon" />
              <span className="sidebar-item-title">{tab.label}</span>
            </button>
          );
        })}

        {canvasAutoSaveStatus && (
          <div
            className={`sidebar-menu-link justify-center cursor-default min-h-8 transition-opacity duration-300 ${canvasAutoSaveStatus === 'saving' || showCanvasSaved ? 'opacity-100' : 'opacity-0'}`}
            title={
              canvasAutoSaveStatus === 'saving'
                ? 'Wird gespeichert...'
                : canvasAutoSaveStatus === 'saved'
                  ? 'Gespeichert'
                  : canvasAutoSaveStatus === 'error'
                    ? 'Fehler beim Speichern'
                    : ''
            }
          >
            {canvasAutoSaveStatus === 'saving' && (
              <div className="size-4 border-2 border-[var(--border-subtle)] border-t-[var(--interactive-accent-color)] rounded-full animate-spin" />
            )}
            {showCanvasSaved && <FaCheck size={14} className="text-green-500" />}
          </div>
        )}
      </div>

      {/* Portal panel content to document.body to avoid sidebar stacking context */}
      {canvasPanelContent &&
        createPortal(
          <div
            className="fixed top-0 bottom-0 left-[var(--sidebar-collapsed-width)] z-[1005] w-auto min-w-[120px] max-w-[320px] bg-background rounded-br-xl shadow-[8px_0_24px_rgba(0,0,0,0.1)] overflow-hidden flex flex-col"
            style={SIDEBAR_FONT_SIZES}
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3 pt-[var(--header-height,48px)]">
              {canvasPanelContent}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default CanvasSidebarPanel;
