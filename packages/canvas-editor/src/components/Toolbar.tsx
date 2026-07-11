import React, { memo } from 'react';

import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider';

import { TopBar } from './TopBar/TopBar';
import { ShareDropdown, type ShareDropdownProps } from './TopBar/ShareDropdown';
import { FloatingAiSuggestionBanner } from './TopBar/modules/FloatingAiSuggestionBanner';
import { FloatingHistoryControls } from './TopBar/modules/FloatingHistoryControls';

/**
 * Toolbar — the green menu bar (3a/3b design).
 *
 * Holds only the file-level chrome: host slots (title, presence), undo/redo,
 * and the Share button. The selection-driven formatting controls live in the
 * floating ContextToolbar (desktop) / MobileContextBar (mobile) — see
 * ContextControls.tsx.
 */

export type AlignmentDirection = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  handlers: {
    undo: () => void;
    redo: () => void;
  };
  /** Share dropdown props — when provided, renders the share button in the top-right */
  shareProps?: ShareDropdownProps;
  /** Host-supplied content rendered at the very left of the bar (in-flow). */
  chromeLeft?: React.ReactNode;
  /** Host-supplied content rendered absolute-centered inside the bar (e.g. doc title, sync badge). */
  chromeCenter?: React.ReactNode;
  /** Host-supplied content rendered in the right cluster, before the ShareDropdown (e.g. presence, people-share). */
  chromeRight?: React.ReactNode;
}

export const Toolbar = memo(
  ({
    canUndo,
    canRedo,
    handlers,
    shareProps,
    chromeLeft,
    chromeCenter,
    chromeRight,
  }: ToolbarProps) => {
    const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);

    const rightCluster =
      chromeRight || shareProps ? (
        <div className="ml-auto flex items-center gap-sm">
          {chromeRight}
          {shareProps && <ShareDropdown {...shareProps} />}
        </div>
      ) : null;

    const centerSlot = chromeCenter ? (
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center max-w-[50%] min-w-0 pointer-events-none [&>*]:pointer-events-auto">
        {chromeCenter}
      </div>
    ) : null;

    // Override mode: when an AI suggestion is pending, replace the toolbar
    // contents with the accept/revert banner. `handlers.undo` is the per-page
    // canvas's undo (via the imperative ref), hitting the correct inner store.
    if (hasPendingAiSuggestion) {
      return (
        <TopBar visible={true}>
          {chromeLeft}
          {centerSlot}
          <FloatingAiSuggestionBanner onUndo={handlers.undo} />
          {rightCluster}
        </TopBar>
      );
    }

    return (
      <TopBar visible={true}>
        {chromeLeft}
        {centerSlot}
        <FloatingHistoryControls
          onUndo={handlers.undo}
          onRedo={handlers.redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onDark
        />
        {rightCluster}
      </TopBar>
    );
  }
);

Toolbar.displayName = 'Toolbar';
