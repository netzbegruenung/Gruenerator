'use dom';

import '@gruenerator/canvas-editor/styles/bundle';

import { CanvasEditorProvider, MasterCanvasEditor } from '@gruenerator/canvas-editor';
import { type DOMProps } from 'expo/dom';
import { type CSSProperties } from 'react';

import type { MobileBridgeCallbacks, MobileBridgeProps } from '@gruenerator/canvas-editor';

interface CanvasEditorDOMProps {
  type: string;
  initialState: Record<string, unknown>;
  imageSrc?: string;
  onExport: (base64: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onReady?: () => Promise<void>;
  // Mobile bridge props
  activeTab: string | null;
  activeSubsection: string | null;
  toolbarAction: { type: string; [key: string]: unknown } | null;
  toolbarActionId: number;
  onSelectedElementChange: (info: Record<string, unknown> | null) => Promise<void>;
  onHistoryChange: (state: { canUndo: boolean; canRedo: boolean }) => Promise<void>;
  onTabsChange: (tabs: Array<{ id: string; label: string; disabled: boolean }>) => Promise<void>;
  onActiveTabChange: (tabId: string | null) => Promise<void>;
  onSubsectionsChange: (subs: Array<{ id: string; label: string }>) => Promise<void>;
  onActiveSubsectionChange: (id: string | null) => Promise<void>;
  dom?: DOMProps;
}

export default function CanvasEditorDOM({
  type,
  initialState,
  imageSrc,
  onExport,
  onCancel,
  onReady,
  activeTab,
  activeSubsection,
  toolbarAction,
  toolbarActionId,
  onSelectedElementChange,
  onHistoryChange,
  onTabsChange,
  onActiveTabChange,
  onSubsectionsChange,
  onActiveSubsectionChange,
}: CanvasEditorDOMProps) {
  // Build the mobileBridge prop for MasterCanvasEditor
  const mobileBridge: MobileBridgeProps = {
    callbacks: {
      onSelectedElementChange:
        onSelectedElementChange as MobileBridgeCallbacks['onSelectedElementChange'],
      onHistoryChange: onHistoryChange as MobileBridgeCallbacks['onHistoryChange'],
      onTabsChange: onTabsChange as MobileBridgeCallbacks['onTabsChange'],
      onActiveTabChange: onActiveTabChange as MobileBridgeCallbacks['onActiveTabChange'],
      onSubsectionsChange: onSubsectionsChange as MobileBridgeCallbacks['onSubsectionsChange'],
      onActiveSubsectionChange:
        onActiveSubsectionChange as MobileBridgeCallbacks['onActiveSubsectionChange'],
    },
    activeTab: activeTab as MobileBridgeProps['activeTab'],
    activeSubsection,
    toolbarAction: toolbarAction as MobileBridgeProps['toolbarAction'],
    toolbarActionId,
  };

  return (
    <CanvasEditorProvider
      services={{
        assetBaseUrl: 'https://gruenerator.eu',
        iconifyApiUrl: 'https://iconify.gruenerator.eu',
      }}
    >
      <div
        style={
          { width: '100%', height: '100vh', '--mobile-tab-bar-height': '0px' } as CSSProperties
        }
      >
        <MasterCanvasEditor
          type={type}
          initialState={initialState}
          imageSrc={imageSrc}
          onExport={onExport}
          onCancel={onCancel}
          onReady={onReady}
          mobileBridge={mobileBridge}
        />
      </div>
    </CanvasEditorProvider>
  );
}
