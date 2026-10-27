import React, { useState, useEffect, useCallback, useRef } from 'react';

import './canvas-editor.css';
import { CanvasEditor } from './components/CanvasEditor';
import { CanvasEditorSkeleton } from '@ggraphic/editor/components/CanvasEditorSkeleton';

import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { getCanvasFormatOrDefault, isUnsupportedFormatId } from '@ggraphic/editor/formats/index';

import { getBuiltinTemplate, isValidCanvasType } from './templates/registry';

import type {
  CanvasEditorExportApi,
  CanvasEditorHostChrome,
} from './components/CanvasEditor/types';
import type { SidebarTabId } from '@ggraphic/editor/sidebar/types';
import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';
import type { InitialPageDef } from '@ggraphic/editor/hooks/usePageManager';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';

type CanvasState = Record<string, unknown>;

// The per-template props shape moved to the template registry, next to the
// `seedProps` that build it.
export type { CanvasInitialPropsMap } from './templates/registry';

// Compare two values with special handling for arrays
function valuesEqual(a: unknown, b: unknown): boolean {
  // Same reference or primitive value
  if (a === b) return true;

  // Handle arrays - compare contents
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  return false;
}

// Compare two state objects for content equality
function stateEqual(a: CanvasState, b: CanvasState): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!valuesEqual(a[key], b[key])) return false;
  }
  return true;
}

export interface ControllableCanvasWrapperProps {
  type: string;
  /** The canvas document's format id. Absent: the default format. */
  formatId?: string;
  /** Document title; names the print PDF (`<title>.pdf`). */
  documentTitle?: string;
  initialState: CanvasState;
  imageSrc?: string;
  onExport: (base64: string) => void;
  onCancel: () => void;
  /** Pure observation hook fired with the image of every page download. */
  onDownload?: (base64: string) => void;
  onStateChange?: (newState: CanvasState) => void;
  /** Pre-populated pages for heterogeneous multi-page mode (e.g. slider slides) */
  initialPages?: InitialPageDef[];
  /** Called when the editor is ready (config loaded, canvas mounted) */
  onReady?: () => void;
  /**
   * When provided, the editor enters collaborative mode: pages (state,
   * config) are bound to the supplied Y.Doc. The local initialState
   * is used only as a seed when the Y.Doc is empty; subsequent changes flow
   * through the Y.Doc and onStateChange is suppressed.
   */
  collaborative?: {
    ydoc: Y.Doc;
    isSynced: boolean;
    /** Hocuspocus provider — enables awareness features (remote selections). */
    provider?: HocuspocusProvider | null;
    /** Show the initial pages, read-only, until the doc has synced (fresh canvas only). */
    previewBeforeSync?: boolean;
    /** The doc holds the local cache: show its pages, read-only, until the sync. */
    isLocalLoaded?: boolean;
  };
  /** Host-supplied content rendered at the very left of the toolbar (in-flow). */
  chromeLeft?: React.ReactNode;
  /** Host-supplied content rendered absolute-centered in the toolbar (e.g. doc title, sync badge). */
  chromeCenter?: React.ReactNode;
  /** Host-supplied content rendered in the toolbar's right cluster (e.g. presence avatars). */
  chromeRight?: React.ReactNode;
  /**
   * When provided, the share popover shows a "Personen" entry that triggers
   * this callback. Used by collab hosts to open their invite/permissions dialog.
   */
  onInvitePeople?: () => void;
  /** Opens the host's "als Vorlage speichern" flow (see CanvasEditorProps). */
  onSaveAsTemplate?: () => void;
  /** Collab mode: fresh stage render after local edits settle (see CanvasEditorProps). */
  onCollabSnapshot?: (base64: string) => void;
  /**
   * Seeds the per-instance AutoSaveStore so reloads update the existing
   * gallery record instead of creating a new draft. Routes that load an
   * existing share by token should pass it through here.
   */
  initialShareToken?: string | null;
  /** Reports auto-save share tokens to the host (see CanvasEditorProps). */
  onAutoSaveShareToken?: (token: string) => void;
  /** Sidebar tab open on the first render (see CanvasEditorProps). */
  initialTab?: SidebarTabId | null;
  /** Reports sidebar tab changes to the host (see CanvasEditorProps). */
  onActiveTabChange?: (tab: SidebarTabId | null) => void;
  /** See CanvasEditorProps.galleryAutoSave. */
  galleryAutoSave?: boolean;
  /** See CanvasEditorProps.showShare. */
  showShare?: boolean;
  /** See CanvasEditorProps.exportApiRef. */
  exportApiRef?: React.Ref<CanvasEditorExportApi>;
  /** See CanvasEditorProps.hostChrome. */
  hostChrome?: CanvasEditorHostChrome;
  /** See CanvasEditorProps.readOnly. */
  readOnly?: boolean;
}

/**
 * A print format this build does not know must not open as 4:5: the editor
 * (and with it the autosave) never mounts, the host chrome stays usable.
 */
export function ControllableCanvasWrapper(props: ControllableCanvasWrapperProps) {
  if (isUnsupportedFormatId(props.formatId)) {
    return (
      <div className="flex flex-col h-full bg-[var(--editor-bg)]">
        {props.chromeLeft && <div className="flex items-center p-2">{props.chromeLeft}</div>}
        <div
          role="alert"
          className="m-auto max-w-sm px-4 text-center text-sm text-[var(--editor-text-secondary)]"
        >
          Format nicht unterstützt – bitte App aktualisieren.
        </div>
      </div>
    );
  }
  return <ControllableCanvasEditor {...props} />;
}

function ControllableCanvasEditor({
  type,
  formatId,
  documentTitle,
  initialState,
  imageSrc,
  onExport,
  onCancel,
  onDownload,
  onStateChange,
  initialPages,
  onReady,
  collaborative,
  chromeLeft,
  chromeCenter,
  chromeRight,
  onInvitePeople,
  onSaveAsTemplate,
  onCollabSnapshot,
  initialShareToken,
  onAutoSaveShareToken,
  initialTab,
  onActiveTabChange,
  galleryAutoSave,
  showShare,
  exportApiRef,
  hostChrome,
  readOnly,
}: ControllableCanvasWrapperProps) {
  const isCollab = !!collaborative;
  const [internalState, setInternalState] = useState<CanvasState>(initialState);
  const [componentKey, setComponentKey] = useState(Date.now());
  const [config, setConfig] = useState<FullCanvasConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Track previous initialState to detect actual content changes
  const prevInitialStateRef = useRef<CanvasState>(initialState);
  const readyFiredRef = useRef(false);

  // In collab mode `initialState` is only a seed — pages in the Y.Doc are the
  // single source of truth (legacy root-formState docs are healed on open by
  // pagesDoc.foldLegacyFormStateIntoFirstPage).
  const effectiveState = internalState;

  // Load config dynamically when type changes (for config-driven canvases)
  // Now includes 'zitat' and 'dreizeilen' for unified multi-page support
  useEffect(() => {
    // Every valid canvas type is config-driven (incl. the de-AT variants).
    if (isValidCanvasType(type)) {
      setConfigLoading(true);
      // formatId bestimmt bei Freeform Maße und Seitendeckel (Folien: 60)
      loadCanvasConfig(type, formatId)
        .then(setConfig)
        .catch((error) => {
          console.error(`Failed to load canvas config for type "${type}":`, error);
          setConfig(null);
        })
        .finally(() => setConfigLoading(false));
    } else {
      setConfig(null);
      setConfigLoading(false);
    }
  }, [type, formatId]);

  // Fire onReady when config is loaded
  useEffect(() => {
    if (readyFiredRef.current) return;
    if (!configLoading && config) {
      readyFiredRef.current = true;
      onReady?.();
    }
  }, [configLoading, config, onReady]);

  // Only update state and key when initialState CONTENT actually changes
  // This prevents remounting when parent re-renders with same values but new object reference.
  // Skipped in collaborative mode — Y.Doc is the source of truth there.
  useEffect(() => {
    if (isCollab) return;
    const prevState = prevInitialStateRef.current;
    const hasContentChanged = !stateEqual(prevState, initialState);

    if (hasContentChanged) {
      setInternalState(initialState);
      setComponentKey(Date.now());
      prevInitialStateRef.current = initialState;
    }
  }, [initialState, isCollab]);

  const handlePartChange = useCallback(
    (change: Partial<CanvasState>) => {
      // Collab persistence happens through the per-page dual-write in
      // CanvasEditor (wrapped callbacks → pages[i].state Y.Map); there is no
      // root-level bucket to update anymore.
      if (isCollab) return;
      const newState = { ...internalState, ...change };
      setInternalState(newState);
      onStateChange?.(newState);
    },
    [internalState, onStateChange, isCollab]
  );

  // Create callbacks object for GenericCanvas
  const createCallbacks = useCallback(
    (keys: string[]) => {
      const callbacks: Record<string, (val: unknown) => void> = {};
      keys.forEach((key) => {
        callbacks[`on${key.charAt(0).toUpperCase() + key.slice(1)}Change`] = (val: unknown) =>
          handlePartChange({ [key]: val });
      });
      return callbacks;
    },
    [handlePartChange]
  );

  const skeletonFormat = getCanvasFormatOrDefault(formatId);
  const skeletonAspectRatio = skeletonFormat.width / skeletonFormat.height;

  const renderCanvas = () => {
    if (configLoading) {
      return (
        <CanvasEditorSkeleton
          chromeLeft={chromeLeft}
          aspectRatio={skeletonAspectRatio}
          topBar={!hostChrome}
        />
      );
    }

    // Every built-in template is config-driven (incl. the de-AT variants);
    // what it seeds and which callbacks it gets lives in its registry entry.
    if (!isValidCanvasType(type)) {
      return <div>Editor type &quot;{type}&quot; not found.</div>;
    }
    if (!config)
      return (
        <CanvasEditorSkeleton
          chromeLeft={chromeLeft}
          aspectRatio={skeletonAspectRatio}
          topBar={!hostChrome}
        />
      );

    const template = getBuiltinTemplate(type);
    return (
      <CanvasEditor
        key={componentKey}
        initialConfigId={type}
        formatId={formatId}
        documentTitle={documentTitle}
        initialProps={template.seedProps?.(effectiveState, imageSrc) ?? effectiveState}
        onExport={onExport}
        onCancel={onCancel}
        onDownload={onDownload}
        callbacks={createCallbacks([...template.hostCallbackKeys])}
        maxPages={config.multiPage?.maxPages ?? 30}
        initialPages={initialPages}
        collaborative={collaborative}
        chromeLeft={chromeLeft}
        chromeCenter={chromeCenter}
        chromeRight={chromeRight}
        onInvitePeople={onInvitePeople}
        onSaveAsTemplate={onSaveAsTemplate}
        onCollabSnapshot={onCollabSnapshot}
        initialShareToken={initialShareToken}
        onAutoSaveShareToken={onAutoSaveShareToken}
        initialTab={initialTab}
        onActiveTabChange={onActiveTabChange}
        galleryAutoSave={galleryAutoSave}
        showShare={showShare}
        exportApiRef={exportApiRef}
        hostChrome={hostChrome}
        readOnly={readOnly}
      />
    );
  };

  return <>{renderCanvas()}</>;
}
