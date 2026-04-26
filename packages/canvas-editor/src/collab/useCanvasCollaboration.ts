import { useCollaboration, type CollaborationConfig } from '@gruenerator/collab';

interface CanvasCollaborationUser {
  id: string;
  display_name?: string;
  email?: string;
  avatar_robot_id?: number | null;
}

export interface UseCanvasCollaborationOptions {
  documentId: string;
  user: CanvasCollaborationUser | null;
  config: CollaborationConfig;
}

export const useCanvasCollaboration = ({
  documentId,
  user,
  config,
}: UseCanvasCollaborationOptions) => useCollaboration({ documentId, user, config });
