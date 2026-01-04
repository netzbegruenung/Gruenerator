import React, { useState, useEffect, useCallback } from 'react';
import { DreizeilenCanvas as OriginalDreizeilenCanvas } from './DreizeilenCanvas';
import type { DreizeilenCanvasProps, DreizeilenState, DreizeilenAlternative } from './DreizeilenCanvas';

interface ControllableDreizeilenCanvasProps {
  initialState: Partial<DreizeilenState>;
  imageSrc?: string;
  alternatives?: DreizeilenAlternative[];
  onExport: (base64: string) => void;
  onCancel: () => void;
  onStateChange?: (newState: DreizeilenState) => void;
}

export function ControllableDreizeilenCanvas({ initialState, onStateChange, ...props }: ControllableDreizeilenCanvasProps) {
  // The key is used to force a full remount of the original component when the initial state changes significantly
  const [componentKey, setComponentKey] = useState(Date.now());
  const [internalState, setInternalState] = useState(initialState);

  useEffect(() => {
    // If the externally provided initial state changes, we update our internal copy
    // and change the key to force the child to re-initialize with the new props.
    setInternalState(initialState);
    setComponentKey(Date.now());
  }, [initialState]);

  const handleStateChangeFromCanvas = useCallback((newState: DreizeilenState) => {
    // This is called by the child canvas on every change.
    // We can use this to bubble up the complete, current state.
    setInternalState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  return (
    <OriginalDreizeilenCanvas
      key={componentKey}
      line1={internalState.line1 || ''}
      line2={internalState.line2 || ''}
      line3={internalState.line3 || ''}
      onLine1Change={(line1) => handleStateChange({ ...internalState, line1 } as DreizeilenState)}
      onLine2Change={(line2) => handleStateChange({ ...internalState, line2 } as DreizeilenState)}
      onLine3Change={(line3) => handleStateChange({ ...internalState, line3 } as DreizeilenState)}
      {...props}
    />
  );
}
