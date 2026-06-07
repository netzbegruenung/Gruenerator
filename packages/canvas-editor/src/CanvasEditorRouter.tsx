import React, { useState, useEffect, useCallback, useRef } from 'react';

import './canvas-editor.css';
import type { StockImageAttribution } from './common/imageSourceTypes';
import { useYjsFormState } from './collab/useYjsFormState';
import { CanvasEditor } from './components/CanvasEditor';
import { loadCanvasConfig, isValidCanvasType } from './configs/configLoader';
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
/**
 * Background-image state that persists alongside the image so the position,
 * zoom, opacity and Unsplash credit all survive a reload — not just the URL.
 * Optional because legacy saves and non-image layouts omit them.
 */
interface BackgroundImageProps {
  imageOffset?: { x: number; y: number };
  imageScale?: number;
  backgroundImageOpacity?: number;
  imageAttribution?: StockImageAttribution | null;
}

export interface CanvasInitialPropsMap {
  zitat: { quote: string; name: string; imageSrc: string } & BackgroundImageProps;
  'zitat-pure': { quote: string; name: string };
  info: { header: string; body: string };
  veranstaltung: VeranstaltungInitialProps;
  'veranstaltung-plakat': VeranstaltungInitialProps;
  simple: { headline: string; subtext: string; imageSrc: string } & BackgroundImageProps;
  slider: { label: string; headline: string; subtext: string };
  dreizeilen: {
    line1: string;
    line2: string;
    line3: string;
    currentImageSrc: string;
  } & BackgroundImageProps;
  freeform: {
    backgroundMode: string;
    backgroundColor: string;
    currentImageSrc: string;
  } & BackgroundImageProps;
  'pres-title': PresentationInitialProps;
  'pres-image': PresentationInitialProps;
  'pres-content': PresentationInitialProps;
  presentation: PresentationInitialProps;
  profilbild: { transparentImage: string; backgroundColor: string };
}

interface VeranstaltungInitialProps extends BackgroundImageProps {
  eventTitle: string;
  beschreibung: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address: string;
  imageSrc: string;
}

interface PresentationInitialProps extends BackgroundImageProps {
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
  /**
   * Seeds the per-instance AutoSaveStore so reloads update the existing
   * gallery record instead of creating a new draft. Routes that load an
   * existing share by token should pass it through here.
   */
  initialShareToken?: string | null;
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
  chromeLeft,
  chromeCenter,
  chromeRight,
  onInvitePeople,
  initialShareToken,
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
      'profilbild',
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
      console.log('[CanvasCollab][handlePartChange]', {
        isCollab,
        keys: Object.keys(change),
      });
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
    // The persisted background lives under `currentImageSrc` for every type;
    // some types surface it to the inner canvas as `imageSrc`. Fall back across
    // both (and the legacy `imageSrc` prop) so saves from either key re-hydrate.
    const bgSrc = (): string =>
      str(effectiveState.currentImageSrc) || str(effectiveState.imageSrc) || imageSrc || '';
    // Image transform/opacity/credit that persist alongside the URL.
    const bgImageProps = (): BackgroundImageProps => ({
      imageOffset: effectiveState.imageOffset as { x: number; y: number } | undefined,
      imageScale: effectiveState.imageScale as number | undefined,
      backgroundImageOpacity: effectiveState.backgroundImageOpacity as number | undefined,
      imageAttribution:
        (effectiveState.imageAttribution as StockImageAttribution | null | undefined) ?? null,
    });
    const buildInitialProps = (): Record<string, unknown> => {
      switch (type) {
        case 'zitat':
          return {
            quote: str(effectiveState.quote),
            name: str(effectiveState.name),
            imageSrc: bgSrc(),
            ...bgImageProps(),
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
        case 'veranstaltung-plakat':
          return {
            eventTitle: str(effectiveState.eventTitle),
            beschreibung: str(effectiveState.beschreibung),
            weekday: str(effectiveState.weekday),
            date: str(effectiveState.date),
            time: str(effectiveState.time),
            locationName: str(effectiveState.locationName),
            address: str(effectiveState.address),
            imageSrc: bgSrc(),
            ...bgImageProps(),
          } satisfies CanvasInitialPropsMap['veranstaltung'];
        case 'simple':
          return {
            headline: str(effectiveState.headline),
            subtext: str(effectiveState.subtext),
            imageSrc: bgSrc(),
            ...bgImageProps(),
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
            currentImageSrc: bgSrc(),
            ...bgImageProps(),
          } satisfies CanvasInitialPropsMap['dreizeilen'];
        case 'freeform':
          return {
            backgroundMode: str(effectiveState.backgroundMode) || 'color',
            backgroundColor: str(effectiveState.backgroundColor) || '#005538',
            currentImageSrc: bgSrc(),
            ...bgImageProps(),
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
            currentImageSrc: bgSrc(),
            ...bgImageProps(),
          } satisfies PresentationInitialProps;
        case 'profilbild':
          return {
            transparentImage: str(effectiveState.transparentImage) || imageSrc || '',
            backgroundColor: str(effectiveState.backgroundColor),
          } satisfies CanvasInitialPropsMap['profilbild'];
        default:
          return effectiveState;
      }
    };

    // Background-image fields that must sync back to the collab doc when changed
    // in-editor (GenericCanvas emits the matching on<Key>Change). Without these
    // the chosen image — and its position/zoom/opacity/credit — is local-only
    // and lost on reload. `currentImageSrc` is the persisted key for every type.
    const BG_IMAGE_KEYS = [
      'currentImageSrc',
      'imageOffset',
      'imageScale',
      'backgroundImageOpacity',
      'imageAttribution',
    ];

    // Build callbacks based on canvas type
    const buildCallbacks = (): Record<string, (val: unknown) => void> => {
      switch (type) {
        case 'zitat':
          return createCallbacks(['quote', 'name', ...BG_IMAGE_KEYS]);
        case 'zitat-pure':
          return createCallbacks(['quote', 'name']);
        case 'info':
          return createCallbacks(['header', 'body']);
        case 'veranstaltung':
        case 'veranstaltung-plakat':
          return createCallbacks(['eventTitle', 'beschreibung', ...BG_IMAGE_KEYS]);
        case 'simple':
          return createCallbacks(['headline', 'subtext', ...BG_IMAGE_KEYS]);
        case 'slider':
          return createCallbacks(['label', 'headline', 'subtext']);
        case 'dreizeilen':
          return createCallbacks(['line1', 'line2', 'line3', ...BG_IMAGE_KEYS]);
        case 'freeform':
          // backgroundMode must persist alongside the image — the background
          // image element only renders when backgroundMode === 'image'.
          return createCallbacks(['backgroundMode', ...BG_IMAGE_KEYS]);
        case 'pres-title':
        case 'pres-image':
        case 'pres-content':
        case 'presentation':
          return createCallbacks([
            'title',
            'subtitle',
            'bodyText',
            'bodyText2',
            ...BG_IMAGE_KEYS,
          ]);
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
      case 'profilbild':
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
            chromeLeft={chromeLeft}
            chromeCenter={chromeCenter}
            chromeRight={chromeRight}
            onInvitePeople={onInvitePeople}
            initialShareToken={initialShareToken}
          />
        );

      default:
        return <div>Editor type &quot;{type}&quot; not found.</div>;
    }
  };

  return <>{renderCanvas()}</>;
}
