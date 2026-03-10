import type { ReactNode } from 'react';

interface ZoomableViewportProps {
  canvasWidth: number;
  canvasHeight: number;
  children: ReactNode;
  defaultZoom?: 'fit' | number;
}

export function ZoomableViewport({ children }: ZoomableViewportProps) {
  return (
    <div className="zoomable-viewport-wrapper flex flex-col w-full flex-1 min-h-0">
      <div className="zoomable-viewport-container flex-1 min-h-0 flex items-center justify-center overflow-hidden p-1 max-canvas-mobile:items-start">
        <div className="select-none block w-fit relative">{children}</div>
      </div>
    </div>
  );
}
