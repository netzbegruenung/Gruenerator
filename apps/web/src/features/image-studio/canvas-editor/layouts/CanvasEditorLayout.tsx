import type { ReactNode } from 'react';
import './CanvasEditorLayout.css';
import '../sidebar/CanvasSidebar.css';

export interface CanvasEditorLayoutProps {
  children: ReactNode;
  title?: string;
  instructions?: string;
  panelContent?: ReactNode;
  actions: ReactNode;
  sidebar?: ReactNode;
  tabBar?: ReactNode;
}

export function CanvasEditorLayout({
  children,
  actions,
  sidebar,
  tabBar,
}: CanvasEditorLayoutProps) {
  const hasSidebar = Boolean(tabBar);

  return (
    <div className={`canvas-editor-layout ${hasSidebar ? 'canvas-editor-layout--with-sidebar' : ''}`}>
      {/* Fixed left sidebar: tab bar + sliding panel */}
      {hasSidebar && (
        <div className="canvas-sidebar">
          {tabBar}
          {sidebar}
        </div>
      )}

      <div className="canvas-editor-layout__main">
        <div className="canvas-editor-layout__canvas">
          {children}
        </div>
      </div>
    </div>
  );
}
