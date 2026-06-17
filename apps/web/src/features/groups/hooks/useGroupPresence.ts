import { generateUserColor, useCollaborators } from '@gruenerator/collab';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { useState, useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { deriveCollabWsUrl } from '../../../utils/platform';

import type { CollaborationUser } from '@gruenerator/collab';

export interface PresenceUser {
  id: string;
  name: string;
}

// Derived from the absolute API base so it resolves in the desktop (Tauri)
// webview too (window.location would give ws://localhost:1240 there).
export const HOCUSPOCUS_URL: string =
  (import.meta.env.VITE_HOCUSPOCUS_URL as string | undefined) ?? deriveCollabWsUrl();

export function useGroupPresence(
  groupId: string | null,
  user: PresenceUser | null
): { onlineMembers: CollaborationUser[]; provider: HocuspocusProvider | null } {
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const providerRef = useRef<HocuspocusProvider | null>(null);

  useEffect(() => {
    if (!groupId || !user) return;

    const ydoc = new Y.Doc();
    const p = new HocuspocusProvider({
      url: HOCUSPOCUS_URL,
      name: `group-presence-${groupId}`,
      document: ydoc,
    });

    const color = generateUserColor();
    p.awareness?.setLocalStateField('user', { id: user.id, name: user.name, color });

    providerRef.current = p;
    setProvider(p);

    return () => {
      p.awareness?.setLocalState(null);
      p.destroy();
      providerRef.current = null;
      setProvider(null);
    };
  }, [groupId, user?.id]);

  const onlineMembers = useCollaborators(provider);

  return { onlineMembers, provider };
}
