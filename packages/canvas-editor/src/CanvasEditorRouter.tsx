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

/**
 * Per-template shape of the props seeded into the inner CanvasEditor.
 *
 * Every branch in `buildInitialProps` is `satisfies`-checked against its
 * entry here — so dropping or mistyping a field (e.g. forgetting to thread
 * a background URL) is a compile error rather than a silent runtime '' fallback.
 */
export interface CanvasInitialPropsMap {
  zitat: { quote: string; name: string; imageSrc: string };
  'zitat-pure': { quote: string; name: string };
  info: { header: string; body: string };
  veranstaltung: {
    eventTitle: string;
    beschreibung: string;
    weekday: string;
    date: string;
    time: string;
    locationName: string;
    address: string;
    imageSrc: string;
  };
  simple: { headline: string; subtext: string; imageSrc: string };
  slider: { label: string; headline: string; subtext: string };
  dreizeilen: { line1: string; line2: string; line3: string; currentImageSrc: string };
  freeform: { backgroundMode: string; backgroundColor: string; currentImageSrc: string };
  'pres-title': PresentationInitialProps;
  'pres-image': PresentationInitialProps;
  'pres-content': PresentationInitialProps;
  presentation: PresentationInitialProps;
}

interface PresentationInitialProps {
  title: string;
  subtitle: string;
  bodyText: string;
  bodyText2: string;
  currentImageSrc: string;
}

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

    // Build initial props based on canvas type.
    // Each branch returns an object `satisfies CanvasInitialPropsMap['<key>']` so
    // the field set is structurally checked at compile time (see top of file).
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const buildInitialProps = (): Record<string, unknown> => {
      switch (type) {
        case 'zitat':
          return {
            quote: str(effectiveState.quote),
            name: str(effectiveState.name),
            imageSrc: str(effectiveState.imageSrc) || imageSrc || '',
          } satisfies CanvasInitialPropsMap['zitat'];
        case 'zitat-pure':
          return {
            quote: str(effectiveState.quote),
            name: str(effectiveState.name),
          } satisfies CanvasInitialPropsMap['zitat-pure'];
        case 'info':
          return {
            header: str(effectiveState.header),
            body: str(effectiveState.body),
          } satisfies CanvasInitialPropsMap['info'];
        case 'veranstaltung':
          return {
            eventTitle: str(effectiveState.eventTitle),
            beschreibung: str(effectiveState.beschreibung),
            weekday: str(effectiveState.weekday),
            date: str(effectiveState.date),
            time: str(effectiveState.time),
            locationName: str(effectiveState.locationName),
            address: str(effectiveState.address),
            imageSrc: str(effectiveState.imageSrc) || imageSrc || '',
          } satisfies CanvasInitialPropsMap['veranstaltung'];
        case 'simple':
          return {
            headline: str(effectiveState.headline),
            subtext: str(effectiveState.subtext),
            imageSrc: str(effectiveState.imageSrc) || imageSrc || '',
          } satisfies CanvasInitialPropsMap['simple'];
        case 'slider':
          return {
            label: str(effectiveState.label),
            headline: str(effectiveState.headline),
            subtext: str(effectiveState.subtext),
          } satisfies CanvasInitialPropsMap['slider'];
        case 'dreizeilen':
          return {
            line1: str(effectiveState.line1),
            line2: str(effectiveState.line2),
            line3: str(effectiveState.line3),
            currentImageSrc: str(effectiveState.currentImageSrc) || imageSrc || '',
          } satisfies CanvasInitialPropsMap['dreizeilen'];
        case 'freeform':
          return {
            backgroundMode: str(effectiveState.backgroundMode) || 'color',
            backgroundColor: str(effectiveState.backgroundColor) || '#005538',
            currentImageSrc: str(effectiveState.currentImageSrc) || imageSrc || '',
          } satisfies CanvasInitialPropsMap['freeform'];
        case 'pres-title':
        case 'pres-image':
        case 'pres-content':
        case 'presentation':
          return {
            title: str(effectiveState.title),
            subtitle: str(effectiveState.subtitle),
            bodyText: str(effectiveState.bodyText),
            bodyText2: str(effectiveState.bodyText2),
            currentImageSrc: str(effectiveState.currentImageSrc) || imageSrc || '',
          } satisfies PresentationInitialProps;
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
        return (
          <ProfilbildCanvas
            {...commonProps}
            transparentImage={(effectiveState.transparentImage as string) || imageSrc || ''}
          />
        );

      default:
        return <div>Editor type &quot;{type}&quot; not found.</div>;
    }
  };

  return <>{renderCanvas()}</>;
}
