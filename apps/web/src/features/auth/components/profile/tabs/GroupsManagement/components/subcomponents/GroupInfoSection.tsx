import { memo, useCallback, useMemo } from 'react';
import {
  HiPencil,
  HiCheck,
  HiX,
  HiOutlinePlus,
  HiOutlineTrash,
  HiChevronDown,
} from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import DeleteWarningTooltip from '../../../../../../../../components/common/DeleteWarningTooltip';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';
import { Badge } from '../../../../../../../../components/ui/badge';
import { Button } from '../../../../../../../../components/ui/button';
import { Card } from '../../../../../../../../components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../../../../../../components/ui/collapsible';
import { Separator } from '../../../../../../../../components/ui/separator';
import GroupMembersList from '../../../../../../../../features/groups/components/GroupMembersList';

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

interface SharedContentItem {
  id: string;
  title?: string;
  name?: string;
  slug?: string;
  canva_url?: string;
  external_url?: string;
  content_data?: { originalUrl?: string };
}

interface GroupContent {
  documents?: SharedContentItem[];
  texts?: SharedContentItem[];
  notebooks?: SharedContentItem[];
  generators?: SharedContentItem[];
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
  groupContent: GroupContent | null;
  isLoadingGroupContent: boolean;
  onUnshare: (contentType: string, contentId: string) => void;
  isUnsharing: boolean;
  onAddContent: () => void;
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
    groupContent,
    isLoadingGroupContent,
    onUnshare,
    isUnsharing,
    onAddContent,
  }: GroupInfoSectionProps) => {
    const navigate = useNavigate();

    const contentItems = useMemo(() => {
      if (!groupContent) return [];
      const items: {
        id: string;
        title: string;
        type: string;
        contentType: string;
        slug?: string;
        canva_url?: string;
        external_url?: string;
        content_data?: { originalUrl?: string };
      }[] = [];
      groupContent.documents?.forEach((d) =>
        items.push({
          id: d.id,
          title: d.title || d.name || 'Dokument',
          type: 'Dokument',
          contentType: 'documents',
        })
      );
      groupContent.texts?.forEach((d) =>
        items.push({
          id: d.id,
          title: d.title || d.name || 'Text',
          type: 'Text',
          contentType: 'user_documents',
        })
      );
      groupContent.notebooks?.forEach((d) =>
        items.push({
          id: d.id,
          title: d.title || d.name || 'Notebook',
          type: 'Notebook',
          contentType: 'notebook_collections',
        })
      );
      groupContent.generators?.forEach((d) =>
        items.push({
          id: d.id,
          title: d.title || d.name || 'Generator',
          type: 'Generator',
          contentType: 'custom_generators',
          slug: d.slug,
        })
      );
      return items;
    }, [groupContent]);

    const handleContentClick = useCallback(
      (item: (typeof contentItems)[0]) => {
        switch (item.contentType) {
          case 'user_documents':
            navigate(`/editor/collab/${item.id}`);
            break;
          case 'notebook_collections':
            navigate(`/notebook/${item.id}`);
            break;
          case 'custom_generators':
            navigate(`/generators/custom/${item.slug || item.id}`);
            break;
          case 'documents':
            navigate(`/documents/${item.id}`);
            break;
        }
      },
      [navigate]
    );

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
        <div className="group-content-card">
          <div className="group-info-panel">
            <div className="group-header-section">
              <div className="group-title-area">
                {isEditingName ? (
                  <div className="group-edit-form">
                    <input
                      type="text"
                      value={editedGroupName}
                      onChange={handleGroupNameChange}
                      className="group-name-edit-input"
                      placeholder="Gruppenname"
                      maxLength={100}
                      autoFocus
                      tabIndex={tabIndex.groupNameEdit}
                      aria-label="Gruppenname bearbeiten"
                    />
                    <textarea
                      value={editedGroupDescription}
                      onChange={handleGroupDescriptionChange}
                      className="form-textarea"
                      placeholder="Beschreibung der Gruppe (optional)..."
                      maxLength={500}
                      disabled={isUpdatingGroupName}
                      style={{ minHeight: 'auto', resize: 'none', overflow: 'hidden' }}
                      onInput={handleTextareaAutoResize}
                    />
                    {editedGroupDescription.length >= 450 && (
                      <div className="character-count">
                        {editedGroupDescription.length}/500 Zeichen
                      </div>
                    )}
                    <div className="group-name-edit-actions">
                      <button
                        onClick={handleSaveBoth}
                        className="group-name-edit-button save"
                        disabled={!editedGroupName.trim() || isUpdatingGroupName}
                        title="Speichern"
                      >
                        <HiCheck />
                      </button>
                      <button
                        onClick={handleCancelBoth}
                        className="group-name-edit-button cancel"
                        disabled={isUpdatingGroupName}
                        title="Abbrechen"
                      >
                        <HiX />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="group-title-line">
                      <h2 className="profile-user-name large-profile-title">
                        {data?.groupInfo?.name}
                      </h2>
                      {data?.isAdmin && (
                        <button
                          onClick={handleStartEditingBoth}
                          className="group-name-edit-icon"
                          title="Gruppe bearbeiten"
                          disabled={isUpdatingGroupName}
                          tabIndex={tabIndex.groupNameEdit}
                          aria-label="Gruppe bearbeiten"
                        >
                          <HiPencil />
                        </button>
                      )}
                      {data?.isAdmin && <span className="admin-badge">Admin</span>}
                    </div>
                    {!data?.isAdmin && (
                      <p className="group-membership-status">Du bist Mitglied dieser Gruppe</p>
                    )}
                    <div className="group-description-area">
                      <div className="group-description-display">
                        {data?.groupInfo?.description ? (
                          <span style={{ whiteSpace: 'pre-wrap' }}>
                            {data.groupInfo.description}
                          </span>
                        ) : (
                          <span style={{ fontStyle: 'italic', color: 'var(--font-color-subtle)' }}>
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
              {data?.isAdmin && (
                <div className="group-header-actions">
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
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mitglieder + Anweisungen (left) | Geteilte Inhalte (right) */}
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr]">
            {/* Left column: Mitglieder + Anweisungen */}
            <div className="p-lg flex flex-col gap-sm">
              <Collapsible defaultOpen>
                <CollapsibleTrigger className="group flex w-full items-center justify-between py-xs">
                  <span className="text-xs font-medium uppercase tracking-wide text-grey-500">
                    Mitglieder
                  </span>
                  <HiChevronDown className="text-grey-400 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <GroupMembersList groupId={groupId} isActive={isActive} hideHeader />
                </CollapsibleContent>
              </Collapsible>

              <Separator />

              <Collapsible defaultOpen>
                <CollapsibleTrigger className="group flex w-full items-center justify-between py-xs">
                  <span className="text-xs font-medium uppercase tracking-wide text-grey-500">
                    Anweisungen
                  </span>
                  <HiChevronDown className="text-grey-400 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <textarea
                    id="groupCustomPrompt"
                    value={customPrompt}
                    onChange={handleCustomPromptChange}
                    placeholder="Anweisungen für Text-Generierungen..."
                    className="form-textarea mt-xs"
                    rows={3}
                    maxLength={2000}
                    disabled={!data?.isAdmin}
                  />
                  {customPrompt.length > 1500 && (
                    <div className="form-character-count">{customPrompt.length}/2000 Zeichen</div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Vertical divider (desktop only) */}
            <Separator orientation="vertical" className="hidden md:block" />

            {/* Right column: Geteilte Inhalte */}
            <div className="p-lg">
              <div className="flex items-center justify-between mb-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-grey-500">
                  Geteilte Inhalte
                  {contentItems.length > 0 && (
                    <span className="font-normal ml-xs">({contentItems.length})</span>
                  )}
                </span>
                <Button variant="ghost" size="xs" onClick={onAddContent}>
                  <HiOutlinePlus />
                  Hinzufügen
                </Button>
              </div>

              {contentItems.length === 0 ? (
                <p className="text-xs text-grey-500 italic">Noch keine Inhalte geteilt.</p>
              ) : (
                <ul className="flex flex-col gap-xxs">
                  {contentItems.map((item) => (
                    <li
                      key={`${item.contentType}-${item.id}`}
                      className="group flex items-center gap-xs px-xs py-xxs rounded-sm border-l-2 border-transparent hover:border-primary-500 hover:bg-grey-100 dark:hover:bg-grey-800 cursor-pointer transition-colors"
                      onClick={() => handleContentClick(item)}
                    >
                      <Badge variant="secondary" className="shrink-0 text-[0.65rem] px-1 py-0">
                        {item.type}
                      </Badge>
                      <span className="text-sm truncate flex-1">{item.title}</span>
                      {data?.isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`"${item.title}" aus der Gruppe entfernen?`)) {
                              onUnshare(item.contentType, item.id);
                            }
                          }}
                          disabled={isUnsharing}
                          className="opacity-0 group-hover:opacity-100 text-grey-400 hover:text-red-600 transition-all shrink-0"
                          title="Entfernen"
                        >
                          <HiOutlineTrash className="text-sm" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      </>
    );
  }
);

GroupInfoSection.displayName = 'GroupInfoSection';

export default GroupInfoSection;
