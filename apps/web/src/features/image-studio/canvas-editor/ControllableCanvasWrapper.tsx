import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Import all original, unmodified canvas components
import { DreizeilenCanvas } from './composed/DreizeilenCanvas';
import { ZitatCanvas } from './composed/ZitatCanvas';
import { ZitatPureCanvas } from './composed/ZitatPureCanvas';
import { InfoCanvas } from './composed/InfoCanvas';
import { VeranstaltungCanvas } from './composed/VeranstaltungCanvas';
import { ProfilbildCanvas } from './ProfilbildCanvas';
import { SimpleCanvas } from './composed/SimpleCanvas';

import type { DreizeilenCanvasProps } from './composed/DreizeilenCanvas';
import type { ZitatCanvasProps } from './composed/ZitatCanvas';
import type { ZitatPureCanvasProps } from './composed/ZitatPureCanvas';
import type { InfoCanvasProps } from './composed/InfoCanvas';
import type { VeranstaltungCanvasProps } from './composed/VeranstaltungCanvas';
import type { ProfilbildCanvasProps } from '@gruenerator/shared/canvas-editor';
import type { SimpleCanvasProps } from './composed/SimpleCanvas';

type CanvasState = Record<string, any>;

export interface ControllableCanvasWrapperProps {
  type: string;
  initialState: CanvasState;
  imageSrc?: string; // This is the source image for editing, e.g., uploaded background
  onExport: (base64: string) => void;
  onCancel: () => void;
  onStateChange?: (newState: CanvasState) => void;
}

export function ControllableCanvasWrapper({
  type,
  initialState,
  imageSrc, // The source image, not the already generated one
  onExport,
  onCancel,
  onStateChange,
}: ControllableCanvasWrapperProps) {
  const [internalState, setInternalState] = useState<CanvasState>(initialState);
  const [componentKey, setComponentKey] = useState(Date.now());

  // If the external initial state changes, update the internal state and force a remount
  useEffect(() => {
    setInternalState(initialState);
    setComponentKey(Date.now());
  }, [initialState]);

  // Create a unified state change handler
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

  const renderCanvas = () => {
    switch (type) {
      case 'dreizeilen':
        return (
          <DreizeilenCanvas
            {...commonProps}
            line1={internalState.line1 || ''}
            line2={internalState.line2 || ''}
            line3={internalState.line3 || ''}
            imageSrc={imageSrc} // Pass source image
            onLine1Change={(line1) => handlePartChange({ line1 })}
            onLine2Change={(line2) => handlePartChange({ line2 })}
            onLine3Change={(line3) => handlePartChange({ line3 })}
          />
        );
      case 'zitat':
        return (
          <ZitatCanvas
            {...commonProps}
            quote={internalState.quote || ''}
            name={internalState.name || ''}
            imageSrc={imageSrc || ''} // Pass source image
            onQuoteChange={(quote) => handlePartChange({ quote })}
            onNameChange={(name) => handlePartChange({ name })}
          />
        );
      case 'zitat-pure':
        return (
          <ZitatPureCanvas
            {...commonProps}
            quote={internalState.quote || ''}
            name={internalState.name || ''}
            onQuoteChange={(quote) => handlePartChange({ quote })}
            onNameChange={(name) => handlePartChange({ name })}
          />
        );
      case 'info':
        return (
          <InfoCanvas
            {...commonProps}
            header={internalState.header || ''}
            subheader={internalState.subheader || ''}
            body={internalState.body || ''}
            onHeaderChange={(header) => handlePartChange({ header })}
            onSubheaderChange={(subheader) => handlePartChange({ subheader })}
            onBodyChange={(body) => handlePartChange({ body })}
          />
        );
      case 'veranstaltung':
        return (
          <VeranstaltungCanvas
            {...commonProps}
            eventTitle={internalState.eventTitle || ''}
            beschreibung={internalState.beschreibung || ''}
            weekday={internalState.weekday || ''}
            date={internalState.date || ''}
            time={internalState.time || ''}
            locationName={internalState.locationName || ''}
            address={internalState.address || ''}
            imageSrc={imageSrc || ''} // Pass source image
            onEventTitleChange={(eventTitle) => handlePartChange({ eventTitle })}
            onBeschreibungChange={(beschreibung) => handlePartChange({ beschreibung })}
          />
        );
      case 'profilbild':
        return (
          <ProfilbildCanvas
            {...commonProps}
            transparentImage={imageSrc || ''} // Pass source image as transparentImage
          />
        );
      case 'simple':
        return (
          <SimpleCanvas
            {...commonProps}
            headline={internalState.headline || ''}
            subtext={internalState.subtext || ''}
            imageSrc={imageSrc || ''} // Pass source image
            onHeadlineChange={(headline) => handlePartChange({ headline })}
            onSubtextChange={(subtext) => handlePartChange({ subtext })}
          />
        );
      default:
        return <div>Editor type "{type}" not found.</div>;
    }
  };

  return <>{renderCanvas()}</>;
}
