import React from 'react';

import { ControllableCanvasWrapper } from './ControllableCanvasWrapper';

import type { ControllableCanvasWrapperProps } from './ControllableCanvasWrapper';

export function MasterCanvasEditor(props: ControllableCanvasWrapperProps) {
  return <ControllableCanvasWrapper {...props} />;
}
