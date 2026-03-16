import { useState, useEffect, useRef } from 'react';

import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { generateUserColor, useCollaborators } from '@gruenerator/collab';

import type { CollaborationUser } from '@gruenerator/collab';

interface PresenceUser {
  id: string;
  name: string;
}

const HOCUSPOCUS_URL = import.meta.env.VITE_HOCUSPOCUS_URL
  || `ws://${window.location.hostname}:1240`;

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
