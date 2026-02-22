import { HiUsers, HiShieldCheck } from 'react-icons/hi';

import Spinner from '../../../components/common/Spinner';
import { useGroupMembers } from '../hooks/useGroups';
import { getMemberDisplayName, sortMembersByName } from '../utils/anonymousNames';
import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from '../utils/avatarUtils';

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
}

const GroupMembersList = ({
  groupId,
  isActive = false,
  className = '',
  hideHeader = false,
}: GroupMembersListProps) => {
  const { members, isLoadingMembers, isErrorMembers, errorMembers } = useGroupMembers(groupId, {
    isActive,
  });

  if (isLoadingMembers) {
    return (
      <div className={className}>
        {!hideHeader && (
          <div className="flex items-center justify-between py-xs">
            <h4 className="flex items-center gap-sm text-xs font-medium uppercase tracking-wide text-grey-500 m-0">
              <HiUsers className="text-base text-primary-500" />
              Gruppenmitglieder
            </h4>
          </div>
        )}
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
        {!hideHeader && (
          <div className="flex items-center justify-between py-xs">
            <h4 className="flex items-center gap-sm text-xs font-medium uppercase tracking-wide text-grey-500 m-0">
              <HiUsers className="text-base text-primary-500" />
              Gruppenmitglieder
            </h4>
          </div>
        )}
        <div className="text-sm text-red-600">
          <p>Fehler beim Laden der Mitglieder: {errorMembers?.message || 'Unbekannter Fehler'}</p>
        </div>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className={className}>
        {!hideHeader && (
          <div className="flex items-center justify-between py-xs">
            <h4 className="flex items-center gap-sm text-xs font-medium uppercase tracking-wide text-grey-500 m-0">
              <HiUsers className="text-base text-primary-500" />
              Gruppenmitglieder
            </h4>
          </div>
        )}
        <div className="text-xs text-grey-500 italic">
          <p>Noch keine Mitglieder in dieser Gruppe.</p>
        </div>
      </div>
    );
  }

  const sortedMembers = sortMembersByName(members);

  return (
    <div className={className}>
      {!hideHeader && (
        <div className="flex items-center justify-between py-xs">
          <h4 className="flex items-center gap-sm text-xs font-medium uppercase tracking-wide text-grey-500 m-0">
            <HiUsers className="text-base text-primary-500" />
            Gruppenmitglieder ({members.length})
          </h4>
        </div>
      )}

      <div className="flex flex-wrap gap-xs">
        {sortedMembers.map((member) => {
          const fullDisplayName = getMemberDisplayName(member);
          const firstName = fullDisplayName.split(' ')[0];
          const isAdmin = member.role === 'admin';
          const profileImageNumber = validateRobotId(member.avatar_robot_id);

          return (
            <div
              key={member.user_id}
              className="flex items-center gap-xxs px-xs py-xxs rounded-sm bg-grey-100 dark:bg-grey-800"
              title={isAdmin ? `${firstName} (Admin)` : firstName}
            >
              <img
                src={getRobotAvatarPath(profileImageNumber)}
                alt={getRobotAvatarAlt(profileImageNumber)}
                className="w-5 h-5 rounded-full"
              />
              <span className="text-xs">{firstName}</span>
              {isAdmin && <HiShieldCheck className="text-xs text-primary-500" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GroupMembersList;
