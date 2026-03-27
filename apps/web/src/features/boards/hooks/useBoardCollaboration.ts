import { useCollaboration } from '@gruenerator/collab';
import { useMemo } from 'react';

import { useCollaborationConfig } from '../../../hooks/useCollaborationConfig';
import { useAuthStore } from '../../../stores/authStore';

export const useBoardCollaboration = (boardId: string) => {
  const user = useAuthStore((s) => s.user);
  const config = useCollaborationConfig();

  const collaborationUser = useMemo(
    () =>
      user
        ? {
            id: String(user.id),
            display_name: user.display_name,
            email: user.email,
            avatar_robot_id: user.avatar_robot_id,
          }
        : null,
    [user?.id, user?.display_name, user?.email, user?.avatar_robot_id]
  );

  return useCollaboration({
    documentId: boardId,
    user: collaborationUser,
    config,
  });
};
