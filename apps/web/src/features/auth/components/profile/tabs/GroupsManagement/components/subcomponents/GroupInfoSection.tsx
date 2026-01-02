import { HiPencil, HiCheck, HiX } from 'react-icons/hi';
import DeleteWarningTooltip from '../../../../../../../../components/common/DeleteWarningTooltip';
import GroupMembersList from '../../../../../../../../features/groups/components/GroupMembersList';
import { ProfileActionButton } from '../../../../../../../../components/profile/actions/ProfileActionButton';

const GroupInfoSection = ({
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
    tabIndex
}) => {
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
                                        onChange={(e) => setEditedGroupName(e.target.value)}
                                        className="group-name-edit-input"
                                        placeholder="Gruppenname"
                                        maxLength={100}
                                        autoFocus
                                        tabIndex={tabIndex.groupNameEdit}
                                        aria-label="Gruppenname bearbeiten"
                                    />
                                    <textarea
                                        value={editedGroupDescription}
                                        onChange={(e) => setEditedGroupDescription(e.target.value)}
                                        className="form-textarea"
                                        placeholder="Beschreibung der Gruppe (optional)..."
                                        maxLength={500}
                                        disabled={isUpdatingGroupName}
                                        style={{ minHeight: 'auto', resize: 'none', overflow: 'hidden' }}
                                        onInput={(e) => {
                                            const target = e.target as HTMLTextAreaElement;
                                            target.style.height = 'auto';
                                            target.style.height = (target.scrollHeight + 2) + 'px';
                                        }}
                                    />
                                    {editedGroupDescription.length >= 450 && (
                                        <div className="character-count">
                                            {editedGroupDescription.length}/500 Zeichen
                                        </div>
                                    )}
                                    <div className="group-name-edit-actions">
                                        <button
                                            onClick={() => { saveGroupName(); saveGroupDescription(); }}
                                            className="group-name-edit-button save"
                                            disabled={!editedGroupName.trim() || isUpdatingGroupName}
                                            title="Speichern"
                                        >
                                            <HiCheck />
                                        </button>
                                        <button
                                            onClick={() => { cancelEditingName(); cancelEditingDescription(); }}
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
                                        <h2 className="profile-user-name large-profile-title">{data?.groupInfo?.name}</h2>
                                        {data?.isAdmin && (
                                            <button
                                                onClick={() => { startEditingName(); startEditingDescription(); }}
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
                                        <p className="group-membership-status">
                                            Du bist Mitglied dieser Gruppe
                                        </p>
                                    )}
                                    <div className="group-description-area">
                                        <div className="group-description-display">
                                            {data?.groupInfo?.description ? (
                                                <span style={{ whiteSpace: 'pre-wrap' }}>
                                                    {data.groupInfo.description}
                                                </span>
                                            ) : (
                                                <span style={{ fontStyle: 'italic', color: 'var(--font-color-subtle)' }}>
                                                    {data?.isAdmin ? 'Keine Beschreibung vorhanden' : 'Keine Beschreibung vorhanden.'}
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
                <GroupMembersList
                    groupId={groupId}
                    isActive={isActive}
                />
            </div>
        </>
    );
};

export default GroupInfoSection;
