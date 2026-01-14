import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Import DreizeilenCanvas separately (kept as special case)
import { DreizeilenCanvas } from './composed/DreizeilenCanvas';
import { ProfilbildCanvas } from './ProfilbildCanvas';

// Import GenericCanvas for config-driven canvases
import { GenericCanvas } from './components/GenericCanvas';
import { ZitatMultiPage } from './components/ZitatMultiPage';

import { loadCanvasConfig, isValidCanvasType } from './configs/configLoader';
import type { FullCanvasConfig } from './configs/types';
import { assertAsString, assertAsStringArray } from './utils/stateTypeAssertions';

import type { DreizeilenCanvasProps } from './composed/DreizeilenCanvas';
import type { ProfilbildCanvasProps } from '@gruenerator/shared/canvas-editor';

type CanvasState = Record<string, unknown>;

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

  // Load config dynamically when type changes (for config-driven canvases)
  useEffect(() => {
    const needsConfig = ['zitat-pure', 'info', 'veranstaltung', 'simple'].includes(type);

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

  useEffect(() => {
    setInternalState(initialState);
    setComponentKey(Date.now());
  }, [initialState]);

  const handlePartChange = useCallback((change: Partial<CanvasState>) => {
    const newState = { ...internalState, ...change };
    setInternalState(newState);
    onStateChange?.(newState);
  }, [internalState, onStateChange]);

  const commonProps = {
    key: componentKey,
    onExport,
    onCancel,
  };

  // Create callbacks object for GenericCanvas
  const createCallbacks = useCallback((keys: string[]) => {
    const callbacks: Record<string, (val: unknown) => void> = {};
    keys.forEach(key => {
      callbacks[`on${key.charAt(0).toUpperCase() + key.slice(1)}Change`] = (val: unknown) => handlePartChange({ [key]: val });
    });
    return callbacks;
  }, [handlePartChange]);

  const renderCanvas = () => {
    // Show loading state while config loads
    if (configLoading) {
      return <div>Lädt Editor...</div>;
    }

    switch (type) {
      // Dreizeilen stays as special case (has its own config loading)
      case 'dreizeilen':
        return (
          <DreizeilenCanvas
            {...commonProps}
            line1={assertAsString(internalState.line1)}
            line2={assertAsString(internalState.line2)}
            line3={assertAsString(internalState.line3)}
            imageSrc={imageSrc}
            onLine1Change={(line1) => handlePartChange({ line1 })}
            onLine2Change={(line2) => handlePartChange({ line2 })}
            onLine3Change={(line3) => handlePartChange({ line3 })}
          />
        );

      case 'zitat':
        return (
          <ZitatMultiPage
            key={componentKey}
            initialProps={{
              quote: assertAsString(internalState.quote),
              name: assertAsString(internalState.name),
              imageSrc: imageSrc || '',
              alternatives: assertAsStringArray(internalState.alternatives),
            }}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={createCallbacks(['quote', 'name'])}
          />
        );

      // Config-driven canvases using dynamically loaded config
      case 'zitat-pure':
        if (!config) return <div>Lädt Konfiguration...</div>;
        return (
          <GenericCanvas
            key={componentKey}
            config={config}
            initialProps={{
              quote: internalState.quote || '',
              name: internalState.name || '',
              alternatives: internalState.alternatives || [],
            }}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={createCallbacks(['quote', 'name'])}
          />
        );

      case 'info':
        if (!config) return <div>Lädt Konfiguration...</div>;
        return (
          <GenericCanvas
            key={componentKey}
            config={config}
            initialProps={{
              header: internalState.header || '',
              body: internalState.body || '',
              alternatives: internalState.alternatives || [],
            }}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={createCallbacks(['header', 'body'])}
          />
        );

      case 'veranstaltung':
        if (!config) return <div>Lädt Konfiguration...</div>;
        return (
          <GenericCanvas
            key={componentKey}
            config={config}
            initialProps={{
              eventTitle: internalState.eventTitle || '',
              beschreibung: internalState.beschreibung || '',
              weekday: internalState.weekday || '',
              date: internalState.date || '',
              time: internalState.time || '',
              locationName: internalState.locationName || '',
              address: internalState.address || '',
              imageSrc: imageSrc || '',
              alternatives: internalState.alternatives || [],
            }}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={createCallbacks(['eventTitle', 'beschreibung'])}
          />
        );

      case 'simple':
        if (!config) return <div>Lädt Konfiguration...</div>;
        return (
          <GenericCanvas
            key={componentKey}
            config={config}
            initialProps={{
              headline: internalState.headline || '',
              subtext: internalState.subtext || '',
              imageSrc: imageSrc || '',
              alternatives: internalState.alternatives || [],
            }}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={createCallbacks(['headline', 'subtext'])}
          />
        );

      case 'profilbild':
        return (
          <ProfilbildCanvas
            {...commonProps}
            transparentImage={imageSrc || ''}
          />
        );

      default:
        return <div>Editor type "{type}" not found.</div>;
    }
  };

  return <>{renderCanvas()}</>;
}
