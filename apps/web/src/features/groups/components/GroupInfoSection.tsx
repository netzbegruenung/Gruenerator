import { getRobotAvatarPath, validateRobotId } from '@gruenerator/shared/avatar';
import {
  Badge,
  Button,
  CardGrid,
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
  LoadingSection,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SectionHeader,
} from '@gruenerator/ui';
import { memo, useCallback, useRef, useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineDocumentText,
  HiOutlineLink,
  HiOutlinePhotograph,
  HiOutlineTrash,
  HiPencil,
  HiCheck,
  HiX,
} from 'react-icons/hi';
import { PiSquaresFour } from 'react-icons/pi';

import apiClient from '../../../components/utils/apiClient';
import { useGroupMembers, getGroupInitials, type GroupLink } from '../hooks/useGroups';

import AddContentToGroupModal from './AddContentToGroupModal';
import GroupLinksSection from './GroupLinksSection';
import GroupMembersList from './GroupMembersList';

export interface GroupInfo {
  id?: string;
  name?: string;
  description?: string;
  created_by?: string;
  avatar_url?: string | null;
  links?: GroupLink[];
}

export interface GroupData {
  isAdmin?: boolean;
  membership?: {
    role?: string;
  };
  groupInfo?: GroupInfo;
  joinToken?: string;
  [key: string]: unknown;
}

export interface SharedItem {
  id: string | number;
  title?: string;
  name?: string;
  slug?: string;
  document_subtype?: string;
  shared_at?: string;
  shared_by_name?: string;
  contentType?: string;
}

export interface SharedContent {
  collabDocs: SharedItem[];
  boards: SharedItem[];
  documents: SharedItem[];
  generators: SharedItem[];
  notebooks: SharedItem[];
  texts: SharedItem[];
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
  sharedContent: SharedContent;
  isLoadingSharedContent: boolean;
  onUnshareContent?: (contentId: string, contentType: string) => void;
  refetchSharedContent?: () => void;
  currentUserId?: string;
  onUploadAvatar?: (file: File) => void;
  onDeleteAvatar?: () => void;
  isUploadingAvatar?: boolean;
  onAddLink?: (link: Omit<GroupLink, 'id'>) => void;
  onUpdateLink?: (data: Omit<GroupLink, 'id'> & { linkId: string }) => void;
  onDeleteLink?: (linkId: string) => void;
  isAddingLink?: boolean;
  isUpdatingLink?: boolean;
}

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
    sharedContent,
    isLoadingSharedContent,
    onUnshareContent,
    refetchSharedContent,
    currentUserId,
    onUploadAvatar,
    onDeleteAvatar,
    isUploadingAvatar,
    onAddLink,
    onUpdateLink,
    onDeleteLink,
    isAddingLink,
    isUpdatingLink,
  }: GroupInfoSectionProps) => {
    const { members, isLoadingMembers } = useGroupMembers(groupId, { isActive: true });
    const [membersPopoverOpen, setMembersPopoverOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAddContent, setShowAddContent] = useState(false);
    const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    const handleMembersMouseEnter = useCallback(() => {
      if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
      setMembersPopoverOpen(true);
    }, []);

    const handleMembersMouseLeave = useCallback(() => {
      popoverTimeoutRef.current = setTimeout(() => setMembersPopoverOpen(false), 200);
    }, []);

    const memberCount = members?.length ?? 0;

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
        }
      ) => {
        await apiClient.post(`/auth/groups/${options.targetGroupId}/share`, {
          contentType,
          contentId: itemId,
          permissions: options.permissions,
        });
      },
      []
    );

    return (
      <>
        <div className="relative mb-xl">
          <div className="absolute right-0 top-0 flex items-center gap-sm">
            <Popover open={membersPopoverOpen} onOpenChange={setMembersPopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  className="inline-flex items-center -space-x-1.5 cursor-pointer"
                  onMouseEnter={handleMembersMouseEnter}
                  onMouseLeave={handleMembersMouseLeave}
                >
                  {isLoadingMembers ? (
                    <span className="text-xs text-foreground">…</span>
                  ) : (
                    <>
                      {members
                        ?.slice(0, 5)
                        .map((member: { user_id: string; avatar_robot_id?: number }) => (
                          <span key={member.user_id} className="relative">
                            <img
                              src={getRobotAvatarPath(validateRobotId(member.avatar_robot_id))}
                              alt=""
                              className="size-7 rounded-full ring-2 ring-background"
                            />
                            {onlineUserIds?.has(member.user_id) && (
                              <span className="absolute bottom-0 right-0 size-2 rounded-full bg-green-500 ring-1 ring-background" />
                            )}
                          </span>
                        ))}
                      {memberCount > 5 && (
                        <span className="flex items-center justify-center size-7 rounded-full ring-2 ring-background bg-grey-200 dark:bg-grey-700 text-[0.6rem] font-semibold text-grey-600 dark:text-grey-300">
                          +{memberCount - 5}
                        </span>
                      )}
                    </>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-80 p-sm"
                onMouseEnter={handleMembersMouseEnter}
                onMouseLeave={handleMembersMouseLeave}
              >
                <GroupMembersList
                  groupId={groupId}
                  isActive
                  isCurrentUserAdmin={data?.isAdmin}
                  currentUserId={currentUserId}
                  createdBy={data?.groupInfo?.created_by}
                />
              </PopoverContent>
            </Popover>
            {data?.isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Gruppenaktionen">
                    <HiDotsVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleStartEditingBoth} disabled={isUpdatingGroupName}>
                    <HiPencil className="size-4 mr-xs" />
                    Bearbeiten
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                  >
                    <HiOutlinePhotograph className="size-4 mr-xs" />
                    Gruppenbild ändern
                  </DropdownMenuItem>
                  {data?.groupInfo?.avatar_url && onDeleteAvatar && (
                    <DropdownMenuItem onClick={onDeleteAvatar} disabled={isUploadingAvatar}>
                      <HiOutlineTrash className="size-4 mr-xs" />
                      Gruppenbild entfernen
                    </DropdownMenuItem>
                  )}
                  {data?.joinToken && (
                    <DropdownMenuItem onClick={copyJoinLink}>
                      <HiOutlineLink className="size-4 mr-xs" />
                      {joinLinkCopied ? 'Kopiert!' : 'Einladungslink kopieren'}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeletingGroup || isUpdatingGroupName}
                    className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                  >
                    <HiOutlineTrash className="size-4 mr-xs" />
                    Gruppe löschen
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <div className="flex items-start gap-md">
            <div className="relative group/avatar shrink-0">
              {data?.groupInfo?.avatar_url ? (
                <img
                  src={`/api/auth/groups/${groupId}/avatar?t=${avatarTimestamp}`}
                  alt={data?.groupInfo?.name || 'Gruppe'}
                  className="size-16 rounded-full object-cover ring-2 ring-grey-200 dark:ring-grey-700"
                />
              ) : (
                <div className="size-16 rounded-full bg-primary-100 dark:bg-primary-900/30 ring-2 ring-grey-200 dark:ring-grey-700 flex items-center justify-center">
                  <span className="text-xl font-bold text-primary-600 dark:text-primary-400">
                    {getGroupInitials(data?.groupInfo?.name)}
                  </span>
                </div>
              )}
              {data?.isAdmin && onUploadAvatar && (
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 group-hover/avatar:bg-black/40 transition-colors cursor-pointer border-none"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  aria-label="Gruppenbild ändern"
                >
                  <HiOutlinePhotograph className="size-5 text-white opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
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
                  placeholder="Gruppenname"
                  maxLength={100}
                  autoFocus
                  aria-label="Gruppenname bearbeiten"
                />
                <textarea
                  value={editedGroupDescription}
                  onChange={handleGroupDescriptionChange}
                  className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm resize-none overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  placeholder="Beschreibung der Gruppe (optional)..."
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
                <p className="text-sm text-foreground mt-xs m-0">
                  {data?.groupInfo?.description ||
                    (data?.isAdmin
                      ? 'Verwalte Mitglieder und geteilte Inhalte.'
                      : 'Du bist Mitglied dieser Gruppe.')}
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <SectionHeader
            title="Geteilte Inhalte"
            {...(data?.isAdmin && { onCreate: () => setShowAddContent(true) })}
            createLabel="Inhalte hinzufügen"
          />
          {(() => {
            const sections: {
              label: string;
              items: SharedItem[];
              contentType: string;
              icon: typeof HiOutlineDocumentText;
              getLink?: (item: SharedItem) => string;
            }[] = [
              {
                label: 'Docs',
                items: sharedContent.collabDocs,
                contentType: 'collaborative_documents',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/docs/${item.id}`,
              },
              {
                label: 'Boards',
                items: sharedContent.boards,
                contentType: 'collaborative_documents',
                icon: PiSquaresFour,
                getLink: (item) => `/boards/${item.id}`,
              },
              {
                label: 'Grüneratoren',
                items: sharedContent.generators,
                contentType: 'custom_generators',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/gruenerator/${item.slug || item.id}`,
              },
              {
                label: 'Notebooks',
                items: sharedContent.notebooks,
                contentType: 'notebook_collections',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/notebook/${item.id}`,
              },
              {
                label: 'Dokumente',
                items: sharedContent.documents,
                contentType: 'documents',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/documents/${item.id}`,
              },
              {
                label: 'Texte',
                items: sharedContent.texts,
                contentType: 'user_documents',
                icon: HiOutlineDocumentText,
              },
            ];
            const groupLinks = data?.groupInfo?.links || [];
            const totalItems =
              sections.reduce((sum, s) => sum + s.items.length, 0) + groupLinks.length;

            if (isLoadingSharedContent) {
              return <LoadingSection label="Geteilte Inhalte werden geladen..." />;
            }

            if (totalItems === 0) {
              return (
                <div className="flex items-center justify-center py-2xl text-center">
                  <p className="text-sm text-grey-500">
                    Noch keine geteilten Inhalte in dieser Gruppe.
                  </p>
                </div>
              );
            }

            return (
              <div className="flex flex-col gap-lg">
                {onUpdateLink && onDeleteLink && groupLinks.length > 0 && (
                  <GroupLinksSection
                    links={groupLinks}
                    isAdmin={!!data?.isAdmin}
                    onUpdateLink={onUpdateLink}
                    onDeleteLink={onDeleteLink}
                    isUpdatingLink={!!isUpdatingLink}
                  />
                )}
                {sections.map((section) => {
                  if (section.items.length === 0) return null;
                  const ContentIcon = section.icon;
                  return (
                    <div key={section.label}>
                      <SectionHeader size="sm" title={section.label} />
                      <CardGrid columns="3">
                        {section.items.map((item) => {
                          const title = item.title || item.name || 'Ohne Titel';
                          const href = section.getLink?.(item);
                          const content = (
                            <>
                              <ContentIcon className="size-5 text-primary-600 dark:text-primary-400 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground truncate m-0">
                                  {title}
                                </p>
                                {item.shared_by_name && (
                                  <p className="text-xs text-grey-500 truncate mt-xxs m-0">
                                    Geteilt von {item.shared_by_name}
                                  </p>
                                )}
                              </div>
                            </>
                          );
                          return (
                            <div
                              key={item.id}
                              className="group flex items-center gap-sm rounded-md border border-grey-200 dark:border-grey-700 bg-background p-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
                            >
                              {href ? (
                                <a
                                  href={href}
                                  className="flex items-center gap-sm min-w-0 flex-1 no-underline"
                                >
                                  {content}
                                </a>
                              ) : (
                                <div className="flex items-center gap-sm min-w-0 flex-1">
                                  {content}
                                </div>
                              )}
                              {data?.isAdmin && onUnshareContent && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUnshareContent(String(item.id), section.contentType)
                                  }
                                  className="shrink-0 p-1 text-grey-400 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer rounded opacity-0 group-hover:opacity-100"
                                  aria-label="Aus Gruppe entfernen"
                                >
                                  <HiOutlineTrash size={16} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </CardGrid>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {data?.isAdmin && (
          <AddContentToGroupModal
            isOpen={showAddContent}
            onClose={() => setShowAddContent(false)}
            groupId={groupId}
            onShareContent={handleShareContent}
            onSuccess={() => {
              setShowAddContent(false);
              refetchSharedContent?.();
            }}
            onAddLink={onAddLink}
            isAddingLink={isAddingLink}
          />
        )}

        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="sm:max-w-[24rem]">
            <DialogHeader>
              <DialogTitle>Gruppe löschen</DialogTitle>
              <DialogDescription>
                Die gesamte Gruppe wird für alle Mitglieder unwiderruflich gelöscht. Alle
                Gruppeninhalte und -mitgliedschaften werden permanent entfernt.
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
      </>
    );
  }
);

GroupInfoSection.displayName = 'GroupInfoSection';

export default GroupInfoSection;
