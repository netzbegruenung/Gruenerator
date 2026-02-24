import { memo, useCallback, useRef, useState } from 'react';
import { HiOutlineDocumentText, HiPencil, HiCheck, HiX } from 'react-icons/hi';

import DeleteWarningTooltip from '../../../../../../../../components/common/DeleteWarningTooltip';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';
import GroupMembersList from '../../../../../../../../features/groups/components/GroupMembersList';
import { useGroupMembers } from '../../../../../../../../features/groups/hooks/useGroups';

import GroupVorlagenSection from './GroupVorlagenSection';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface GroupInfo {
  id?: string;
  name?: string;
  description?: string;
}

interface GroupData {
  instructionsEnabled?: boolean;
  isAdmin?: boolean;
  membership?: {
    role?: string;
  };
  customPrompt?: string;
  groupInfo?: GroupInfo;
  joinToken?: string;
  [key: string]: unknown;
}

interface VorlagenItem {
  id: string;
  title: string;
  description?: string;
  template_type?: string;
  thumbnail_url?: string;
  external_url?: string;
  tags?: string[];
  categories?: string[];
  is_system?: boolean;
}

interface SharedDocument {
  id: string;
  title: string;
  document_subtype?: string;
  shared_at?: string;
  shared_by_name?: string;
}

interface TabIndexConfig {
  groupNameEdit: number;
  groupDetailTabs?: number;
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
  isActive: boolean;
  tabIndex: TabIndexConfig;
  customPrompt: string;
  setCustomPrompt: (value: string) => void;
  vorlagen: VorlagenItem[];
  vorlagenTags: string[];
  isLoadingVorlagen: boolean;
  onUpdateTags: (tags: string[]) => void;
  isUpdatingSettings: boolean;
  sharedDocuments: SharedDocument[];
  isLoadingSharedDocuments: boolean;
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
    isActive,
    tabIndex,
    customPrompt,
    setCustomPrompt,
    vorlagen,
    vorlagenTags,
    isLoadingVorlagen,
    onUpdateTags,
    isUpdatingSettings,
    sharedDocuments,
    isLoadingSharedDocuments,
  }: GroupInfoSectionProps) => {
    const { members, isLoadingMembers } = useGroupMembers(groupId, { isActive });
    const [membersPopoverOpen, setMembersPopoverOpen] = useState(false);
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

    const handleCustomPromptChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setCustomPrompt(e.target.value);
      },
      [setCustomPrompt]
    );

    const handleTextareaAutoResize = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      target.style.height = 'auto';
      target.style.height = target.scrollHeight + 2 + 'px';
    }, []);
    return (
      <>
        {/* Group Header */}
        <Card className="p-lg border-0 shadow-none">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex flex-col gap-sm">
                  <input
                    type="text"
                    value={editedGroupName}
                    onChange={handleGroupNameChange}
                    className="w-full rounded-md border-2 border-primary-500 bg-background px-sm py-xs text-2xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/20 min-w-[200px] max-w-[400px]"
                    placeholder="Gruppenname"
                    maxLength={100}
                    autoFocus
                    tabIndex={tabIndex.groupNameEdit}
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
                    <div className="text-xs text-foreground mt-xxs">
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
                <>
                  <div className="flex items-center gap-xs">
                    <h2 className="text-2xl font-bold">{data?.groupInfo?.name}</h2>
                    {data?.isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={handleStartEditingBoth}
                        title="Gruppe bearbeiten"
                        disabled={isUpdatingGroupName}
                        tabIndex={tabIndex.groupNameEdit}
                        aria-label="Gruppe bearbeiten"
                      >
                        <HiPencil />
                      </Button>
                    )}
                    {data?.isAdmin && <Badge variant="default">Admin</Badge>}
                  </div>
                  {!data?.isAdmin && (
                    <p className="text-sm text-foreground mt-xxs">Du bist Mitglied dieser Gruppe</p>
                  )}
                  <div className="mt-xs">
                    <div className="flex items-start gap-xxs text-sm text-foreground leading-relaxed">
                      {data?.groupInfo?.description ? (
                        <span className="whitespace-pre-wrap">{data.groupInfo.description}</span>
                      ) : (
                        <span className="italic text-foreground">
                          {data?.isAdmin
                            ? 'Keine Beschreibung vorhanden'
                            : 'Keine Beschreibung vorhanden.'}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-sm shrink-0">
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
                            <img
                              key={member.user_id}
                              src={`/images/profileimages/${member.avatar_robot_id || 1}.svg`}
                              alt=""
                              className="size-7 rounded-full ring-2 ring-background"
                            />
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
                  <GroupMembersList groupId={groupId} isActive={isActive} />
                </PopoverContent>
              </Popover>
              {data?.isAdmin && (
                <>
                  {data?.joinToken && (
                    <ProfileActionButton
                      action="link"
                      onClick={copyJoinLink}
                      title={joinLinkCopied ? 'Kopiert!' : 'Einladungslink kopieren'}
                      label={joinLinkCopied ? 'Kopiert!' : undefined}
                      showLabel={joinLinkCopied}
                      disabled={!data?.joinToken}
                    />
                  )}
                  <DeleteWarningTooltip
                    onConfirm={confirmDeleteGroup}
                    disabled={isDeletingGroup || isUpdatingGroupName}
                    title="Gruppe löschen"
                    message="Die gesamte Gruppe wird für alle Mitglieder unwiderruflich gelöscht. Alle Gruppeninhalte und -mitgliedschaften werden permanent entfernt."
                    confirmText="Endgültig löschen"
                    cancelText="Abbrechen"
                  />
                </>
              )}
            </div>
          </div>

          {/* Anweisungen */}
          <div className="mt-md">
            <h3 className="text-xs font-medium uppercase tracking-wide text-foreground mb-xs">
              Anweisungen
            </h3>
            <textarea
              id="groupCustomPrompt"
              value={customPrompt}
              onChange={handleCustomPromptChange}
              placeholder="Anweisungen für Text-Generierungen..."
              className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              rows={3}
              maxLength={2000}
              disabled={!data?.isAdmin}
            />
            {customPrompt.length > 1500 && (
              <div className="text-xs text-foreground mt-xxs">
                {customPrompt.length}/2000 Zeichen
              </div>
            )}
          </div>

          {/* Vorlagen */}
          <GroupVorlagenSection
            vorlagen={vorlagen}
            tags={vorlagenTags}
            isLoading={isLoadingVorlagen}
            isAdmin={!!data?.isAdmin}
            onUpdateTags={onUpdateTags}
            isUpdating={isUpdatingSettings}
          />

          {/* Geteilte Dokumente */}
          {(sharedDocuments.length > 0 || isLoadingSharedDocuments) && (
            <div className="mt-md">
              <h3 className="text-xs font-medium uppercase tracking-wide text-foreground mb-xs">
                Geteilte Dokumente
              </h3>
              {isLoadingSharedDocuments ? (
                <p className="text-xs text-foreground italic">Dokumente werden geladen...</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-xs">
                  {sharedDocuments.map((doc) => (
                    <a
                      key={doc.id}
                      href={`/docs/${doc.id}`}
                      className="flex items-center gap-xs rounded-lg border border-grey-200 dark:border-grey-700 bg-background p-xs hover:border-primary-500 hover:shadow-sm transition-all"
                    >
                      <HiOutlineDocumentText className="size-5 text-primary-600 dark:text-primary-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {doc.title}
                        </p>
                        <p className="text-xs text-foreground truncate">
                          {doc.shared_by_name && `Geteilt von ${doc.shared_by_name}`}
                          {doc.shared_by_name && doc.shared_at && ' · '}
                          {doc.shared_at &&
                            new Date(doc.shared_at).toLocaleDateString('de-DE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </>
    );
  }
);

GroupInfoSection.displayName = 'GroupInfoSection';

export default GroupInfoSection;
