
import { useState, useCallback, useMemo, useEffect, Suspense } from 'react';
import { SidebarTabBar, SidebarPanel } from '../sidebar';
import { CanvasEditorLayout } from '../layouts';
import { ZoomableViewport } from './ZoomableViewport';
import type { FullCanvasConfig } from '../configs/types';
import type { SidebarTabId } from '../sidebar/types';
import Spinner from '../../../../components/common/Spinner';
import './GenericCanvasEditor.css';

interface GenericCanvasEditorProps<TState, TActions = Record<string, unknown>> {
    config: FullCanvasConfig<TState, TActions>;
    state: TState;
    actions: TActions;
    children: React.ReactNode; // The Konva Stage / Canvas content
    onExport: () => void;
    onCancel?: () => void; // Optional cancel handler if needed by layout
    sidebarActions?: React.ReactNode; // Optional extra actions for the sidebar
    selectedElement?: string | null;
    onAddPage?: () => void;
    shareProps?: {
        exportedImage: string | null;
        autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
        shareToken: string | null;
        onCaptureCanvas: () => void;
        onDownload: () => void;
        onNavigateToGallery: () => void;
    };
}

// Debug render counter
let editorRenderCount = 0;

export function GenericCanvasEditor<TState, TActions = Record<string, unknown>>({
    config,
    state,
    actions,
    children,
    onExport,
    sidebarActions,
    selectedElement,
    onAddPage,
    shareProps,
}: GenericCanvasEditorProps<TState, TActions>) {
    editorRenderCount++;
    console.log(`[GenericCanvasEditor] Render #${editorRenderCount}`, {
        activeTabWillBe: 'text',
        hasShareProps: !!shareProps,
        shareToken: shareProps?.shareToken?.slice(0, 8),
    });

    const [activeTab, setActiveTab] = useState<SidebarTabId | null>('text');
    const [isDesktop, setIsDesktop] = useState(
        typeof window !== 'undefined' && window.innerWidth >= 900
    );

    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 900);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleTabClick = useCallback((tabId: SidebarTabId) => {
        setActiveTab((current) => (current === tabId ? null : tabId));
    }, []);

    const handlePanelClose = useCallback(() => {
        setActiveTab(null);
    }, []);

    // Compute visible tabs if logic is provided, otherwise use all tabs
    // Compute visible tabs if logic is provided, otherwise use all tabs
    const visibleTabs = useMemo(() => {
        if (config.getVisibleTabs) {
            const visibleIds = config.getVisibleTabs(state);
            return config.tabs.filter(tab => visibleIds.includes(tab.id));
        }
        return config.tabs;
    }, [config, state]);

    // Compute disabled tabs
    const disabledTabs = useMemo(() => {
        if (config.getDisabledTabs) {
            return config.getDisabledTabs(state);
        }
        return [];
    }, [config, state]);

    // Render the active section based on configuration
    const renderActivePanel = () => {
        console.log(`[GenericCanvasEditor] renderActivePanel called, activeTab=${activeTab}`);
        if (!activeTab) return null;

        const sectionConfig = config.sections[activeTab];
        if (!sectionConfig) return null;

        const SectionComponent = sectionConfig.component;
        const sectionProps = sectionConfig.propsFactory(state, actions, {
            selectedElement: selectedElement ?? null,
            ...shareProps
        });

        console.log(`[GenericCanvasEditor] Rendering section: ${activeTab}`, {
            componentName: SectionComponent.name || 'lazy',
        });

        return (
            <Suspense fallback={
                <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-large)', minHeight: '200px' }}>
                    <Spinner size="medium" />
                </div>
            }>
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
                <ZoomableViewport
                    canvasWidth={config.canvas.width}
                    canvasHeight={config.canvas.height}
                    defaultZoom="fit"
                >
                    {children}
                </ZoomableViewport>

                {onAddPage && (
                    <button
                        className="canvas-action-button"
                        onClick={onAddPage}
                        type="button"
                    >
                        + Neue Seite hinzufügen
                    </button>
                )}
            </div>
        </CanvasEditorLayout>
    );
}
