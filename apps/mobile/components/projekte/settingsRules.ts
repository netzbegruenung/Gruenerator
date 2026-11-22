import { type MenuAction } from '@expo/ui/community/menu';

export const MAKE_ADMIN_ID = 'make-admin';
export const REMOVE_ADMIN_ID = 'remove-admin';
export const REMOVE_MEMBER_ID = 'remove-member';

type GroupKind = { group_type?: string | null; is_system?: boolean | null };

/** Team-Funktionen (Mitglieder, Einladen, Verlassen) in jedem Projekt außer dem System-Projekt (wie `isTeam` im Web). */
export function isTeamProject(group: GroupKind): boolean {
  return !group.is_system;
}

/** Rollen ändert nur, wer Admin ist — nie bei sich selbst und nie beim Ersteller (wie im Web). */
export function canChangeMemberRole(
  isCurrentUserAdmin: boolean,
  memberId: string,
  currentUserId: string | null,
  createdBy: string | null | undefined
): boolean {
  const isSelf = !!currentUserId && String(memberId) === String(currentUserId);
  const isCreator = !!createdBy && String(memberId) === String(createdBy);
  return isCurrentUserAdmin && !isSelf && !isCreator;
}

/** Verlassen darf in Team-Projekten jede*r außer dem*der Ersteller*in (der Server lehnt ihn ab). */
export function canLeaveProject(
  group: GroupKind & { created_by?: string | null },
  currentUserId: string | null
): boolean {
  return (
    isTeamProject(group) &&
    !!currentUserId &&
    !!group.created_by &&
    String(group.created_by) !== String(currentUserId)
  );
}

/** Den Einladungslink teilen Admins in jedem Projekt, solange es einen Token gibt. */
export function canShareInviteLink(
  group: GroupKind & { join_token?: string | null },
  isAdmin: boolean
): boolean {
  return isAdmin && !group.is_system && !!group.join_token;
}

export function buildMemberActions(memberRole: string): MenuAction[] {
  const roleAction: MenuAction =
    memberRole === 'admin'
      ? { id: REMOVE_ADMIN_ID, title: 'Admin-Rechte entfernen' }
      : { id: MAKE_ADMIN_ID, title: 'Zum Admin machen' };
  return [
    roleAction,
    {
      id: REMOVE_MEMBER_ID,
      title: 'Aus dem Projekt entfernen',
      attributes: { destructive: true },
    },
  ];
}
