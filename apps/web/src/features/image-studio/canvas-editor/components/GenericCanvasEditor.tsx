
import { useState, useCallback, useMemo, useEffect } from 'react';
import { SidebarTabBar, SidebarPanel } from '../sidebar';
import { CanvasEditorLayout } from '../layouts';
import type { CanvasConfig } from '../configs/types';
import type { SidebarTabId } from '../sidebar/types';

interface GenericCanvasEditorProps<TState> {
    config: CanvasConfig<TState>;
    state: TState;
    actions: any; // Actions corresponding to the state
    children: React.ReactNode; // The Konva Stage / Canvas content
    onExport: () => void;
    onSave?: () => void;
    onCancel?: () => void; // Optional cancel handler if needed by layout
    sidebarActions?: React.ReactNode; // Optional extra actions for the sidebar
    selectedElement?: string | null;
}

export function GenericCanvasEditor<TState>({
    config,
    state,
    actions,
    children,
    onExport,
    onSave,
    sidebarActions,
    selectedElement,
}: GenericCanvasEditorProps<TState>) {
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
        if (!activeTab) return null;

        const sectionConfig = config.sections[activeTab];
        if (!sectionConfig) return null;

        const SectionComponent = sectionConfig.component;
        const sectionProps = sectionConfig.propsFactory(state, actions, { selectedElement: selectedElement ?? null });

        return <SectionComponent {...sectionProps} />;
    };

    const tabBar = (
        <SidebarTabBar
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabClick={handleTabClick}
            onExport={onExport}
            onSave={onSave}
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
            {children}
        </CanvasEditorLayout>
    );
}
