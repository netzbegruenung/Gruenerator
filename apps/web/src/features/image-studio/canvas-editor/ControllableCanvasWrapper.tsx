import React, { useState, useEffect, useCallback, useRef } from 'react';

import { ConfigMultiPage } from './components/ConfigMultiPage';
import { GenericCanvas } from './components/GenericCanvas';
import { HeterogeneousMultiPage } from './components/HeterogeneousMultiPage';
import { loadCanvasConfig, isValidCanvasType } from './configs/configLoader';
import { ProfilbildCanvas } from './ProfilbildCanvas';

import type { FullCanvasConfig, CanvasConfigId } from './configs/types';

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
}

export function ControllableCanvasWrapper({
  type,
  initialState,
  imageSrc,
  onExport,
  onCancel,
  onStateChange,
}: ControllableCanvasWrapperProps) {
  const [internalState, setInternalState] = useState<CanvasState>(initialState);
  const [componentKey, setComponentKey] = useState(Date.now());
  const [config, setConfig] = useState<FullCanvasConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Track previous initialState to detect actual content changes
  const prevInitialStateRef = useRef<CanvasState>(initialState);

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
    ].includes(type);

    if (needsConfig && isValidCanvasType(type)) {
      setConfigLoading(true);
      loadCanvasConfig(type)
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

  // Only update state and key when initialState CONTENT actually changes
  // This prevents remounting when parent re-renders with same values but new object reference
  useEffect(() => {
    const prevState = prevInitialStateRef.current;
    const hasContentChanged = !stateEqual(prevState, initialState);

    if (hasContentChanged) {
      setInternalState(initialState);
      setComponentKey(Date.now());
      prevInitialStateRef.current = initialState;
    }
  }, [initialState]);

  const handlePartChange = useCallback(
    (change: Partial<CanvasState>) => {
      const newState = { ...internalState, ...change };
      setInternalState(newState);
      onStateChange?.(newState);
    },
    [internalState, onStateChange]
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
            quote: internalState.quote || '',
            name: internalState.name || '',
            imageSrc: imageSrc || '',
            alternatives: internalState.alternatives || [],
          };
        case 'zitat-pure':
          return {
            quote: internalState.quote || '',
            name: internalState.name || '',
            alternatives: internalState.alternatives || [],
          };
        case 'info':
          return {
            header: internalState.header || '',
            body: internalState.body || '',
            alternatives: internalState.alternatives || [],
          };
        case 'veranstaltung':
          return {
            eventTitle: internalState.eventTitle || '',
            beschreibung: internalState.beschreibung || '',
            weekday: internalState.weekday || '',
            date: internalState.date || '',
            time: internalState.time || '',
            locationName: internalState.locationName || '',
            address: internalState.address || '',
            imageSrc: imageSrc || '',
            alternatives: internalState.alternatives || [],
          };
        case 'simple':
          return {
            headline: internalState.headline || '',
            subtext: internalState.subtext || '',
            imageSrc: imageSrc || '',
            alternatives: internalState.alternatives || [],
          };
        case 'dreizeilen':
          return {
            line1: internalState.line1 || '',
            line2: internalState.line2 || '',
            line3: internalState.line3 || '',
            currentImageSrc: imageSrc || '',
            alternatives: internalState.alternatives || [],
          };
        default:
          return internalState;
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
        case 'dreizeilen':
          return createCallbacks(['line1', 'line2', 'line3']);
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
      case 'dreizeilen':
        if (!config) return <div>Lädt Konfiguration...</div>;

        // Use HeterogeneousMultiPage for heterogeneous mode (different templates per page)
        if (config.multiPage?.enabled && config.multiPage?.heterogeneous) {
          return (
            <HeterogeneousMultiPage
              key={componentKey}
              initialConfigId={type as CanvasConfigId}
              initialProps={buildInitialProps()}
              onExport={onExport}
              onCancel={onCancel}
              callbacks={buildCallbacks()}
              maxPages={config.multiPage?.maxPages ?? 10}
            />
          );
        }

        // Use ConfigMultiPage for homogeneous multiPage (same template)
        if (config.multiPage?.enabled) {
          return (
            <ConfigMultiPage
              key={componentKey}
              config={config}
              canvasType={type}
              initialProps={buildInitialProps()}
              onExport={onExport}
              onCancel={onCancel}
              callbacks={buildCallbacks()}
            />
          );
        }

        // Fall back to GenericCanvas for single-page canvases
        return (
          <GenericCanvas
            key={componentKey}
            config={config}
            initialProps={buildInitialProps()}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={buildCallbacks()}
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
