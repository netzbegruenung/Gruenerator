import React from 'react';

import { ControllableCanvasWrapper } from './CanvasEditorRouter';

import type { ControllableCanvasWrapperProps } from './CanvasEditorRouter';

export function MasterCanvasEditor(props: ControllableCanvasWrapperProps) {
  return <ControllableCanvasWrapper {...props} />;
}
