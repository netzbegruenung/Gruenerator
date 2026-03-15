import { useCollaboration } from '@gruenerator/docs';
import { useMemo } from 'react';

import { useAuthStore } from '../../../stores/authStore';

export const useBoardCollaboration = (boardId: string) => {
  const user = useAuthStore((s) => s.user);

  const collaborationUser = useMemo(
    () =>
      user ? { id: String(user.id), display_name: user.display_name, email: user.email } : null,
    [user?.id, user?.display_name, user?.email]
  );

  return useCollaboration({
    documentId: boardId,
    user: collaborationUser,
  });
};
