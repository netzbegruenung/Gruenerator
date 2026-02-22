import { memo, useCallback, useMemo } from 'react';
import { HiPencil, HiCheck, HiX, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import DeleteWarningTooltip from '../../../../../../../../components/common/DeleteWarningTooltip';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';
import GroupMembersList from '../../../../../../../../features/groups/components/GroupMembersList';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

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
        <Card className="p-lg">
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
                    <div className="text-xs text-grey-400 mt-xxs">
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
                    <p className="text-sm text-grey-500 mt-xxs">Du bist Mitglied dieser Gruppe</p>
                  )}
                  <div className="mt-xs">
                    <div className="flex items-start gap-xxs text-sm text-grey-500 leading-relaxed">
                      {data?.groupInfo?.description ? (
                        <span className="whitespace-pre-wrap">{data.groupInfo.description}</span>
                      ) : (
                        <span className="italic text-grey-400">
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
              <div className="flex items-center gap-sm shrink-0">
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
        </Card>

        {/* Three-card grid: Mitglieder | Anweisungen | Geteilte Inhalte */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sm">
          <Card className="flex flex-col">
            <CardHeader className="pb-xs">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-grey-500">
                Mitglieder
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex-1">
              <GroupMembersList groupId={groupId} isActive={isActive} hideHeader />
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-xs">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-grey-500">
                Anweisungen
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex-1">
              <textarea
                id="groupCustomPrompt"
                value={customPrompt}
                onChange={handleCustomPromptChange}
                placeholder="Anweisungen für Text-Generierungen..."
                className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm resize-vertical focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                rows={4}
                maxLength={2000}
                disabled={!data?.isAdmin}
              />
              {customPrompt.length > 1500 && (
                <div className="text-xs text-grey-400 mt-xxs">
                  {customPrompt.length}/2000 Zeichen
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col md:col-span-2 lg:col-span-1">
            <CardHeader className="pb-xs">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-grey-500">
                  Geteilte Inhalte
                  {contentItems.length > 0 && (
                    <span className="font-normal ml-xs">({contentItems.length})</span>
                  )}
                </CardTitle>
                <Button variant="ghost" size="xs" onClick={onAddContent}>
                  <HiOutlinePlus />
                  Hinzufügen
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 flex-1">
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
            </CardContent>
          </Card>
        </div>
      </>
    );
  }
);

GroupInfoSection.displayName = 'GroupInfoSection';

export default GroupInfoSection;
