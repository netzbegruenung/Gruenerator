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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@gruenerator/ui';
import { memo, useCallback, useRef, useState } from 'react';
import {
  HiDotsVertical,
  HiOutlineDocumentText,
  HiOutlineLink,
  HiOutlineTrash,
  HiPencil,
  HiPlus,
  HiCheck,
  HiX,
} from 'react-icons/hi';
import { PiSquaresFour } from 'react-icons/pi';

import apiClient from '../../../components/utils/apiClient';
import { useGroupMembers } from '../hooks/useGroups';

import AddContentToGroupModal from './AddContentToGroupModal';
import GroupMembersList from './GroupMembersList';

interface GroupInfo {
  id?: string;
  name?: string;
  description?: string;
}

interface GroupData {
  isAdmin?: boolean;
  membership?: {
    role?: string;
  };
  groupInfo?: GroupInfo;
  joinToken?: string;
  [key: string]: unknown;
}

interface SharedItem {
  id: string | number;
  title?: string;
  name?: string;
  slug?: string;
  document_subtype?: string;
  shared_at?: string;
  shared_by_name?: string;
  contentType?: string;
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
  sharedCollabDocs: SharedItem[];
  sharedBoards: SharedItem[];
  sharedDocuments: SharedItem[];
  sharedGenerators: SharedItem[];
  sharedNotebooks: SharedItem[];
  sharedTexts: SharedItem[];
  isLoadingSharedContent: boolean;
  onUnshareContent?: (contentId: string, contentType: string) => void;
  refetchSharedContent?: () => void;
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
    sharedCollabDocs,
    sharedBoards,
    sharedDocuments,
    sharedGenerators,
    sharedNotebooks,
    sharedTexts,
    isLoadingSharedContent,
    onUnshareContent,
    refetchSharedContent,
  }: GroupInfoSectionProps) => {
    const { members, isLoadingMembers } = useGroupMembers(groupId, { isActive: true });
    const [membersPopoverOpen, setMembersPopoverOpen] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAddContent, setShowAddContent] = useState(false);
    const popoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleMembersMouseEnter = useCallback(() => {
      if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
      setMembersPopoverOpen(true);
    }, []);

    const handleMembersMouseLeave = useCallback(() => {
      popoverTimeoutRef.current = setTimeout(() => setMembersPopoverOpen(false), 200);
    }, []);

    const memberCount = members?.length ?? 0;

    // Memoized handlers to prevent inline function recreation
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
        {/* Page Header with actions top-right */}
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
                              src={`/images/profileimages/${member.avatar_robot_id || 1}.svg`}
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
                <GroupMembersList groupId={groupId} isActive />
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

          {isEditingName ? (
            <div className="flex flex-col items-center gap-sm max-w-[400px] mx-auto">
              <input
                type="text"
                value={editedGroupName}
                onChange={handleGroupNameChange}
                className="w-full rounded-md border-2 border-primary-500 bg-background px-sm py-xs text-2xl font-bold text-foreground text-center focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                placeholder="Gruppenname"
                maxLength={100}
                autoFocus
                aria-label="Gruppenname bearbeiten"
              />
              <textarea
                value={editedGroupDescription}
                onChange={handleGroupDescriptionChange}
                className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm resize-none overflow-hidden text-center focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
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
            <div className="text-center">
              <div className="flex items-center justify-center gap-sm mb-sm">
                <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading m-0">
                  {data?.groupInfo?.name}
                </h1>
                {data?.isAdmin && <Badge variant="default">Admin</Badge>}
              </div>
              <p className="text-lg text-foreground max-w-[800px] mx-auto">
                {data?.groupInfo?.description ||
                  (data?.isAdmin
                    ? 'Verwalte Mitglieder und geteilte Inhalte.'
                    : 'Du bist Mitglied dieser Gruppe.')}
              </p>
            </div>
          )}
        </div>

        {/* Shared Content */}
        <div>
          <div className="flex items-center gap-xs mb-md">
            <h2 className="text-xl font-semibold text-foreground-heading m-0">Geteilte Inhalte</h2>
            {data?.isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddContent(true)}
                className="flex items-center justify-center w-7 h-7 rounded-full text-primary-600 hover:bg-primary-600/10 transition-colors cursor-pointer"
                aria-label="Inhalte hinzufügen"
              >
                <HiPlus size={18} />
              </button>
            )}
          </div>
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
                items: sharedCollabDocs,
                contentType: 'collaborative_documents',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/docs/${item.id}`,
              },
              {
                label: 'Boards',
                items: sharedBoards,
                contentType: 'collaborative_documents',
                icon: PiSquaresFour,
                getLink: (item) => `/boards/${item.id}`,
              },
              {
                label: 'Grüneratoren',
                items: sharedGenerators,
                contentType: 'custom_generators',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/gruenerator/${item.slug || item.id}`,
              },
              {
                label: 'Notebooks',
                items: sharedNotebooks,
                contentType: 'notebook_collections',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/notebook/${item.id}`,
              },
              {
                label: 'Dokumente',
                items: sharedDocuments,
                contentType: 'documents',
                icon: HiOutlineDocumentText,
                getLink: (item) => `/documents/${item.id}`,
              },
              {
                label: 'Texte',
                items: sharedTexts,
                contentType: 'user_documents',
                icon: HiOutlineDocumentText,
              },
            ];
            const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

            if (isLoadingSharedContent) {
              return (
                <p className="text-sm text-foreground italic">Geteilte Inhalte werden geladen...</p>
              );
            }

            if (totalItems === 0) {
              return (
                <div className="rounded-lg border border-dashed border-grey-300 dark:border-grey-600 p-lg text-center">
                  <p className="text-sm text-grey-400">
                    Noch keine geteilten Inhalte in dieser Gruppe.
                  </p>
                </div>
              );
            }

            return (
              <div className="flex flex-col gap-lg">
                {sections.map((section) => {
                  if (section.items.length === 0) return null;
                  const SectionIcon = section.icon;
                  return (
                    <div key={section.label}>
                      <h3 className="text-sm font-medium text-foreground mb-sm">{section.label}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm">
                        {section.items.map((item) => {
                          const title = item.title || item.name || 'Ohne Titel';
                          const href = section.getLink?.(item);
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-sm rounded-lg border border-grey-200 dark:border-grey-700 bg-background p-sm hover:border-primary-500 hover:shadow-sm transition-all"
                            >
                              {href ? (
                                <a
                                  href={href}
                                  className="flex items-center gap-sm min-w-0 flex-1 no-underline"
                                >
                                  <SectionIcon className="size-5 text-primary-600 dark:text-primary-400 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {title}
                                    </p>
                                    {item.shared_by_name && (
                                      <p className="text-xs text-grey-500 truncate mt-xxs">
                                        Geteilt von {item.shared_by_name}
                                      </p>
                                    )}
                                  </div>
                                </a>
                              ) : (
                                <div className="flex items-center gap-sm min-w-0 flex-1">
                                  <SectionIcon className="size-5 text-primary-600 dark:text-primary-400 shrink-0" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {title}
                                    </p>
                                    {item.shared_by_name && (
                                      <p className="text-xs text-grey-500 truncate mt-xxs">
                                        Geteilt von {item.shared_by_name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {data?.isAdmin && onUnshareContent && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUnshareContent(String(item.id), section.contentType)
                                  }
                                  className="shrink-0 p-1 text-grey-400 hover:text-red-500 transition-colors bg-transparent border-none cursor-pointer rounded"
                                  aria-label="Aus Gruppe entfernen"
                                >
                                  <HiOutlineTrash size={16} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
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
          />
        )}

        {/* Delete confirmation dialog */}
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
