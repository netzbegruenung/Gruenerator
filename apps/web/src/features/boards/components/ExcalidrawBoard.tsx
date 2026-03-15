import { Excalidraw } from '@excalidraw/excalidraw';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import '@excalidraw/excalidraw/index.css';
import { ExcalidrawBinding } from 'y-excalidraw';

import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import type * as Y from 'yjs';

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
    ? ('dark' as const)
    : ('light' as const);
}

function useDataTheme() {
  return useSyncExternalStore((cb) => {
    const observer = new MutationObserver(cb);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, getTheme);
}

interface ExcalidrawBoardProps {
  ydoc: Y.Doc;
  provider: HocuspocusProvider | null;
  isSynced: boolean;
}

const LIBRARY_STORAGE_KEY = 'excalidraw-user-library';

function loadUserLibraryItems() {
  try {
    return JSON.parse(localStorage.getItem(LIBRARY_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function ExcalidrawBoard({ ydoc, provider, isSynced }: ExcalidrawBoardProps) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const bindingRef = useRef<ExcalidrawBinding | null>(null);
  const theme = useDataTheme();

  const initialData = useMemo(
    () => ({
      libraryItems: loadUserLibraryItems(),
    }),
    []
  );

  const handleLibraryChange = useCallback((items: readonly unknown[]) => {
    const userOnly = (items as { id: string }[]).filter((i) => !i.id.startsWith('system-'));
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(userOnly));
  }, []);

  const handlePointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number }; button: string }) => {
      if (provider?.awareness) {
        provider.awareness.setLocalStateField('excalidrawCursor', {
          x: payload.pointer.x,
          y: payload.pointer.y,
          button: payload.button,
        });
      }
    },
    [provider]
  );

  useEffect(() => {
    if (!api || !isSynced || !provider) return;

    const yElements = ydoc.getArray('elements');
    const yAssets = ydoc.getMap('assets');

    const binding = new ExcalidrawBinding(yElements, yAssets, api, provider.awareness);
    bindingRef.current = binding;

    return () => {
      binding.destroy();
      bindingRef.current = null;
    };
  }, [api, isSynced, provider, ydoc]);

  return (
    <div className="flex-1 w-full h-full">
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onLibraryChange={handleLibraryChange}
        theme={theme}
        langCode="de-DE"
        onPointerUpdate={handlePointerUpdate}
      />
    </div>
  );
}
