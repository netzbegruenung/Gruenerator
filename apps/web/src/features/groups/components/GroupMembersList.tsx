import { HiUsers, HiShieldCheck } from 'react-icons/hi';
import Spinner from '../../../components/common/Spinner';
import { useGroupMembers } from '../hooks/useGroups';
import { getMemberDisplayName, sortMembersByName } from '../utils/anonymousNames';
import { getRobotAvatarPath, validateRobotId, getRobotAvatarAlt } from '../utils/avatarUtils';

interface GroupMember {
  user_id: string;
  role: string;
  avatar_robot_id?: number;
  joined_at: string;
  first_name?: string;
  last_name?: string;
}

interface GroupMembersListProps {
  groupId: string;
  isActive?: boolean;
  className?: string;
}

const GroupMembersList = ({ groupId, isActive = false, className = '' }: GroupMembersListProps) => {
  const {
    members,
    isLoadingMembers,
    isErrorMembers,
    errorMembers
  } = useGroupMembers(groupId, { isActive });

  if (isLoadingMembers) {
    return (
      <div className={`group-members-section ${className}`}>
        <div className="group-section-header">
          <h4 className="group-section-title">
            <HiUsers className="icon" />
            Gruppenmitglieder
          </h4>
        </div>
        <div className="loading-container">
          <Spinner size="small" />
          <span>Lade Mitglieder...</span>
        </div>
      </div>
    );
  }

  if (isErrorMembers) {
    return (
      <div className={`group-members-section ${className}`}>
        <div className="group-section-header">
          <h4 className="group-section-title">
            <HiUsers className="icon" />
            Gruppenmitglieder
          </h4>
        </div>
        <div className="error-container">
          <p>Fehler beim Laden der Mitglieder: {errorMembers?.message || 'Unbekannter Fehler'}</p>
        </div>
      </div>
    );
  }

  if (!members || members.length === 0) {
    return (
      <div className={`group-members-section ${className}`}>
        <div className="group-section-header">
          <h4 className="group-section-title">
            <HiUsers className="icon" />
            Gruppenmitglieder
          </h4>
        </div>
        <div className="members-empty-state">
          <p>Noch keine Mitglieder in dieser Gruppe.</p>
        </div>
      </div>
    );
  }

  // Sort members: real names first, then anonymous names, both alphabetically
  const sortedMembers = sortMembersByName(members);

  return (
    <div className={`group-members-section ${className}`}>
      <div className="group-section-header">
        <h4 className="group-section-title">
          <HiUsers className="icon" />
          Gruppenmitglieder ({members.length})
        </h4>
      </div>

      <div className="group-members-list">
        {sortedMembers.map((member) => {
          const displayName = getMemberDisplayName(member);
          const isAdmin = member.role === 'admin';
          const isAnonymous = displayName.startsWith('Anonymer');
          const profileImageNumber = validateRobotId(member.avatar_robot_id);

          return (
            <div key={member.user_id} className="group-member-item">
              <div className="member-avatar">
                <div className={`member-avatar-circle ${isAdmin ? 'admin' : ''}`}>
                  <img
                    src={getRobotAvatarPath(profileImageNumber)}
                    alt={getRobotAvatarAlt(profileImageNumber)}
                    className="member-profile-image"
                  />
                </div>
              </div>

              <div className="member-info">
                <div className="member-name-line">
                  <span className={`member-name ${isAnonymous ? 'anonymous' : ''}`}>
                    {displayName}
                  </span>
                  {isAdmin && (
                    <span className="member-admin-badge" title="Administrator">
                      <HiShieldCheck className="admin-icon" />
                      Admin
                    </span>
                  )}
                </div>

                <div className="member-meta">
                  <span className="member-join-date">
                    Beigetreten: {new Date(member.joined_at).toLocaleDateString('de-DE', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {members.some((m: GroupMember) => getMemberDisplayName(m).startsWith('Anonymer')) && (
        <div className="members-privacy-note">
          <p>
            <small>
              Einige Mitglieder werden aus Datenschutzgründen mit anonymen Tiernamen angezeigt.
            </small>
          </p>
        </div>
      )}
    </div>
  );
};

export default GroupMembersList;
