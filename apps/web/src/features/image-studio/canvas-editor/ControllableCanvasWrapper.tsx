import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Import DreizeilenCanvas separately (kept as special case)
import { DreizeilenCanvas } from './composed/DreizeilenCanvas';
import { ProfilbildCanvas } from './ProfilbildCanvas';

// Import GenericCanvas for config-driven canvases
import { GenericCanvas } from './components/GenericCanvas';
import { ZitatMultiPage } from './components/ZitatMultiPage';

// Import full configs
import { zitatPureFullConfig } from './configs/zitat_pure_full.config';
import { simpleFullConfig } from './configs/simple_full.config';
import { infoFullConfig } from './configs/info_full.config';
import { veranstaltungFullConfig } from './configs/veranstaltung_full.config';

import type { DreizeilenCanvasProps } from './composed/DreizeilenCanvas';
import type { ProfilbildCanvasProps } from '@gruenerator/shared/canvas-editor';

type CanvasState = Record<string, any>;

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
    const callbacks: Record<string, (val: any) => void> = {};
    keys.forEach(key => {
      callbacks[`on${key.charAt(0).toUpperCase() + key.slice(1)}Change`] = (val: any) => handlePartChange({ [key]: val });
    });
    return callbacks;
  }, [handlePartChange]);

  const renderCanvas = () => {
    switch (type) {
      // Dreizeilen stays as special case
      case 'dreizeilen':
        return (
          <DreizeilenCanvas
            {...commonProps}
            line1={internalState.line1 || ''}
            line2={internalState.line2 || ''}
            line3={internalState.line3 || ''}
            imageSrc={imageSrc}
            onLine1Change={(line1) => handlePartChange({ line1 })}
            onLine2Change={(line2) => handlePartChange({ line2 })}
            onLine3Change={(line3) => handlePartChange({ line3 })}
          />
        );

      // Config-driven canvases using GenericCanvas
      case 'zitat':
        return (
          <ZitatMultiPage
            key={componentKey}
            initialProps={{
              quote: internalState.quote || '',
              name: internalState.name || '',
              imageSrc: imageSrc || '',
              alternatives: internalState.alternatives || [],
            }}
            onExport={onExport}
            onCancel={onCancel}
            callbacks={createCallbacks(['quote', 'name'])}
          />
        );

      case 'zitat-pure':
        return (
          <GenericCanvas
            key={componentKey}
            config={zitatPureFullConfig}
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
        return (
          <GenericCanvas
            key={componentKey}
            config={infoFullConfig}
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
        return (
          <GenericCanvas
            key={componentKey}
            config={veranstaltungFullConfig}
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
        return (
          <GenericCanvas
            key={componentKey}
            config={simpleFullConfig}
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
