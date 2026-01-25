import { HiLink } from 'react-icons/hi';

import useImageStudioStore from '../../../../stores/imageStudioStore';

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
  const templateCreator = useImageStudioStore((state) => state.templateCreator);

  return (
    <div
      className={`canvas-editor-layout ${hasSidebar ? 'canvas-editor-layout--with-sidebar' : ''}`}
    >
      {/* Fixed left sidebar: tab bar + sliding panel */}
      {hasSidebar && (
        <div className="canvas-sidebar">
          {tabBar}
          {sidebar}
        </div>
      )}

      <div className="canvas-editor-layout__main">
        {templateCreator && (
          <div className="template-creator-banner">
            <HiLink className="template-creator-banner__icon" />
            <span>
              Vorlage von <strong>{templateCreator}</strong>
            </span>
          </div>
        )}
        <div className="canvas-editor-layout__canvas">{children}</div>
      </div>
    </div>
  );
}
