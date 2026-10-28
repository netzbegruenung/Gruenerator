import { useCanvasStoreSelector } from '@ggraphic/editor/stores/CanvasStoreProvider';
import React, { memo } from 'react';

import { AutoSaveIndicator } from '@ggraphic/editor/components/TopBar/AutoSaveIndicator';
import { FloatingAiSuggestionBanner } from '@ggraphic/editor/components/TopBar/modules/FloatingAiSuggestionBanner';
import { FloatingHistoryControls } from '@ggraphic/editor/components/TopBar/modules/FloatingHistoryControls';
import { ShareDropdown, type ShareDropdownProps } from './TopBar/ShareDropdown';
import { TopBar } from '@ggraphic/editor/components/TopBar/TopBar';

/**
 * Toolbar — the green menu bar (3a/3b design).
 *
 * Holds only the file-level chrome: host slots (title, presence), undo/redo,
 * and the Share button. The selection-driven formatting controls live in the
 * floating ContextToolbar (desktop) / the mobile sheet's MobileSelectionControls — see
 * ContextControls.tsx.
 */

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  handlers: {
    undo: () => void;
    /** Page-level undo, for a suggestion that replaced the deck. */
    undoPages: () => void;
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
  /** Mobile: the pending-suggestion banner lives here. Desktop shows it as a card in the context-bar slot. */
  suggestionInBar: boolean;
  /**
   * The host draws the bar (see `CanvasEditorProps.hostChrome`): no bar here
   * except the suggestion banner, and the share menu opens on the host's request.
   */
  hostShare?: { open: boolean; onOpenChange: (open: boolean) => void };
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
    suggestionInBar,
    hostShare,
  }: ToolbarProps) => {
    const hasPendingAiSuggestion = useCanvasStoreSelector((s) => s.pendingAiSuggestion !== null);

    if (hostShare) {
      return (
        <>
          {hasPendingAiSuggestion && suggestionInBar && (
            <TopBar visible={true}>
              <FloatingAiSuggestionBanner onUndo={handlers.undo} onUndoPages={handlers.undoPages} />
            </TopBar>
          )}
          {shareProps && (
            <div className="relative h-0">
              <ShareDropdown {...shareProps} hostControl={hostShare} />
            </div>
          )}
        </>
      );
    }

    const rightCluster =
      chromeRight || shareProps ? (
        <div className="ml-auto flex items-center gap-sm">
          {chromeRight}
          {shareProps && <ShareDropdown {...shareProps} />}
        </div>
      ) : null;

    const centerSlot = chromeCenter ? (
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center max-w-[50%] min-w-0 pointer-events-none [&>*]:pointer-events-auto max-canvas-mobile:static max-canvas-mobile:translate-x-0 max-canvas-mobile:flex-1 max-canvas-mobile:max-w-none">
        {chromeCenter}
      </div>
    ) : null;

    // Override mode: when an AI suggestion is pending, undo/redo leave the bar
    // (the decision is keep or discard). On mobile the accept/revert banner
    // takes their place; `handlers.undo` is the per-page canvas's undo (via the
    // imperative ref), hitting the correct inner store.
    if (hasPendingAiSuggestion) {
      return (
        <TopBar visible={true}>
          {chromeLeft}
          {centerSlot}
          {suggestionInBar && (
            <FloatingAiSuggestionBanner onUndo={handlers.undo} onUndoPages={handlers.undoPages} />
          )}
          {rightCluster}
        </TopBar>
      );
    }

    return (
      <TopBar visible={true}>
        {chromeLeft}
        {centerSlot}
        {/* Desktop shows the save state in the tab rail; mobile has no rail. */}
        <div className="canvas-mobile:hidden">
          <AutoSaveIndicator onDark />
        </div>
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
