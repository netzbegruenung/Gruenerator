import React from 'react';
import { ControllableCanvasWrapper } from './ControllableCanvasWrapper';
import type { ControllableCanvasWrapperProps } from './ControllableCanvasWrapper';

// This component is a thin layer for clarity and future extension.
// It directly passes props to the ControllableCanvasWrapper.
export function MasterCanvasEditor(props: ControllableCanvasWrapperProps) {
  return <ControllableCanvasWrapper {...props} />;
}
