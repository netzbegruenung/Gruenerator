import { memo, useCallback } from 'react';
import { HiPencil, HiCheck, HiX } from 'react-icons/hi';

import DeleteWarningTooltip from '../../../../../../../../components/common/DeleteWarningTooltip';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';
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
  }: GroupInfoSectionProps) => {
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

        {/* Group Members Section */}
        <div className="group-content-card">
          <GroupMembersList groupId={groupId} isActive={isActive} />
        </div>

        {/* Group Instructions Section */}
        <div className="group-content-card">
          <div className="auth-form">
            <div className="form-group">
              <div className="form-group-title">Gruppenanweisungen</div>
              <div className="form-field-wrapper">
                <textarea
                  id="groupCustomPrompt"
                  value={customPrompt}
                  onChange={handleCustomPromptChange}
                  placeholder="Diese Anweisungen werden bei allen Text-Generierungen für Gruppenmitglieder berücksichtigt..."
                  className="form-textarea"
                  rows={4}
                  maxLength={2000}
                  disabled={!data?.isAdmin}
                />
                {customPrompt.length > 1500 && (
                  <div className="form-character-count">{customPrompt.length}/2000 Zeichen</div>
                )}
              </div>
              {!data?.isAdmin && (
                <div className="form-help-text">
                  Nur Gruppenadministratoren können die Anweisungen bearbeiten
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }
);

GroupInfoSection.displayName = 'GroupInfoSection';

export default GroupInfoSection;
