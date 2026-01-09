import React, { type ReactNode } from 'react';
import './ZoomableViewport.css';

interface ZoomableViewportProps {
  canvasWidth: number;
  canvasHeight: number;
  children: ReactNode;
  defaultZoom?: 'fit' | number; // Kept for compatibility but ignored
}

export function ZoomableViewport({
  children,
}: ZoomableViewportProps) {
  return (
    <div className="zoomable-viewport-wrapper">
      <div className="zoomable-viewport-container">
        <div className="zoomable-viewport-content">
          {children}
        </div>
      </div>
    </div>
  );
}
