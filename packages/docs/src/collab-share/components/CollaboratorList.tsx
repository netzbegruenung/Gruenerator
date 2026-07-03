import { getAvatarDisplayProps, getRobotAvatarPath } from '@gruenerator/shared/avatar';
import { Badge } from '@gruenerator/ui';
import { FiTrash2 } from 'react-icons/fi';

import { PERMISSION_LEVEL_LABELS } from '../constants.js';
import { type SharingCollaborator } from '../types.js';

interface CollaboratorListProps {
  collaborators: SharingCollaborator[];
  onUpdatePermission: (userId: string, permissionLevel: 'viewer' | 'editor') => void;
  onRevoke: (userId: string) => void;
}

const CollaboratorAvatar = ({ collaborator }: { collaborator: SharingCollaborator }) => {
  const avatar = getAvatarDisplayProps(collaborator);
  if (avatar.type === 'robot') {
    return (
      <img
        src={getRobotAvatarPath(avatar.robotId!)}
        alt={avatar.alt}
        width={24}
        height={24}
        loading="lazy"
        decoding="async"
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-300">
      {avatar.initials}
    </div>
  );
};

export const CollaboratorList = ({
  collaborators,
  onUpdatePermission,
  onRevoke,
}: CollaboratorListProps) => {
  // The permissions endpoint returns mixed rows; group shares render via GroupShareControls.
  const users = collaborators.filter((c) => c.type !== 'group');
  if (users.length === 0) return null;

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-grey-500">Personen mit Zugriff</label>
      <div className="space-y-1.5">
        {users.map((collab) => (
          <div
            key={collab.user_id}
            className="flex items-center justify-between rounded-md border border-grey-200 px-2.5 py-1.5 dark:border-grey-700"
          >
            <div className="flex min-w-0 items-center gap-2">
              <CollaboratorAvatar collaborator={collab} />
              <p className="min-w-0 truncate text-sm">{collab.display_name || collab.email}</p>
            </div>
            {collab.permission_level === 'owner' ? (
              <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                {PERMISSION_LEVEL_LABELS.owner}
              </Badge>
            ) : (
              <div className="flex shrink-0 items-center gap-1">
                <select
                  value={collab.permission_level}
                  onChange={(e) =>
                    onUpdatePermission(collab.user_id, e.target.value as 'viewer' | 'editor')
                  }
                  className="rounded border border-grey-200 bg-background px-1 py-0.5 text-[10px] outline-none dark:border-grey-700"
                >
                  <option value="viewer">{PERMISSION_LEVEL_LABELS.viewer}</option>
                  <option value="editor">{PERMISSION_LEVEL_LABELS.editor}</option>
                </select>
                <button
                  type="button"
                  aria-label="Berechtigung entziehen"
                  onClick={() => onRevoke(collab.user_id)}
                  className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
                >
                  <FiTrash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
