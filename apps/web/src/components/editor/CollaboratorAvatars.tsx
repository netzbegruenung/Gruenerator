import { getRobotAvatarPath } from '@gruenerator/shared/avatar';
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '@gruenerator/ui';

interface CollaboratorInfo {
  id: string;
  name: string;
  color: string;
  avatarRobotId?: number | null;
}

/**
 * Presence avatars for the editor top bar, rendered from `useCollaborators`
 * output. Shared by the docs and sheets editor pages.
 */
export const CollaboratorAvatars = ({ collaborators }: { collaborators: CollaboratorInfo[] }) => {
  if (collaborators.length === 0) return null;
  return (
    <AvatarGroup>
      {collaborators.slice(0, 5).map((c) => (
        <Avatar key={c.id} size="sm" title={c.name}>
          {c.avatarRobotId ? (
            <AvatarImage src={getRobotAvatarPath(c.avatarRobotId)} alt={c.name} />
          ) : null}
          <AvatarFallback style={{ backgroundColor: c.color, color: 'white' }}>
            {c.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {collaborators.length > 5 && <AvatarGroupCount>+{collaborators.length - 5}</AvatarGroupCount>}
    </AvatarGroup>
  );
};
