import { type GroupContentType } from '@gruenerator/contracts';
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineBell,
  HiOutlineLink,
  HiOutlineLogout,
  HiOutlineMail,
  HiOutlinePhotograph,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiOutlineGlobeAlt,
  HiPencil,
  HiCheck,
  HiX,
} from 'react-icons/hi';
import { HiOutlineBellSlash } from 'react-icons/hi2';
import { PiPlus } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { RobotAvatar } from '../../../components/common/RobotAvatar';
import { resolveApiAssetUrl } from '../../../utils/platform';
import { type GroupAudience } from '../hooks/useGroupRequests';
import {
  useCloneCanvasTemplate,
  useGroupMembers,
  useInviteToGroup,
  useLeaveGroup,
  useSetGroupMute,
  getGroupInitials,
  type GroupLink,
} from '../hooks/useGroups';

import AddContentToGroupModal from './AddContentToGroupModal';
import { GroupContentArea } from './feed/GroupContentArea';
import GroupJoinRequestsSection from './GroupJoinRequestsSection';
import GroupLinksSection from './GroupLinksSection';
import GroupMembersList from './GroupMembersList';
import GroupVisibilityDialog from './GroupVisibilityDialog';
import { SpaceChatsSection } from './SpaceChatsSection';

export interface GroupInfo {
  id?: string;
  name?: string;
  description?: string;
  created_by?: string;
  avatar_url?: string | null;
  links?: GroupLink[];
  is_public?: boolean;
  audience?: GroupAudience;
  group_type?: 'standard' | 'personal';
  is_system?: boolean;
}

export interface GroupData {
  isAdmin?: boolean;
  membership?: {
    role?: string;
    notifications_muted?: boolean | null;
  };
  groupInfo?: GroupInfo;
  joinToken?: string;
  [key: string]: unknown;
}

interface GroupInfoSectionProps {
  data: GroupData | undefined;
  groupId: string;
  isEditingName: boolean;
  editedGroupName: string;
  setEditedGroupName: (name: string) => void;
  isEditingDescription: boolean;
  editedGroupDescription: string;
  setEditedGroupDescription: (description: string) => void;
  isUpdatingGroupName: boolean;
  isDeletingGroup: boolean;
  joinLinkCopied: boolean;
  getJoinUrl: () => string;
  copyJoinLink: () => void;
  startEditingName: () => void;
  cancelEditingName: () => void;
  saveGroupName: () => void;
  startEditingDescription: () => void;
  cancelEditingDescription: () => void;
  saveGroupDescription: () => void;
  confirmDeleteGroup: () => void;
  onlineUserIds?: Set<string>;
  feedItems: GroupFeedItem[];
  isLoadingSharedContent: boolean;
  onUnshareContent?: (contentId: string, contentType: string) => void;
  refetchSharedContent?: () => void;
  currentUserId?: string;
  currentUserName?: string | null;
  onUploadAvatar?: (file: File) => void;
  onDeleteAvatar?: () => void;
  isUploadingAvatar?: boolean;
  onAddLink?: (link: Omit<GroupLink, 'id'>) => void;
  onUpdateLink?: (data: Omit<GroupLink, 'id'> & { linkId: string }) => void;
  onDeleteLink?: (linkId: string) => void;
  isAddingLink?: boolean;
  isUpdatingLink?: boolean;
  onSuccessMessage?: (msg: string) => void;
  onErrorMessage?: (msg: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GroupInfoSection = memo(
  ({
    data,
    groupId,
    isEditingName,
    editedGroupName,
    setEditedGroupName,
    isEditingDescription,
    editedGroupDescription,
    setEditedGroupDescription,
    isUpdatingGroupName,
    isDeletingGroup,
    joinLinkCopied,
    getJoinUrl,
    copyJoinLink,
    startEditingName,
    cancelEditingName,
    saveGroupName,
    startEditingDescription,
    cancelEditingDescription,
    saveGroupDescription,
    confirmDeleteGroup,
    onlineUserIds,
    feedItems,
    isLoadingSharedContent,
    onUnshareContent,
    refetchSharedContent,
    currentUserId,
    currentUserName,
    onUploadAvatar,
    onDeleteAvatar,
    isUploadingAvatar,
    onAddLink,
    onUpdateLink,
    onDeleteLink,
    isAddingLink,
    isUpdatingLink,
    onSuccessMessage,
    onErrorMessage,
  }: GroupInfoSectionProps) => {
    const navigate = useNavigate();
    const { members, isLoadingMembers } = useGroupMembers(groupId, { isActive: true });
    const [membersDialogOpen, setMembersDialogOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const [showVisibilityDialog, setShowVisibilityDialog] = useState(false);
    const cloneTemplate = useCloneCanvasTemplate();

    // Invite-by-email dialog (team Gruppen only).
    const inviteToGroup = useInviteToGroup();
    const [showInviteDialog, setShowInviteDialog] = useState(false);
    const [inviteEmails, setInviteEmails] = useState<string[]>([]);
    const [inviteDraft, setInviteDraft] = useState('');
    const [inviteError, setInviteError] = useState('');
    const addInviteEmail = useCallback(() => {
      const value = inviteDraft.trim().toLowerCase();
      if (!value) return;
      if (!EMAIL_RE.test(value)) {
        setInviteError('Ungültige E-Mail-Adresse.');
        return;
      }
      setInviteEmails((prev) => (prev.includes(value) ? prev : [...prev, value]));
      setInviteDraft('');
      setInviteError('');
    }, [inviteDraft]);
    const openInviteDialog = useCallback(() => {
      setInviteEmails([]);
      setInviteDraft('');
      setInviteError('');
      setShowInviteDialog(true);
    }, []);
    const submitInvites = useCallback(() => {
      const pending = inviteDraft.trim().toLowerCase();
      const emails =
        pending && EMAIL_RE.test(pending) && !inviteEmails.includes(pending)
          ? [...inviteEmails, pending]
          : inviteEmails;
      if (emails.length === 0) return;
      inviteToGroup.mutate(
        { groupId, emails },
        {
          onSuccess: (res) => {
            setShowInviteDialog(false);
            onSuccessMessage?.(
              `${res.sent} Einladung${res.sent === 1 ? '' : 'en'} versendet.` +
                (res.failed.length ? ` ${res.failed.length} fehlgeschlagen.` : '')
            );
          },
          onError: (err) =>
            onErrorMessage?.(
              (err as Error)?.message || 'Einladungen konnten nicht versendet werden.'
            ),
        }
      );
    }, [inviteDraft, inviteEmails, inviteToGroup, groupId, onSuccessMessage, onErrorMessage]);

    const isMuted = data?.membership?.notifications_muted ?? false;
    const setGroupMute = useSetGroupMute(groupId);
    const handleToggleMute = useCallback(() => {
      if (setGroupMute.isPending) return;
      const next = !isMuted;
      setGroupMute.mutate(next, {
        onSuccess: () =>
          onSuccessMessage?.(
            next ? 'Benachrichtigungen stummgeschaltet.' : 'Benachrichtigungen wieder aktiviert.'
          ),
        onError: (err: Error) =>
          onErrorMessage?.('Fehler beim Aktualisieren der Benachrichtigungen: ' + err.message),
      });
    }, [setGroupMute, isMuted, onSuccessMessage, onErrorMessage]);

    const handleCloneTemplate = useCallback(
      (templateId: string) => {
        if (cloneTemplate.isPending) return;
        cloneTemplate.mutate(templateId, {
          onSuccess: ({ newCanvasId }) => {
            if (newCanvasId) void navigate(`/studio/canvas/${newCanvasId}`);
          },
          onError: (err) => {
            console.error('[GroupInfoSection] Failed to clone Vorlage:', err);
          },
        });
      },
      [cloneTemplate, navigate]
    );
    const [showAddContent, setShowAddContent] = useState(false);
    const [shareInitialNote, setShareInitialNote] = useState('');
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const [avatarTimestamp, setAvatarTimestamp] = useState(Date.now());

    const handleAvatarFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onUploadAvatar) {
          onUploadAvatar(file);
          setAvatarTimestamp(Date.now());
        }
        if (avatarInputRef.current) avatarInputRef.current.value = '';
      },
      [onUploadAvatar]
    );

    const onlineMembers = useMemo(
      () =>
        members?.filter(
          (m) => onlineUserIds?.has(m.user_id) || String(m.user_id) === String(currentUserId)
        ) ?? [],
      [members, onlineUserIds, currentUserId]
    );
    const onlineCount = onlineMembers.length;
    const memberCount = members?.length ?? 0;
    // Personal Space: a solo workspace — hide team collaboration chrome
    // (invite link, visibility, join requests).
    const isPersonal = data?.groupInfo?.group_type === 'personal';
    // System group: every user is a member, no member info, only instance
    // admins (`isAdmin` there) share. Hides all team chrome, like personal.
    const isSystem = data?.groupInfo?.is_system === true;
    const isTeam = !isPersonal && !isSystem;
    const canShare = !isSystem || !!data?.isAdmin;
    const groupLinks = data?.groupInfo?.links ?? [];

    // Leaving is a member action, not an admin one: everybody except the
    // creator can leave (the backend rejects the creator — they must delete).
    const createdBy = data?.groupInfo?.created_by;
    const canLeave =
      isTeam && !!currentUserId && !!createdBy && String(createdBy) !== String(currentUserId);
    const leaveGroup = useLeaveGroup();
    const handleLeaveGroup = useCallback(() => {
      setShowLeaveConfirm(false);
      leaveGroup.mutate(groupId, {
        onSuccess: () => {
          onSuccessMessage?.('Gruppe verlassen.');
          void navigate('/');
        },
        onError: (err: Error) =>
          onErrorMessage?.(err.message || 'Gruppe konnte nicht verlassen werden.'),
      });
    }, [leaveGroup, groupId, navigate, onSuccessMessage, onErrorMessage]);

    const handleSaveBoth = useCallback(() => {
      saveGroupName();
      saveGroupDescription();
    }, [saveGroupName, saveGroupDescription]);

    const handleCancelBoth = useCallback(() => {
      cancelEditingName();
      cancelEditingDescription();
    }, [cancelEditingName, cancelEditingDescription]);

    const handleStartEditingBoth = useCallback(() => {
      startEditingName();
      startEditingDescription();
    }, [startEditingName, startEditingDescription]);

    const handleGroupNameChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditedGroupName(e.target.value);
      },
      [setEditedGroupName]
    );

    const handleGroupDescriptionChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditedGroupDescription(e.target.value);
      },
      [setEditedGroupDescription]
    );

    const handleTextareaAutoResize = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      target.style.height = 'auto';
      target.style.height = target.scrollHeight + 2 + 'px';
    }, []);

    const handleShareContent = useCallback(
      async (
        contentType: string,
        itemId: string | number,
        options: {
          permissions: { read: boolean; write: boolean; collaborative: boolean };
          targetGroupId: string;
          note: string | null;
        }
      ) => {
        const res = await getContractsClient().groups.shareContent({
          params: { groupId: options.targetGroupId },
          body: {
            contentType: contentType as GroupContentType,
            contentId: String(itemId),
            permissions: options.permissions,
            note: options.note,
          },
        });
        if (res.status !== 200)
          throw apiErrorFromResponse(res, 'Inhalt konnte nicht geteilt werden.');
      },
      []
    );

    return (
      <>
        <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
          <div className="flex min-w-0 flex-1 items-center gap-md">
            <div className="relative group/avatar shrink-0">
              {data?.groupInfo?.avatar_url ? (
                <img
                  src={resolveApiAssetUrl(
                    `/api/auth/groups/${groupId}/avatar?t=${avatarTimestamp}`
                  )}
                  alt={data?.groupInfo?.name || 'Projekt'}
                  className="size-16 max-sm:size-12 rounded-full object-cover ring-2 ring-grey-200 dark:ring-grey-700"
                />
              ) : (
                <div className="size-16 max-sm:size-12 rounded-full bg-primary-100 dark:bg-primary-900/30 ring-2 ring-grey-200 dark:ring-grey-700 flex items-center justify-center">
                  <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
                    {getGroupInitials(data?.groupInfo?.name)}
                  </span>
                </div>
              )}
              {data?.isAdmin && onUploadAvatar && (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover/avatar:bg-black/40 group-focus-within/avatar:bg-black/40 transition-colors cursor-pointer border-none"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  aria-label="Bild ändern"
                >
                  <HiOutlinePhotograph className="size-5 text-white opacity-0 group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100 transition-opacity" />
                </button>
              )}
              {isUploadingAvatar && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarFileChange}
            />

            {isEditingName ? (
              <div className="flex flex-col gap-sm flex-1 min-w-0">
                <input
                  type="text"
                  value={editedGroupName}
                  onChange={handleGroupNameChange}
                  className="w-full rounded-md border-2 border-primary-500 bg-background px-sm py-xs text-2xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="Name"
                  maxLength={100}
                  autoFocus
                  aria-label="Name bearbeiten"
                />
                <textarea
                  value={editedGroupDescription}
                  onChange={handleGroupDescriptionChange}
                  className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="Beschreibung (optional)..."
                  maxLength={500}
                  disabled={isUpdatingGroupName}
                  style={{ minHeight: 'auto' }}
                  onInput={handleTextareaAutoResize}
                />
                {editedGroupDescription.length >= 450 && (
                  <div className="text-xs text-foreground">
                    {editedGroupDescription.length}/500 Zeichen
                  </div>
                )}
                <div className="flex gap-xs">
                  <Button
                    variant="default"
                    size="icon-xs"
                    onClick={handleSaveBoth}
                    disabled={!editedGroupName.trim() || isUpdatingGroupName}
                    title="Speichern"
                  >
                    <HiCheck />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-xs"
                    onClick={handleCancelBoth}
                    disabled={isUpdatingGroupName}
                    title="Abbrechen"
                  >
                    <HiX />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-center min-w-0">
                <div className="flex items-center gap-sm">
                  <h1 className="text-3xl max-md:text-xl font-semibold text-foreground-heading m-0 truncate">
                    {data?.groupInfo?.name}
                  </h1>
                  {data?.isAdmin && <Badge variant="default">Admin</Badge>}
                </div>
                <p className="text-[15px] text-muted-foreground mt-xs m-0">
                  {isPersonal
                    ? data?.groupInfo?.description || 'Dein persönliches Projekt.'
                    : isSystem
                      ? 'Für alle im Grünerator'
                      : `Gruppe · ${memberCount} ${memberCount === 1 ? 'Mitglied' : 'Mitglieder'}`}
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            {isTeam && !isLoadingMembers && onlineCount > 0 && (
              <span
                className="hidden sm:inline-flex items-center -space-x-1.5"
                aria-label={`${onlineCount} online`}
              >
                {onlineMembers.slice(0, 5).map((member) => (
                  <RobotAvatar
                    key={member.user_id}
                    robotId={member.avatar_robot_id}
                    sizePx={28}
                    className="size-7 ring-2 ring-background"
                    alt=""
                  />
                ))}
                {onlineCount > 5 && (
                  <span className="flex items-center justify-center size-7 rounded-full ring-2 ring-background bg-grey-200 dark:bg-grey-700 text-[0.6rem] font-semibold text-grey-600 dark:text-grey-300">
                    +{onlineCount - 5}
                  </span>
                )}
              </span>
            )}
            {canShare && (
              <Button
                variant="brand"
                onClick={() => {
                  setShareInitialNote('');
                  setShowAddContent(true);
                }}
                className="max-sm:size-9 max-sm:rounded-full max-sm:p-0"
              >
                <PiPlus aria-hidden />
                <span className="max-sm:sr-only">Inhalte teilen</span>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  aria-label={isPersonal ? 'Projektoptionen' : 'Gruppenoptionen'}
                >
                  <HiDotsVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isTeam && (
                  <>
                    <DropdownMenuItem onClick={() => setMembersDialogOpen(true)}>
                      <HiOutlineUserGroup className="size-4 mr-xs" />
                      Mitglieder ({memberCount})
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={handleToggleMute} disabled={setGroupMute.isPending}>
                  {isMuted ? (
                    <>
                      <HiOutlineBell className="size-4 mr-xs" />
                      Stummschaltung aufheben
                    </>
                  ) : (
                    <>
                      <HiOutlineBellSlash className="size-4 mr-xs" />
                      Benachrichtigungen stummschalten
                    </>
                  )}
                </DropdownMenuItem>
                {data?.isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleStartEditingBoth}
                      disabled={isUpdatingGroupName}
                    >
                      <HiPencil className="size-4 mr-xs" />
                      Bearbeiten
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                    >
                      <HiOutlinePhotograph className="size-4 mr-xs" />
                      Bild ändern
                    </DropdownMenuItem>
                    {data?.groupInfo?.avatar_url && onDeleteAvatar && (
                      <DropdownMenuItem onClick={onDeleteAvatar} disabled={isUploadingAvatar}>
                        <HiOutlineTrash className="size-4 mr-xs" />
                        Bild entfernen
                      </DropdownMenuItem>
                    )}
                    {isTeam && (
                      <DropdownMenuItem onClick={openInviteDialog}>
                        <HiOutlineMail className="size-4 mr-xs" />
                        Per E-Mail einladen
                      </DropdownMenuItem>
                    )}
                    {isTeam && data?.joinToken && (
                      <DropdownMenuItem onClick={copyJoinLink}>
                        <HiOutlineLink className="size-4 mr-xs" />
                        {joinLinkCopied ? 'Kopiert!' : 'Einladungslink kopieren'}
                      </DropdownMenuItem>
                    )}
                    {isTeam && (
                      <DropdownMenuItem onClick={() => setShowVisibilityDialog(true)}>
                        <HiOutlineGlobeAlt className="size-4 mr-xs" />
                        {data?.groupInfo?.is_public
                          ? 'Öffentlich (verwalten)'
                          : 'Öffentlich machen'}
                      </DropdownMenuItem>
                    )}
                    {!isSystem && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setShowDeleteConfirm(true)}
                          disabled={isDeletingGroup || isUpdatingGroupName}
                          className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                        >
                          <HiOutlineTrash className="size-4 mr-xs" />
                          {isPersonal ? 'Projekt löschen' : 'Gruppe löschen'}
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
                {canLeave && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowLeaveConfirm(true)}
                      disabled={leaveGroup.isPending}
                      className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                    >
                      <HiOutlineLogout className="size-4 mr-xs" />
                      Gruppe verlassen
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {isTeam && data?.isAdmin && (
          <GroupJoinRequestsSection
            groupId={groupId}
            isAdmin={!!data?.isAdmin}
            onSuccessMessage={onSuccessMessage ?? (() => {})}
            onErrorMessage={onErrorMessage ?? (() => {})}
          />
        )}

        <GroupContentArea
          groupId={groupId}
          groupName={data?.groupInfo?.name ?? ''}
          items={feedItems}
          isLoading={isLoadingSharedContent}
          isAdmin={!!data?.isAdmin}
          isPersonal={isPersonal}
          isSystem={isSystem}
          currentUserId={currentUserId ?? null}
          currentUserName={currentUserName ?? null}
          members={members ?? []}
          description={data?.groupInfo?.description ?? null}
          linkCount={groupLinks.length}
          onShowMembers={() => setMembersDialogOpen(true)}
          onOpenShare={
            canShare
              ? (note) => {
                  setShareInitialNote(note ?? '');
                  setShowAddContent(true);
                }
              : null
          }
          onRemove={
            data?.isAdmin && onUnshareContent
              ? (item) => onUnshareContent(item.id, item.contentType)
              : null
          }
          onUseTemplate={handleCloneTemplate}
          cloningId={cloneTemplate.isPending ? (cloneTemplate.variables ?? null) : null}
          extraAllSections={
            <>
              {onUpdateLink && onDeleteLink && groupLinks.length > 0 && (
                <div id="abschnitt-links" className="scroll-mt-lg">
                  <GroupLinksSection
                    links={groupLinks}
                    isAdmin={!!data?.isAdmin}
                    onUpdateLink={onUpdateLink}
                    onDeleteLink={onDeleteLink}
                    isUpdatingLink={!!isUpdatingLink}
                  />
                </div>
              )}
              <SpaceChatsSection groupId={groupId} />
            </>
          }
        />

        <AddContentToGroupModal
          isOpen={showAddContent}
          onClose={() => setShowAddContent(false)}
          groupId={groupId}
          initialNote={shareInitialNote}
          onShareContent={handleShareContent}
          onSuccess={() => {
            setShowAddContent(false);
            refetchSharedContent?.();
          }}
          {...(data?.isAdmin && { onAddLink })}
          isAddingLink={isAddingLink}
        />

        {isTeam && data?.isAdmin && (
          <GroupVisibilityDialog
            groupId={groupId}
            isOpen={showVisibilityDialog}
            onClose={() => setShowVisibilityDialog(false)}
            currentIsPublic={data?.groupInfo?.is_public ?? false}
            currentAudience={(data?.groupInfo?.audience as GroupAudience) ?? 'all'}
            onSuccessMessage={onSuccessMessage ?? (() => {})}
            onErrorMessage={onErrorMessage ?? (() => {})}
          />
        )}

        {!isPersonal && (
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogContent className="sm:max-w-[28rem]">
              <DialogHeader>
                <DialogTitle>Per E-Mail einladen</DialogTitle>
                <DialogDescription>
                  Eingeladene erhalten eine E-Mail mit einem Beitrittslink zu dieser Gruppe.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-xs">
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500">
                  {inviteEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => setInviteEmails((prev) => prev.filter((e) => e !== email))}
                        aria-label={`${email} entfernen`}
                        className="rounded-full p-0.5 hover:bg-primary-500/20"
                      >
                        <HiX className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="email"
                    value={inviteDraft}
                    onChange={(e) => {
                      setInviteDraft(e.target.value);
                      if (inviteError) setInviteError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addInviteEmail();
                      }
                    }}
                    onBlur={addInviteEmail}
                    className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm focus:outline-none"
                    placeholder={inviteEmails.length === 0 ? 'name@beispiel.de' : ''}
                  />
                </div>
                {inviteError ? (
                  <span className="text-xs text-red-600 dark:text-red-400">{inviteError}</span>
                ) : (
                  <span className="text-xs text-grey-500">Mit Enter oder Komma hinzufügen.</span>
                )}
              </div>
              <DialogFooter className="gap-xs">
                <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={submitInvites}
                  disabled={
                    inviteToGroup.isPending || (inviteEmails.length === 0 && !inviteDraft.trim())
                  }
                >
                  {inviteToGroup.isPending ? 'Wird gesendet...' : 'Einladen'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-[24rem]">
            <DialogHeader>
              <DialogTitle>{isPersonal ? 'Projekt löschen' : 'Gruppe löschen'}</DialogTitle>
              <DialogDescription>
                {isPersonal
                  ? 'Dieses Projekt wird unwiderruflich gelöscht. Alle Inhalte werden permanent entfernt.'
                  : 'Diese Gruppe wird für alle Mitglieder unwiderruflich gelöscht. Alle Inhalte und Mitgliedschaften werden permanent entfernt.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-xs">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  confirmDeleteGroup();
                }}
                disabled={isDeletingGroup}
              >
                Endgültig löschen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
          <DialogContent className="sm:max-w-[24rem]">
            <DialogHeader>
              <DialogTitle>Gruppe verlassen</DialogTitle>
              <DialogDescription>
                Du verlierst den Zugriff auf alle Inhalte dieser Gruppe. Die Gruppe selbst und deine
                eigenen Inhalte bleiben bestehen. Ein erneuter Beitritt ist nur über eine neue
                Einladung möglich.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-xs">
              <Button variant="outline" onClick={() => setShowLeaveConfirm(false)}>
                Abbrechen
              </Button>
              <Button
                variant="destructive"
                onClick={handleLeaveGroup}
                disabled={leaveGroup.isPending}
              >
                Verlassen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={membersDialogOpen} onOpenChange={setMembersDialogOpen}>
          <DialogContent className="max-w-md p-md">
            <DialogHeader>
              <DialogTitle>Mitglieder ({memberCount})</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
              <GroupMembersList
                groupId={groupId}
                isActive={membersDialogOpen}
                hideHeader
                isCurrentUserAdmin={data?.isAdmin}
                currentUserId={currentUserId}
                createdBy={data?.groupInfo?.created_by}
                onlineUserIds={onlineUserIds}
              />
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }
);

GroupInfoSection.displayName = 'GroupInfoSection';

export default GroupInfoSection;
