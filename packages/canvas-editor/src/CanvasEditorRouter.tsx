import React, { useState, useEffect, useCallback, useRef } from 'react';

import './canvas-editor.css';
import { useYjsFormState } from './collab/useYjsFormState';
import { CanvasEditor } from './components/CanvasEditor';
import { loadCanvasConfig, isValidCanvasType } from './configs/configLoader';
import { ProfilbildCanvas } from './ProfilbildCanvas';

import type { FullCanvasConfig, CanvasConfigId } from './configs/types';
import type { MobileBridgeProps } from './hooks/useMobileBridge';
import type { InitialPageDef } from './hooks/usePageManager';
import type * as Y from 'yjs';

type CanvasState = Record<string, unknown>;

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
  initialState: CanvasState;
  imageSrc?: string;
  onExport: (base64: string) => void;
  onCancel: () => void;
  onStateChange?: (newState: CanvasState) => void;
  /** Pre-populated pages for heterogeneous multi-page mode (e.g. slider slides) */
  initialPages?: InitialPageDef[];
  /** Called when the editor is ready (config loaded, canvas mounted) */
  onReady?: () => void;
  /** Mobile bridge — when provided, hides web chrome and delegates to native controls */
  mobileBridge?: MobileBridgeProps;
  /** When true, tab bar is handled externally (e.g. web app sidebar) via canvasSidebarStore */
  externalSidebar?: boolean;
  /** When true + externalSidebar, syncs mobile subsection state to canvasSidebarStore for external mobile UI */
  externalMobileMode?: boolean;
  /**
   * When provided, the editor enters collaborative mode: layers/config/formState
   * are bound to the supplied Y.Doc. The local initialState is used only as a
   * seed when the Y.Doc is empty; subsequent changes flow through Y.Doc and
   * onStateChange is suppressed to prevent fighting Yjs updates.
   */
  collaborative?: {
    ydoc: Y.Doc;
    isSynced: boolean;
  };
}

export function ControllableCanvasWrapper({
  type,
  initialState,
  imageSrc,
  onExport,
  onCancel,
  onStateChange,
  initialPages,
  onReady,
  mobileBridge,
  externalSidebar,
  externalMobileMode,
  collaborative,
}: ControllableCanvasWrapperProps) {
  const isCollab = !!collaborative;
  const [internalState, setInternalState] = useState<CanvasState>(initialState);
  const [componentKey, setComponentKey] = useState(Date.now());
  const [config, setConfig] = useState<FullCanvasConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Track previous initialState to detect actual content changes
  const prevInitialStateRef = useRef<CanvasState>(initialState);
  const readyFiredRef = useRef(false);

  const { formState: yFormState, updateFormState } = useYjsFormState({
    ydoc: collaborative?.ydoc ?? null,
    isSynced: collaborative?.isSynced ?? false,
    fallback: initialState,
  });

  const effectiveState = isCollab ? yFormState : internalState;

  // Load config dynamically when type changes (for config-driven canvases)
  // Now includes 'zitat' and 'dreizeilen' for unified multi-page support
  useEffect(() => {
    const needsConfig = [
      'zitat',
      'zitat-pure',
      'info',
      'veranstaltung',
      'veranstaltung-plakat',
      'simple',
      'dreizeilen',
      'slider',
      'freeform',
      'pres-title',
      'pres-image',
      'pres-content',
      'presentation',
    ].includes(type);

    // 'presentation' is an alias — load the default pres-title config
    const configType = type === 'presentation' ? 'pres-title' : type;
    if (needsConfig && isValidCanvasType(configType)) {
      setConfigLoading(true);
      loadCanvasConfig(configType)
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
  }, [type]);

  // Fire onReady when config is loaded (or immediately for profilbild)
  useEffect(() => {
    if (readyFiredRef.current) return;
    const isProfilbild = type === 'profilbild';
    if (isProfilbild || (!configLoading && config)) {
      readyFiredRef.current = true;
      onReady?.();
    }
  }, [configLoading, config, type, onReady]);

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
      if (isCollab) {
        updateFormState(change);
        return;
      }
      const newState = { ...internalState, ...change };
      setInternalState(newState);
      onStateChange?.(newState);
    },
    [internalState, onStateChange, isCollab, updateFormState]
  );

  const commonProps = {
    key: componentKey,
    onExport,
    onCancel,
  };

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

  const renderCanvas = () => {
    // Show loading state while config loads
    if (configLoading) {
      return <div>Lädt Editor...</div>;
    }

    // Build initial props based on canvas type
    const buildInitialProps = (): Record<string, unknown> => {
      switch (type) {
        case 'zitat':
          return {
            quote: effectiveState.quote || '',
            name: effectiveState.name || '',
            imageSrc: imageSrc || '',
          };
        case 'zitat-pure':
          return {
            quote: effectiveState.quote || '',
            name: effectiveState.name || '',
          };
        case 'info':
          return {
            header: effectiveState.header || '',
            body: effectiveState.body || '',
          };
        case 'veranstaltung':
        case 'veranstaltung-plakat':
          return {
            eventTitle: effectiveState.eventTitle || '',
            beschreibung: effectiveState.beschreibung || '',
            weekday: effectiveState.weekday || '',
            date: effectiveState.date || '',
            time: effectiveState.time || '',
            locationName: effectiveState.locationName || '',
            address: effectiveState.address || '',
            imageSrc: imageSrc || '',
          };
        case 'simple':
          return {
            headline: effectiveState.headline || '',
            subtext: effectiveState.subtext || '',
            imageSrc: imageSrc || '',
          };
        case 'slider':
          return {
            label: effectiveState.label || '',
            headline: effectiveState.headline || '',
            subtext: effectiveState.subtext || '',
          };
        case 'dreizeilen':
          return {
            line1: effectiveState.line1 || '',
            line2: effectiveState.line2 || '',
            line3: effectiveState.line3 || '',
            currentImageSrc: imageSrc || '',
          };
        case 'freeform':
          return {
            backgroundMode: effectiveState.backgroundMode || 'color',
            backgroundColor: effectiveState.backgroundColor || '#005538',
            currentImageSrc: imageSrc || '',
          };
        case 'pres-title':
        case 'pres-image':
        case 'pres-content':
        case 'presentation':
          return {
            title: effectiveState.title || '',
            subtitle: effectiveState.subtitle || '',
            bodyText: effectiveState.bodyText || '',
            bodyText2: effectiveState.bodyText2 || '',
            currentImageSrc: imageSrc || '',
          };
        default:
          return effectiveState;
      }
    };

    // Build callbacks based on canvas type
    const buildCallbacks = (): Record<string, (val: unknown) => void> => {
      switch (type) {
        case 'zitat':
        case 'zitat-pure':
          return createCallbacks(['quote', 'name']);
        case 'info':
          return createCallbacks(['header', 'body']);
        case 'veranstaltung':
        case 'veranstaltung-plakat':
          return createCallbacks(['eventTitle', 'beschreibung']);
        case 'simple':
          return createCallbacks(['headline', 'subtext']);
        case 'slider':
          return createCallbacks(['label', 'headline', 'subtext']);
        case 'dreizeilen':
          return createCallbacks(['line1', 'line2', 'line3']);
        case 'freeform':
          return {};
        case 'pres-title':
        case 'pres-image':
        case 'pres-content':
        case 'presentation':
          return createCallbacks(['title', 'subtitle', 'bodyText', 'bodyText2']);
        default:
          return {};
      }
    };

    switch (type) {
      // Config-driven canvases - use ConfigMultiPage if multiPage.enabled
      case 'zitat':
      case 'zitat-pure':
      case 'info':
      case 'veranstaltung':
      case 'veranstaltung-plakat':
      case 'simple':
      case 'slider':
      case 'dreizeilen':
      case 'freeform':
      case 'pres-title':
      case 'pres-image':
      case 'pres-content':
      case 'presentation':
        if (!config) return <div>Lädt Konfiguration...</div>;

        return (
          <CanvasEditor
            key={componentKey}
            initialConfigId={(type === 'presentation' ? 'pres-title' : type) as CanvasConfigId}
            initialProps={buildInitialProps()}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={buildCallbacks()}
            maxPages={config.multiPage?.maxPages ?? 30}
            initialPages={initialPages}
            mobileBridge={mobileBridge}
            externalSidebar={externalSidebar}
            externalMobileMode={externalMobileMode}
            collaborative={collaborative}
          />
        );

      case 'profilbild':
        return <ProfilbildCanvas {...commonProps} transparentImage={imageSrc || ''} />;

      default:
        return <div>Editor type &quot;{type}&quot; not found.</div>;
    }
  };

  return <>{renderCanvas()}</>;
}
