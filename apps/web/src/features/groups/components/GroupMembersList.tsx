import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from '@gruenerator/shared/avatar';
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { HiUsers, HiShieldCheck, HiDotsVertical } from 'react-icons/hi';

import Spinner from '../../../components/common/Spinner';
import { useGroupMembers, useUpdateMemberRole } from '../hooks/useGroups';
import { getMemberDisplayName, sortMembersByName } from '../utils/anonymousNames';

interface GroupMember {
  user_id: string;
  role: string;
  avatar_robot_id?: number;
  joined_at?: string;
  first_name?: string;
}

interface GroupMembersListProps {
  groupId: string;
  isActive?: boolean;
  className?: string;
  hideHeader?: boolean;
  isCurrentUserAdmin?: boolean;
  currentUserId?: string;
  createdBy?: string;
}

const GroupMembersList = ({
  groupId,
  isActive = false,
  className = '',
  hideHeader = false,
  isCurrentUserAdmin = false,
  currentUserId,
  createdBy,
}: GroupMembersListProps) => {
  const { members, isLoadingMembers, isErrorMembers, errorMembers } = useGroupMembers(groupId, {
    isActive,
  });
  const { updateMemberRole, isUpdatingRole } = useUpdateMemberRole(groupId);

  const header = !hideHeader && (
    <div className="flex items-center justify-between py-xs">
      <h4 className="flex items-center gap-sm text-xs font-medium uppercase tracking-wide text-grey-500 m-0">
        <HiUsers className="text-base text-primary-500" />
        Gruppenmitglieder{members && members.length > 0 ? ` (${members.length})` : ''}
      </h4>
    </div>
  );

  if (isLoadingMembers) {
    return (
      <div className={className}>
        {header}
        <div className="flex flex-col items-center justify-center py-md gap-md">
          <Spinner size="small" />
          <span>Lade Mitglieder...</span>
        </div>
      </div>
    );
  }

  if (isErrorMembers) {
    return (
      <div className={className}>
        {header}
        <div className="text-sm text-red-600">
          <p>Fehler beim Laden der Mitglieder: {errorMembers?.message || 'Unbekannter Fehler'}</p>
        </div>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className={className}>
        {header}
        <div className="text-xs text-grey-500 italic">
          <p>Noch keine Mitglieder in dieser Gruppe.</p>
        </div>
      </div>
    );
  }

  const sortedMembers = sortMembersByName(members);

  return (
    <div className={className}>
      {header}

      <div className="flex flex-col gap-xs">
        {sortedMembers.map((member) => {
          const fullDisplayName = getMemberDisplayName(member);
          const isAdmin = member.role === 'admin';
          const isCreator = createdBy && String(member.user_id) === String(createdBy);
          const isSelf = currentUserId && String(member.user_id) === String(currentUserId);
          const profileImageNumber = validateRobotId(member.avatar_robot_id);
          const canChangeRole = isCurrentUserAdmin && !isSelf && !isCreator;

          return (
            <div
              key={member.user_id}
              className="flex items-center gap-sm px-sm py-xs rounded-md hover:bg-grey-50 dark:hover:bg-grey-800/50 transition-colors"
            >
              <img
                src={getRobotAvatarPath(profileImageNumber)}
                alt={getRobotAvatarAlt(profileImageNumber)}
                className="w-7 h-7 rounded-full shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground-heading truncate block">
                  {fullDisplayName}
                </span>
              </div>
              {isAdmin && (
                <Badge variant="outline" className="text-[0.65rem] shrink-0 gap-1">
                  <HiShieldCheck className="size-3 text-primary-500" />
                  Admin
                </Badge>
              )}
              {canChangeRole && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center size-6 rounded-md text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-700 transition-colors cursor-pointer"
                      disabled={isUpdatingRole}
                    >
                      <HiDotsVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isAdmin ? (
                      <DropdownMenuItem
                        onClick={() =>
                          updateMemberRole({ memberId: member.user_id, role: 'member' })
                        }
                      >
                        Admin-Rechte entfernen
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() =>
                          updateMemberRole({ memberId: member.user_id, role: 'admin' })
                        }
                      >
                        <HiShieldCheck className="size-4 text-primary-500" />
                        Zum Admin machen
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GroupMembersList;
