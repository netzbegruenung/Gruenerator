import { useAwarenessState } from '@gruenerator/collab';
import { useEffect, useMemo } from 'react';

import { useCanvasStoreSelector } from '../stores/CanvasStoreProvider';

import type { HocuspocusProvider } from '@hocuspocus/provider';

interface RemoteSelection {
  clientId: number;
  userId: string;
  userName: string;
  color: string;
  selectedLayerIds: string[];
  /** Multi-page only — id of the page the remote user is currently editing. */
  activePageId: string | null;
}

interface AwarenessRecord {
  user?: { id?: string; name?: string; color?: string };
  selectedLayerIds?: string[];
  activePageId?: string;
}

interface UseSelectionAwarenessOptions {
  /** Multi-page only — the local user's currently active page id. */
  activePageId?: string | null;
  /**
   * Whether this instance publishes the local selection. In multi-page mode
   * every page mounts the hook on the same provider — only the active page
   * may publish, or instances would overwrite each other.
   */
  publish?: boolean;
}

export function useSelectionAwareness(
  provider: HocuspocusProvider | null,
  options?: UseSelectionAwarenessOptions
): RemoteSelection[] {
  const localSelection = useCanvasStoreSelector((s) => s.selectedLayerIds);
  // The config-driven editor tracks its selection in selectedElement (single id);
  // selectedLayerIds is only populated by the layer API. Publish whichever is active.
  const localElement = useCanvasStoreSelector((s) => s.selectedElement);
  const activePageId = options?.activePageId ?? null;
  const publish = options?.publish ?? true;

  useEffect(() => {
    if (!provider?.awareness || !publish) return;
    const published = localElement ? [localElement] : localSelection;
    provider.awareness.setLocalStateField('selectedLayerIds', published);
  }, [provider, localSelection, localElement, publish]);

  useEffect(() => {
    if (!provider?.awareness || !publish) return;
    provider.awareness.setLocalStateField('activePageId', activePageId);
  }, [provider, activePageId, publish]);

  const remote = useAwarenessState<RemoteSelection[]>(
    provider,
    (states) => {
      if (!provider?.awareness) return [];
      const selfClientId = provider.awareness.clientID;
      const result: RemoteSelection[] = [];
      states.forEach((value, clientId) => {
        if (clientId === selfClientId) return;
        const record = value as AwarenessRecord;
        if (!record?.user?.id) return;
        result.push({
          clientId,
          userId: record.user.id,
          userName: record.user.name || 'Anonym',
          color: record.user.color || '#888',
          selectedLayerIds: record.selectedLayerIds || [],
          activePageId: record.activePageId ?? null,
        });
      });
      return result;
    },
    (a, b) => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (a[i].clientId !== b[i].clientId) return false;
        if (a[i].activePageId !== b[i].activePageId) return false;
        if (a[i].selectedLayerIds.length !== b[i].selectedLayerIds.length) return false;
        for (let j = 0; j < a[i].selectedLayerIds.length; j++) {
          if (a[i].selectedLayerIds[j] !== b[i].selectedLayerIds[j]) return false;
        }
      }
      return true;
    }
  );

  return useMemo(() => remote ?? [], [remote]);
}
