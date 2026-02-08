import { useMemo } from 'react';
import { YjsThreadStore, DefaultThreadStoreAuth } from '@blocknote/core/comments';
import type * as Y from 'yjs';

interface CommentsUser {
  id: string;
  name: string;
  color: string;
}

interface UseBlockNoteCommentsOptions {
  ydoc: Y.Doc | null;
  user: CommentsUser | null;
  canEdit: boolean;
}

export const useBlockNoteComments = ({ ydoc, user, canEdit }: UseBlockNoteCommentsOptions) => {
  const threadStore = useMemo(() => {
    if (!ydoc || !user) return null;

    const threadsMap = ydoc.getMap('threads');
    const auth = new DefaultThreadStoreAuth(user.id, canEdit ? 'editor' : 'comment');

    return new YjsThreadStore(user.id, threadsMap, auth);
  }, [ydoc, user, canEdit]);

  return { threadStore };
};
