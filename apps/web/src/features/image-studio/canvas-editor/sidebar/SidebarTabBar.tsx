import { FaUndo, FaRedo } from 'react-icons/fa';
import { useCanvasEditorStore } from '../../../../stores/canvasEditorStore';
import type { SidebarTabBarProps, SidebarTabId } from './types';

// Stable selectors - avoid object creation on each render
const selectCanUndo = (s: ReturnType<typeof useCanvasEditorStore.getState>) => s.historyIndex > 0;
const selectCanRedo = (s: ReturnType<typeof useCanvasEditorStore.getState>) => s.historyIndex < s.history.length - 1;
const selectUndo = (s: ReturnType<typeof useCanvasEditorStore.getState>) => s.undo;
const selectRedo = (s: ReturnType<typeof useCanvasEditorStore.getState>) => s.redo;

export function SidebarTabBar({
  tabs,
  activeTab,
  onTabClick,
  disabledTabs = [],
  horizontal = false,
}: SidebarTabBarProps) {
  const canUndo = useCanvasEditorStore(selectCanUndo);
  const canRedo = useCanvasEditorStore(selectCanRedo);
  const undo = useCanvasEditorStore(selectUndo);
  const redo = useCanvasEditorStore(selectRedo);

  return (
    <div className={`sidebar-tab-bar ${horizontal ? 'sidebar-tab-bar--horizontal' : ''}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const isDisabled = disabledTabs.includes(tab.id);

        return (
          <button
            key={tab.id}
            className={`sidebar-tab-bar__tab ${isActive ? 'sidebar-tab-bar__tab--active' : ''}`}
            onClick={() => onTabClick(tab.id as SidebarTabId)}
            disabled={isDisabled}
            aria-label={tab.ariaLabel}
            aria-pressed={isActive}
            title={tab.label}
            type="button"
          >
            <Icon size={24} />
          </button>
        );
      })}

      <div className="sidebar-tab-bar__separator" />

      <button
        className="sidebar-tab-bar__tab sidebar-tab-bar__tab--undo"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Rückgängig"
        title="Rückgängig (Strg+Z)"
        type="button"
      >
        <FaUndo size={18} />
      </button>
      <button
        className="sidebar-tab-bar__tab sidebar-tab-bar__tab--redo"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Wiederholen"
        title="Wiederholen (Strg+Y)"
        type="button"
      >
        <FaRedo size={18} />
      </button>
    </div>
  );
}
