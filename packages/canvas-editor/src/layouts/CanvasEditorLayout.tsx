import React from 'react';
import { HiLink } from 'react-icons/hi';

import type { ReactNode } from 'react';

import { cn } from '../utils/cn';

export interface CanvasEditorLayoutProps {
  children: ReactNode;
  title?: string;
  instructions?: string;
  panelContent?: ReactNode;
  actions: ReactNode;
  sidebar?: ReactNode;
  tabBar?: ReactNode;
  templateCreator?: string | null;
}

export function CanvasEditorLayout({
  children,
  actions,
  sidebar,
  tabBar,
  templateCreator,
}: CanvasEditorLayoutProps) {
  const hasSidebar = Boolean(tabBar);

  return (
    <div
      className={cn(
        'canvas-editor-layout flex flex-col h-screen min-h-[500px]',
        hasSidebar &&
          'ml-[var(--image-studio-tab-bar-width)] max-canvas-mobile:ml-0 max-canvas-mobile:pb-14'
      )}
    >
      {hasSidebar && (
        <div
          className="canvas-sidebar flex fixed left-0 top-0 bottom-0 z-[100] max-canvas-mobile:static max-canvas-mobile:contents"
          style={
            {
              '--font-size-xxs': 'clamp(0.6rem, 0.576rem + 0.12vw, 0.7rem)',
              '--font-size-xs': 'clamp(0.7rem, 0.68rem + 0.1vw, 0.8rem)',
              '--font-size-sm': 'clamp(0.75rem, 0.72rem + 0.15vw, 0.85rem)',
              '--font-size-small': 'var(--font-size-sm)',
              '--font-size-md': 'clamp(0.8rem, 0.76rem + 0.2vw, 0.9rem)',
              '--font-size-base': 'var(--font-size-md)',
              '--font-size-lg': 'clamp(0.9rem, 0.84rem + 0.3vw, 1rem)',
              '--font-size-xl': 'clamp(1rem, 0.92rem + 0.4vw, 1.2rem)',
            } as React.CSSProperties
          }
        >
          {tabBar}
          {sidebar}
        </div>
      )}

      <div className="canvas-editor-layout__main flex flex-col justify-start items-center flex-1 min-h-0 overflow-hidden max-canvas-mobile:flex-1 max-canvas-mobile:p-0">
        {templateCreator && (
          <div className="flex items-center gap-xs py-xs px-sm bg-primary-50 border-b border-primary-100 text-foreground-muted text-[length:var(--font-size-small)] w-full max-canvas-mobile:text-[length:var(--font-size-xsmall)] max-canvas-mobile:py-xxs max-canvas-mobile:px-xs">
            <HiLink className="text-[var(--klee)] text-base shrink-0" />
            <span>
              Vorlage von <strong className="text-foreground">{templateCreator}</strong>
            </span>
          </div>
        )}
        <div className="canvas-editor-layout__canvas flex-1 min-h-0 flex flex-col w-full max-w-full p-sm max-canvas-mobile:flex-1 max-canvas-mobile:p-0">
          {children}
        </div>
      </div>
    </div>
  );
}
