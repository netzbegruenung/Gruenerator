import { useState, useCallback, useMemo, useEffect, useRef, Suspense } from 'react';

import Spinner from '../../../../components/common/Spinner';
import { CanvasEditorLayout } from '../layouts';
import { SidebarTabBar, SidebarPanel } from '../sidebar';

import { ZoomableViewport } from './ZoomableViewport';

import type { FullCanvasConfig } from '../configs/types';
import type { SidebarTabId } from '../sidebar/types';

import './GenericCanvasEditor.css';

interface GenericCanvasEditorProps<TState, TActions = Record<string, unknown>> {
  config: FullCanvasConfig<TState, TActions>;
  state: TState;
  actions: TActions;
  children: React.ReactNode; // The Konva Stage / Canvas content
  toolbar?: React.ReactNode; // Floating toolbar rendered above the canvas viewport
  onExport: () => void;
  onCancel?: () => void; // Optional cancel handler if needed by layout
  sidebarActions?: React.ReactNode; // Optional extra actions for the sidebar
  selectedElement?: string | null;
  onAddPage?: () => void;
  /** Custom renderer for add page section (e.g., template picker for heterogeneous mode) */
  renderAddPage?: () => React.ReactNode;
  shareProps?: {
    exportedImage: string | null;
    autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
    shareToken: string | null;
    onCaptureCanvas: () => void;
    onDownload: () => void;
    onNavigateToGallery: () => void;
    // Multi-page export props
    pageCount?: number;
    onDownloadAllZip?: () => Promise<void>;
    isMultiExporting?: boolean;
    exportProgress?: { current: number; total: number };
  };
}

export function GenericCanvasEditor<TState, TActions = Record<string, unknown>>({
  config,
  state,
  actions,
  children,
  toolbar,
  onExport,
  sidebarActions,
  selectedElement,
  onAddPage,
  renderAddPage,
  shareProps,
}: GenericCanvasEditorProps<TState, TActions>) {
  const [activeTab, setActiveTab] = useState<SidebarTabId | null>('text');
  const [_isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 900
  );

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const prevTabRef = useRef<SidebarTabId | null>(null);

  const handleTabClick = useCallback((tabId: SidebarTabId) => {
    setActiveTab((current) => (current === tabId ? null : tabId));
  }, []);

  const handlePanelClose = useCallback(() => {
    setActiveTab(null);
  }, []);

  // Compute visible tabs if logic is provided, otherwise use all tabs
  const visibleTabs = useMemo(() => {
    if (config.getVisibleTabs) {
      const visibleIds = config.getVisibleTabs(state, { selectedElement: selectedElement ?? null });
      return config.tabs.filter((tab) => visibleIds.includes(tab.id));
    }
    return config.tabs;
  }, [config, state, selectedElement]);

  // Auto-switch to 'settings' tab when a balken is selected, restore previous tab on deselect
  useEffect(() => {
    const hasSettingsTab = visibleTabs.some((t) => t.id === 'settings');
    if (hasSettingsTab && selectedElement?.includes('balken')) {
      setActiveTab((current) => {
        if (current !== 'settings') {
          prevTabRef.current = current;
        }
        return 'settings';
      });
    } else if (!hasSettingsTab && activeTab === 'settings') {
      setActiveTab(prevTabRef.current ?? visibleTabs[0]?.id ?? null);
      prevTabRef.current = null;
    }
  }, [selectedElement, visibleTabs]);

  // Compute disabled tabs
  const disabledTabs = useMemo(() => {
    if (config.getDisabledTabs) {
      return config.getDisabledTabs(state);
    }
    return [];
  }, [config, state]);

  // Render the active section based on configuration
  const renderActivePanel = () => {
    if (!activeTab) return null;

    const sectionConfig = config.sections[activeTab];
    if (!sectionConfig) return null;

    const SectionComponent = sectionConfig.component;
    const sectionProps = sectionConfig.propsFactory(state, actions, {
      selectedElement: selectedElement ?? null,
      ...shareProps,
    });

    return (
      <Suspense
        fallback={
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: 'var(--spacing-large)',
              minHeight: '200px',
            }}
          >
            <Spinner size="medium" />
          </div>
        }
      >
        <SectionComponent {...sectionProps} />
      </Suspense>
    );
  };

  const tabBar = (
    <SidebarTabBar
      tabs={visibleTabs}
      activeTab={activeTab}
      onTabClick={handleTabClick}
      onExport={onExport}
      disabledTabs={disabledTabs}
    />
  );

  const panel = (
    <SidebarPanel isOpen={activeTab !== null} onClose={handlePanelClose}>
      {renderActivePanel()}
    </SidebarPanel>
  );

  return (
    <CanvasEditorLayout sidebar={panel} tabBar={tabBar} actions={sidebarActions}>
      <div className="canvas-content-wrapper">
        {toolbar}
        <ZoomableViewport
          canvasWidth={config.canvas.width}
          canvasHeight={config.canvas.height}
          defaultZoom="fit"
        >
          {children}
        </ZoomableViewport>

        {/* Custom add page renderer (e.g., template picker) takes precedence */}
        {renderAddPage ? (
          renderAddPage()
        ) : onAddPage ? (
          <button className="canvas-action-button" onClick={onAddPage} type="button">
            + Neue Seite hinzufügen
          </button>
        ) : null}
      </div>
    </CanvasEditorLayout>
  );
}
