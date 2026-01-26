import React, { useState, useCallback } from 'react';
import { v4 as uuid } from 'uuid';

import { GenericCanvas } from './GenericCanvas';

import type { FullCanvasConfig } from '../configs/types';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';
import './MultiPageCanvasEditor.css';

interface PageState<TState> {
  id: string;
  state: TState;
  order: number;
}

interface MultiPageCanvasEditorProps<
  TState extends Record<string, unknown>,
  TActions extends OptionalCanvasActions,
> {
  config: FullCanvasConfig<TState, TActions>;
  /** Initial props for the first page (quote, name, imageSrc, etc.) */
  initialProps?: Record<string, unknown>;
  initialPages?: PageState<TState>[];
  onExport: (base64: string, pageIndex: number) => void;
  onExportAll?: (pages: { base64: string; index: number }[]) => void;
  onCancel: () => void;
  callbacks?: Record<string, ((val: unknown) => void) | undefined>;
}

export function MultiPageCanvasEditor<
  TState extends Record<string, unknown>,
  TActions extends OptionalCanvasActions,
>({
  config,
  initialProps = {},
  initialPages,
  onExport,
  onCancel,
  callbacks = {},
}: MultiPageCanvasEditorProps<TState, TActions>) {
  // Initialize pages
  const [pages, setPages] = useState<PageState<TState>[]>(() => {
    if (initialPages?.length) return initialPages;

    // Start with one page using initialProps
    return [
      {
        id: uuid(),
        state: config.createInitialState(initialProps),
        order: 0,
      },
    ];
  });

  // Check if we can add more pages
  const canAddMorePages = !config.multiPage?.maxPages || pages.length < config.multiPage.maxPages;

  // Add new page
  const handleAddPage = useCallback(() => {
    if (!canAddMorePages) return;

    setPages((prev) => [
      ...prev,
      {
        id: uuid(),
        state: config.createInitialState(config.multiPage?.defaultNewPageState || {}),
        order: prev.length,
      },
    ]);
  }, [config, canAddMorePages]);

  // Delete page
  const handleDeletePage = useCallback(
    (pageId: string) => {
      if (pages.length <= 1) return; // Keep at least one page

      setPages((prev) => prev.filter((p) => p.id !== pageId).map((p, i) => ({ ...p, order: i })));
    },
    [pages.length]
  );

  // Update page state
  const handlePageStateChange = useCallback((pageId: string, partial: Partial<TState>) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, state: { ...p.state, ...partial } } : p))
    );
  }, []);

  // Export single page
  const handleExportPage = useCallback(
    (base64: string, pageIndex: number) => {
      onExport(base64, pageIndex);
    },
    [onExport]
  );

  // Create callbacks for a specific page
  const createPageCallbacks = useCallback(
    (pageId: string) => {
      return Object.keys(callbacks).reduce((acc: Record<string, (val: unknown) => void>, key) => {
        const match = key.match(/^on(.+)Change$/);
        if (match) {
          const propName = match[1].charAt(0).toLowerCase() + match[1].slice(1);
          acc[key] = (val: unknown) =>
            handlePageStateChange(pageId, { [propName]: val } as Partial<TState>);
        }
        return acc;
      }, {});
    },
    [callbacks, handlePageStateChange]
  );

  const sortedPages = pages.sort((a, b) => a.order - b.order);

  return (
    <div className="multi-page-canvas-editor">
      <div className="multi-page-scroll-container">
        {sortedPages.map((page, index) => (
          <div key={page.id} className="page-wrapper">
            {/* Page header with number and delete */}
            <div className="page-header">
              <span className="page-number">Seite {index + 1}</span>
              {pages.length > 1 && (
                <button
                  className="delete-page-btn"
                  onClick={() => handleDeletePage(page.id)}
                  title="Seite löschen"
                >
                  ×
                </button>
              )}
            </div>

            {/* Canvas with + button at bottom when it's the last page */}
            <GenericCanvas
              config={config}
              initialProps={page.state}
              onExport={(base64) => handleExportPage(base64, index)}
              onCancel={onCancel}
              callbacks={createPageCallbacks(page.id)}
              onAddPage={
                index === sortedPages.length - 1 && canAddMorePages ? handleAddPage : undefined
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default MultiPageCanvasEditor;
