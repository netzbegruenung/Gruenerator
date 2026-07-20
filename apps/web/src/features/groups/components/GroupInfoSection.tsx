import { type GroupContentType } from '@gruenerator/contracts';
import { getAgentSlug } from '@gruenerator/shared/agents';
import { getContractsClient } from '@gruenerator/shared/api';
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
  SectionHeader,
} from '@gruenerator/ui';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineBell,
  HiOutlineDocumentText,
  HiOutlineLink,
  HiOutlinePhotograph,
  HiOutlineTrash,
  HiOutlineUserGroup,
  HiOutlineGlobeAlt,
  HiPencil,
  HiCheck,
  HiX,
} from 'react-icons/hi';
import { HiOutlineBellSlash } from 'react-icons/hi2';
import { PiRobot, PiSquaresFour } from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { RobotAvatar } from '../../../components/common/RobotAvatar';
import { resolveApiAssetUrl } from '../../../utils/platform';
import { getNotebookById } from '../../notebook/config/notebooksConfig';
import { type GroupAudience } from '../hooks/useGroupRequests';
import {
  useCloneCanvasTemplate,
  useGroupMembers,
  useSetGroupMute,
  getGroupInitials,
  type GroupLink,
} from '../hooks/useGroups';

import AddContentToGroupModal from './AddContentToGroupModal';
import GroupJoinRequestsSection from './GroupJoinRequestsSection';
import GroupLinksSection from './GroupLinksSection';
import GroupMembersList from './GroupMembersList';
import GroupVisibilityDialog from './GroupVisibilityDialog';

export interface GroupInfo {
  id?: string;
  name?: string;
  description?: string;
  created_by?: string;
  avatar_url?: string | null;
  links?: GroupLink[];
  is_public?: boolean;
  audience?: GroupAudience;
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

export interface SharedItem {
  id: string | number;
  identifier?: string;
  title?: string;
  name?: string;
  slug?: string;
  document_subtype?: string;
  shared_at?: string;
  shared_by_name?: string;
  contentType?: string;
  thumbnail_url?: string | null;
}

export interface SharedContent {
  collabDocs: SharedItem[];
  boards: SharedItem[];
  canvases: SharedItem[];
  documents: SharedItem[];
  generators: SharedItem[];
  notebooks: SharedItem[];
  agents: SharedItem[];
  texts: SharedItem[];
  canvasTemplates: SharedItem[];
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
  onSuccessMessage?: (msg: string) => void;
  onErrorMessage?: (msg: string) => void;
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
    onSuccessMessage,
    onErrorMessage,
  }: GroupInfoSectionProps) => {
    const navigate = useNavigate();
    const { members, isLoadingMembers } = useGroupMembers(groupId, { isActive: true });
    const [membersDialogOpen, setMembersDialogOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showVisibilityDialog, setShowVisibilityDialog] = useState(false);
    const cloneTemplate = useCloneCanvasTemplate();

    const isMuted = data?.membership?.notifications_muted ?? false;
    const setGroupMute = useSetGroupMute(groupId);
    const handleToggleMute = useCallback(() => {
      if (setGroupMute.isPending) return;
      const next = !isMuted;
      setGroupMute.mutate(next, {
        onSuccess: () =>
          onSuccessMessage?.(
            next ? 'Gruppe stummgeschaltet.' : 'Benachrichtigungen wieder aktiviert.'
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
        const res = await getContractsClient().groups.shareContent({
          params: { groupId: options.targetGroupId },
          body: {
            contentType: contentType as GroupContentType,
            contentId: String(itemId),
            permissions: options.permissions,
          },
        });
        if (res.status !== 200) throw new Error('share failed');
      },
      []
    );

    return (
      <>
        <div className="relative mb-xl">
          <div className="absolute right-0 top-0 flex items-center gap-sm">
            {!isLoadingMembers && onlineCount > 0 && (
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Gruppenaktionen">
                  <HiDotsVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMembersDialogOpen(true)}>
                  <HiOutlineUserGroup className="size-4 mr-xs" />
                  Mitglieder ({memberCount})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
                    <DropdownMenuItem onClick={() => setShowVisibilityDialog(true)}>
                      <HiOutlineGlobeAlt className="size-4 mr-xs" />
                      {data?.groupInfo?.is_public ? 'Öffentlich (verwalten)' : 'Öffentlich machen'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isDeletingGroup || isUpdatingGroupName}
                      className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                    >
                      <HiOutlineTrash className="size-4 mr-xs" />
                      Gruppe löschen
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-start gap-md">
            <div className="relative group/avatar shrink-0">
              {data?.groupInfo?.avatar_url ? (
                <img
                  src={resolveApiAssetUrl(
                    `/api/auth/groups/${groupId}/avatar?t=${avatarTimestamp}`
                  )}
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

        {data?.isAdmin && (
          <GroupJoinRequestsSection
            groupId={groupId}
            isAdmin={!!data?.isAdmin}
            onSuccessMessage={onSuccessMessage ?? (() => {})}
            onErrorMessage={onErrorMessage ?? (() => {})}
          />
        )}

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
              getIcon?: (item: SharedItem) => typeof HiOutlineDocumentText;
              getLink?: (item: SharedItem) => string;
              variant?: 'thumbnail';
              cloneOnOpen?: boolean;
            }[] = [
              {
                label: 'Docs',
                items: sharedContent.collabDocs,
                contentType: 'collaborative_documents',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/office/${item.id}`,
              },
              {
                label: 'Boards',
                items: sharedContent.boards,
                contentType: 'collaborative_documents',
                icon: PiSquaresFour,
                getLink: (item) => `/boards/${item.id}`,
              },
              {
                label: 'Sharepics',
                items: sharedContent.canvases,
                contentType: 'collaborative_documents',
                icon: HiOutlinePhotograph,
                getLink: (item) => `/studio/canvas/${item.id}`,
                variant: 'thumbnail',
              },
              {
                label: 'Sharepic-Vorlagen',
                items: sharedContent.canvasTemplates,
                contentType: 'canvas_template',
                icon: HiOutlinePhotograph,
                variant: 'thumbnail',
                cloneOnOpen: true,
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
                getIcon: (item) => getNotebookById(String(item.id))?.icon ?? HiOutlineDocumentText,
                getLink: (item) => `/notebook/${item.id}`,
              },
              {
                label: 'Grüneratoren',
                items: sharedContent.agents,
                contentType: 'user_agents',
                icon: PiRobot,
                getLink: (item) =>
                  `/agentura/agent/${getAgentSlug(item.identifier ?? String(item.id))}`,
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
                  const isThumbnailVariant = section.variant === 'thumbnail';
                  return (
                    <div key={section.label}>
                      <SectionHeader size="sm" title={section.label} />
                      <CardGrid columns="3">
                        {section.items.map((item) => {
                          const title = item.title || item.name || 'Ohne Titel';
                          const href = section.getLink?.(item);
                          const ItemIcon = section.getIcon?.(item) ?? ContentIcon;

                          if (isThumbnailVariant) {
                            const thumbnailUrl = item.thumbnail_url ?? null;
                            const isCloningThis =
                              cloneTemplate.isPending &&
                              cloneTemplate.variables === String(item.id);
                            const isCloning = isCloningThis;
                            const cardInner = (
                              <>
                                <div className="aspect-[4/3] bg-grey-100 dark:bg-grey-800 flex items-center justify-center overflow-hidden">
                                  {thumbnailUrl ? (
                                    <img
                                      src={thumbnailUrl}
                                      alt={title}
                                      loading="lazy"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <ContentIcon className="size-8 text-grey-400" />
                                  )}
                                </div>
                                <div className="p-sm">
                                  <p className="text-sm font-medium text-foreground truncate m-0">
                                    {title}
                                  </p>
                                  {item.shared_by_name && (
                                    <p className="text-xs text-grey-500 truncate mt-xxs m-0">
                                      Geteilt von {item.shared_by_name}
                                    </p>
                                  )}
                                  {section.cloneOnOpen && (
                                    <p className="text-[10px] text-primary-600 mt-xxs m-0">
                                      {isCloning
                                        ? 'Vorlage wird geöffnet...'
                                        : 'Klicken um Kopie zu erstellen'}
                                    </p>
                                  )}
                                </div>
                              </>
                            );
                            return (
                              <div
                                key={item.id}
                                className="group relative flex flex-col rounded-md border border-grey-200 dark:border-grey-700 bg-background overflow-hidden transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md hover:border-grey-300 dark:hover:border-grey-600"
                              >
                                {section.cloneOnOpen ? (
                                  <button
                                    type="button"
                                    onClick={() => handleCloneTemplate(String(item.id))}
                                    disabled={cloneTemplate.isPending}
                                    className="flex flex-col text-left bg-transparent border-none p-0 m-0 cursor-pointer text-foreground disabled:opacity-60 disabled:cursor-wait"
                                  >
                                    {cardInner}
                                  </button>
                                ) : href ? (
                                  <a
                                    href={href}
                                    className="flex flex-col no-underline text-foreground"
                                  >
                                    {cardInner}
                                  </a>
                                ) : (
                                  <div className="flex flex-col">{cardInner}</div>
                                )}
                                {data?.isAdmin && onUnshareContent && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUnshareContent(
                                        String(item.id),
                                        item.contentType ?? section.contentType
                                      )
                                    }
                                    className="absolute top-1 right-1 p-1 text-grey-400 hover:text-red-500 bg-background/80 dark:bg-background/80 backdrop-blur-sm transition-colors border-none cursor-pointer rounded opacity-0 group-hover:opacity-100"
                                    aria-label="Aus Gruppe entfernen"
                                  >
                                    <HiOutlineTrash size={16} />
                                  </button>
                                )}
                              </div>
                            );
                          }

                          const content = (
                            <>
                              <ItemIcon className="size-5 text-primary-600 dark:text-primary-400 shrink-0" />
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
                                    onUnshareContent(
                                      String(item.id),
                                      item.contentType ?? section.contentType
                                    )
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

        {data?.isAdmin && (
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
