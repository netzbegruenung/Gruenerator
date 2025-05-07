import React, { useState, useEffect } from 'react';
import { HiOutlineTrash, HiPlus, HiLink, HiInformationCircle } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import GroupList from '../../../../features/groups/components/GroupList';
import useGroups from '../../../../features/groups/hooks/useGroups';
import useGroupDetails from '../../../../features/groups/hooks/useGroupDetails';
import { useSupabaseAuth } from '../../../../context/SupabaseAuthContext';

// Hilfsfunktion für Gruppen-Initialen
const getGroupInitials = (groupName) => {
    if (!groupName) return 'G';
    
    // Für einfache Namen: Erste beiden Buchstaben
    if (!groupName.includes(' ')) {
        return groupName.substring(0, 2).toUpperCase();
    }
    
    // Für zusammengesetzte Namen: Initialen der ersten beiden Wörter
    const words = groupName.split(' ');
    return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};

// Component for the Group Detail View (internal to GroupsManagementTab)
const GroupDetailView = ({ 
    groupId, 
    templatesSupabase, // Pass down for useGroupDetails
    onBackToList, // This might be handled by the parent tab now
    onSuccessMessage, 
    onErrorMessage
}) => {
    const { user } = useSupabaseAuth(); // Needed for useGroupDetails indirectly?
    const { 
        groupInfo, 
        joinToken, 
        isAdmin, 
        customAntragPrompt, 
        customSocialPrompt, 
        isAntragPromptActive, 
        isSocialPromptActive,
        knowledgeEntries, 
        handleInstructionsChange, 
        handleKnowledgeChange, 
        handleKnowledgeDelete,
        saveChanges, 
        isSaving, 
        isSaveSuccess, 
        isSaveError, 
        saveError,
        isDeletingKnowledge, 
        deletingKnowledgeId, 
        isDeleteKnowledgeError, 
        deleteKnowledgeError,
        isLoadingDetails, 
        isErrorDetails, 
        errorDetails,
        hasUnsavedChanges,
        MAX_CONTENT_LENGTH: GROUP_MAX_CONTENT_LENGTH 
    } = useGroupDetails(groupId, { enabled: !!groupId && !!templatesSupabase }); // Enable based on props
    const { 
        deleteGroup, 
        isDeletingGroup, 
        // isDeleteGroupError, // wird bereits von onErrorMessage behandelt
        // deleteGroupError 
    } = useGroups(); // Get the delete function

    const [showJoinLink, setShowJoinLink] = useState(false);
    const [joinLinkCopied, setJoinLinkCopied] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Effect for save/delete feedback within this component
    useEffect(() => {
        let timer;
        if (isSaveSuccess) {
            onSuccessMessage('Gruppenänderungen erfolgreich gespeichert!');
            // timer = setTimeout(() => onSuccessMessage(''), 3000); // Parent handles clearing
        } else if (isSaveError) {
            const message = saveError instanceof Error ? saveError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Speichern (Gruppe): ${message}`);
            // timer = setTimeout(() => onErrorMessage(''), 6000); // Parent handles clearing
        } else if (isDeleteKnowledgeError) {
            const message = deleteKnowledgeError instanceof Error ? deleteKnowledgeError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Löschen (Gruppenwissen): ${message}`);
            // timer = setTimeout(() => onErrorMessage(''), 6000); // Parent handles clearing
        }
        // return () => clearTimeout(timer); // Parent handles clearing
      }, [isSaveSuccess, isSaveError, saveError, isDeleteKnowledgeError, deleteKnowledgeError, onSuccessMessage, onErrorMessage]);


    const getJoinUrl = () => {
        if (!joinToken) return '';
        const baseUrl = window.location.origin;
        return `${baseUrl}/join-group/${joinToken}`;
    };

    const copyJoinLink = () => {
        navigator.clipboard.writeText(getJoinUrl())
        .then(() => {
            setJoinLinkCopied(true);
            setTimeout(() => setJoinLinkCopied(false), 3000);
        })
        .catch(err => console.error('Failed to copy link:', err));
    };

    if (isLoadingDetails) {
        return (
            <div className="loading-container" style={{padding: 'var(--spacing-large)'}}>
                <Spinner size="large" />
                <p>Lade Gruppendetails...</p>
            </div>
        );
    }

    if (isErrorDetails) {
        return (
            <> {/* Changed from profile-form-section to allow parent to control overall layout */}
                <div className="auth-error-message">
                    Fehler beim Laden der Gruppendetails: {errorDetails?.message || 'Unbekannter Fehler'}
                </div>
                {/* Back button might be less relevant here if navigation is always present on left */}
                {/* <button
                    onClick={onBackToList}
                    className="profile-action-button"
                    type="button"
                >
                    Zurück zur Gruppenliste 
                </button> */}
            </>
        );
    }

    if (!groupInfo) {
        return <p>Gruppendaten nicht gefunden oder Du hast keinen Zugriff.</p>; 
    }

    const handleDeleteGroup = () => {
        if (!groupId || !isAdmin) return;
        setShowDeleteConfirm(true);
    };

    const confirmDeleteGroup = () => {
        onSuccessMessage('');
        onErrorMessage('');
        deleteGroup(groupId, {
            onSuccess: () => {
                onSuccessMessage('Gruppe erfolgreich gelöscht!');
                setShowDeleteConfirm(false);
                // Navigation/View update will be handled by parent component's useEffect
                // or by the invalidation of queries causing a re-render
            },
            onError: (error) => {
                onErrorMessage(`Fehler beim Löschen der Gruppe: ${error.message}`);
                setShowDeleteConfirm(false);
            }
        });
    };

    const cancelDeleteGroup = () => {
        setShowDeleteConfirm(false);
    };

    return (
        <div className="group-detail-cards-layout">
            <div className="group-content-card"> {/* First card for info */}
                <div className="group-info-panel"> 
                    <div className="group-header-section"> 
                        <div className="group-title-area"> 
                            <div className="group-title-line">
                                <h2 className="profile-user-name" style={{ fontSize: '1.8rem' }}>{groupInfo?.name}</h2>
                                {isAdmin && <span className="admin-badge">Admin</span>}
                            </div>
                            {!isAdmin && (
                                <p className="group-membership-status">
                                    Du bist Mitglied dieser Gruppe
                                </p>
                            )}
                        </div>
                        {isAdmin && joinToken && (
                            <button
                                onClick={copyJoinLink}
                                className="copy-join-link-button"
                                type="button"
                                title="Einladungslink kopieren"
                                disabled={!joinToken}
                            >
                                {joinLinkCopied ? (
                                    'Kopiert!'
                                ) : (
                                    <HiLink />
                                )}
                            </button>
                        )}
                    </div>
                    <div className="anweisungen-info gruppen-info" style={{ marginBottom: 'var(--spacing-large)' }}>
                        <p>
                            Diese Gruppe ermöglicht die gemeinsame Nutzung von Anweisungen und Wissen für den Grünerator.
                            Als Admin kannst du die Einstellungen unten bearbeiten und Mitglieder einladen, indem du rechts auf den Link-Button klickst und den kopierten Link verschickst.
                        </p>
                    </div>
                </div>
            </div>

            <div className="group-content-card"> {/* Second card for form content */}
                <div className="auth-form">
                    <div className="form-group">
                        <div className="form-group-title">Gruppenanweisungen</div>
                        <p className="help-text">
                            Diese Anweisungen gelten für alle Gruppenmitglieder. Nur Admins können sie bearbeiten.
                        </p>

                        <div className="form-field-wrapper anweisungen-field">
                            <div className="anweisungen-header">
                                <label htmlFor={`groupCustomAntragPrompt-${groupId}`}>Anweisungen für Anträge:</label>
                                <div className="toggle-container">
                                    <input
                                        type="checkbox"
                                        id={`groupAntragToggle-${groupId}`}
                                        className="toggle-input"
                                        checked={isAntragPromptActive ?? false}
                                        onChange={(e) => handleInstructionsChange?.('isAntragPromptActive', e.target.checked)}
                                        disabled={!isAdmin || isSaving}
                                    />
                                    <label htmlFor={`groupAntragToggle-${groupId}`} className="toggle-label">
                                        <span className="toggle-text">{isAntragPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                                    </label>
                                </div>
                            </div>
                            <textarea
                                id={`groupCustomAntragPrompt-${groupId}`}
                                className="form-textarea anweisungen-textarea"
                                value={customAntragPrompt ?? ''}
                                onChange={(e) => handleInstructionsChange?.('customAntragPrompt', e.target.value)}
                                placeholder="Gib hier Anweisungen für die Erstellung von Anträgen ein..."
                                rows={6}
                                disabled={!isAdmin || isSaving}
                            />
                        </div>

                        <div className="form-field-wrapper anweisungen-field">
                            <div className="anweisungen-header">
                                <label htmlFor={`groupCustomSocialPrompt-${groupId}`}>Anweisungen für Social Media & Presse:</label>
                                <div className="toggle-container">
                                    <input
                                        type="checkbox"
                                        id={`groupSocialToggle-${groupId}`}
                                        className="toggle-input"
                                        checked={isSocialPromptActive ?? false}
                                        onChange={(e) => handleInstructionsChange?.('isSocialPromptActive', e.target.checked)}
                                        disabled={!isAdmin || isSaving}
                                    />
                                    <label htmlFor={`groupSocialToggle-${groupId}`} className="toggle-label">
                                        <span className="toggle-text">{isSocialPromptActive ? 'Aktiv' : 'Inaktiv'}</span>
                                    </label>
                                </div>
                            </div>
                            <textarea
                                id={`groupCustomSocialPrompt-${groupId}`}
                                className="form-textarea anweisungen-textarea"
                                value={customSocialPrompt ?? ''}
                                onChange={(e) => handleInstructionsChange?.('customSocialPrompt', e.target.value)}
                                placeholder="Gib hier Anweisungen für die Erstellung von Social Media Inhalten ein..."
                                rows={6}
                                disabled={!isAdmin || isSaving}
                            />
                        </div>
                    </div>

                    <hr className="form-divider-large" />

                    <div className="form-group knowledge-management-section">
                        <div className="form-group-title">Gruppenwissen</div>
                        <p className="help-text">
                            Hinterlege hier bis zu drei Wissensbausteine für die Gruppe. Nur Admins können sie bearbeiten.
                        </p>

                        {(knowledgeEntries ?? []).map((entry, index) => (
                            <div key={entry.id || `new-${index}`} className={`knowledge-entry ${index > 0 ? 'knowledge-entry-bordered' : ''}`}>
                                <div className="form-field-wrapper anweisungen-field">
                                    <div className="anweisungen-header">
                                        <label htmlFor={`group-knowledge-title-${entry.id || `new-${index}`}`}>Wissen #{index + 1}: Titel</label>
                                        {!(entry.isNew || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) && isAdmin && (
                                            <button
                                                type="button"
                                                onClick={() => handleKnowledgeDelete?.(entry.id)}
                                                className="knowledge-delete-button icon-button danger"
                                                disabled={isSaving || (isDeletingKnowledge && deletingKnowledgeId === entry.id)}
                                                aria-label={`Gruppenwissen ${index + 1} löschen`}
                                            >
                                                {(isDeletingKnowledge && deletingKnowledgeId === entry.id) ? <Spinner size="xsmall" /> : <HiOutlineTrash />}
                                            </button>
                                        )}
                                    </div>
                                    <TextInput
                                        id={`group-knowledge-title-${entry.id || `new-${index}`}`}
                                        type="text"
                                        value={entry.title ?? ''}
                                        onChange={(e) => handleKnowledgeChange?.(entry.id, 'title', e.target.value)}
                                        placeholder="Kurzer, prägnanter Titel"
                                        maxLength={100}
                                        disabled={!isAdmin || isSaving || isDeletingKnowledge}
                                        className="form-input"
                                    />
                                </div>
                                <div className="form-field-wrapper anweisungen-field">
                                    <label htmlFor={`group-knowledge-content-${entry.id || `new-${index}`}`} className="knowledge-content-label">Inhalt:</label>
                                    <textarea
                                        id={`group-knowledge-content-${entry.id || `new-${index}`}`}
                                        className="form-textarea anweisungen-textarea"
                                        value={entry.content ?? ''}
                                        onChange={(e) => handleKnowledgeChange?.(entry.id, 'content', e.target.value)}
                                        placeholder="Füge hier den Wissensinhalt ein..."
                                        rows={6}
                                        maxLength={GROUP_MAX_CONTENT_LENGTH ?? 1000}
                                        disabled={!isAdmin || isSaving || isDeletingKnowledge}
                                    />
                                    <p className="help-text character-count">
                                        {(entry.content?.length || 0)} / {GROUP_MAX_CONTENT_LENGTH ?? 1000} Zeichen
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {isAdmin && (
                        <div className="profile-actions anweisungen-actions">
                            <button
                                type="button"
                                className="profile-action-button profile-primary-button"
                                onClick={() => saveChanges?.()}
                                disabled={!hasUnsavedChanges || isSaving || isDeletingKnowledge}
                                aria-live="polite"
                            >
                                {isSaving ? <Spinner size="small" /> : 'Gruppenänderungen speichern'}
                            </button>
                            {isAdmin && (
                                <button
                                    type="button"
                                    className="profile-action-button profile-danger-button"
                                    onClick={handleDeleteGroup}
                                    disabled={isDeletingGroup || isSaving}
                                    style={{marginLeft: 'var(--spacing-medium)'}} // Add some space
                                >
                                    {isDeletingGroup ? <Spinner size="small" /> : 'Gruppe löschen'}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {showDeleteConfirm && (
                <div className="confirm-dialog-backdrop">
                    <div className="confirm-dialog-box">
                        <h3 className="confirm-dialog-title">Gruppe löschen bestätigen</h3>
                        <p className="confirm-dialog-message">
                            Bist du sicher, dass du die Gruppe "<strong>{groupInfo?.name}</strong>" endgültig löschen möchtest?
                            Alle zugehörigen Daten (Anweisungen, Wissen, Mitglieder) werden unwiderruflich entfernt.
                            Diese Aktion kann nicht rückgängig gemacht werden.
                        </p>
                        <div className="confirm-dialog-actions">
                            <button onClick={cancelDeleteGroup} className="profile-action-button" disabled={isDeletingGroup}>
                                Abbrechen
                            </button>
                            <button onClick={confirmDeleteGroup} className="profile-action-button profile-danger-button" disabled={isDeletingGroup} style={{marginLeft: 'var(--spacing-small)'}}>
                                {isDeletingGroup ? <Spinner size="small" /> : 'Endgültig löschen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Main component for the Groups Management Tab
const GroupsManagementTab = ({ user, templatesSupabase, onSuccessMessage, onErrorMessage }) => {
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [groupView, setGroupView] = useState('overview'); // Änderung von 'list' zu 'overview'
    const [newGroupName, setNewGroupName] = useState('');

    const { 
        userGroups, 
        isLoadingGroups, 
        isErrorGroups, 
        errorGroups, 
        createGroup,
        isCreatingGroup,
        isCreateGroupError,
        createGroupError,
        // For delete feedback & view reset
        isDeleteGroupSuccess, 
        deleteGroupError: rawDeleteGroupError, // use raw error to avoid conflict
        isDeletingGroup, // to potentially disable UI elements in parent
    } = useGroups();

    // Handle Group Creation Submit
    const handleCreateGroupSubmit = (e) => {
        e.preventDefault();
        if (!newGroupName.trim() || isCreatingGroup) return;
        onSuccessMessage(''); 
        onErrorMessage('');
        createGroup(newGroupName, {
          onSuccess: (newGroup) => { // Assuming createGroup resolves with the new group object or its ID
            const newGroupId = newGroup.id; // Adjust if API returns differently
            setSelectedGroupId(newGroupId);
            setGroupView('detail');
            setNewGroupName(''); 
            onSuccessMessage('Gruppe erfolgreich erstellt!');
          },
          onError: (error) => {
            onErrorMessage(error?.message || 'Gruppe konnte nicht erstellt werden.');
          }
        });
    };

    // Auto-select logic & handle group deletion side effects
    useEffect(() => {
        if (groupView === 'list' && !isLoadingGroups && userGroups) {
            if (userGroups.length === 1 && !selectedGroupId) {
                setSelectedGroupId(userGroups[0].id);
                setGroupView('detail');
            } else if (userGroups.length > 0 && !selectedGroupId) {
                setSelectedGroupId(userGroups[0].id);
                setGroupView('detail');
            } else if (userGroups.length === 0) {
                setSelectedGroupId(null); // Clear selected group if no groups left
                setGroupView('list');
            }
        }

        // Handle view update after successful group deletion
        if (isDeleteGroupSuccess && selectedGroupId) {
            // Check if the deleted group was the one selected
            const deletedGroupWasSelected = !userGroups || !userGroups.some(g => g.id === selectedGroupId);
            if (deletedGroupWasSelected) {
                onSuccessMessage('Gruppe erfolgreich gelöscht!'); // Keep success message from detail view or set new one
                if (userGroups && userGroups.length > 0) {
                    setSelectedGroupId(userGroups[0].id);
                    setGroupView('detail');
                } else {
                    setSelectedGroupId(null);
                    setGroupView('overview'); // Änderung von 'list' zu 'overview'
                }
            }
        } else if (rawDeleteGroupError && selectedGroupId) {
             // Error message is handled by GroupDetailView, but ensure view doesn't break
             // console.warn("Error during group deletion, check detail view for messages.")
        }

    }, [userGroups, isLoadingGroups, groupView, selectedGroupId, isDeleteGroupSuccess, rawDeleteGroupError, onSuccessMessage]);


    // Function to switch view
    const handleSelectGroup = (groupId) => {
        if (selectedGroupId !== groupId) {
            onSuccessMessage(''); // Clear messages when switching groups
            onErrorMessage('');
            setSelectedGroupId(groupId);
            setGroupView('detail'); // Ensure we are in detail view
        }
    };

    const handleCreateNew = () => {
        setGroupView('create');
        setSelectedGroupId(null);
        setNewGroupName('');
        onSuccessMessage('');
        onErrorMessage('');
    };

    // Back to list is less of a "view" and more of a state if no group is selected.
    // If create is cancelled, or if we want a dedicated "list overview" (though current logic auto-selects).
    const handleCancelCreate = () => {
        if (userGroups && userGroups.length > 0) {
            setSelectedGroupId(userGroups[0].id); // Go back to the first group or last selected
            setGroupView('detail');
        } else {
            setGroupView('overview'); // Änderung von 'list' zu 'overview'
        }
        onSuccessMessage('');
        onErrorMessage('');
    };

    // Handle switching to overview tab
    const handleOverviewTab = () => {
        setSelectedGroupId(null);
        setGroupView('overview');
        onSuccessMessage('');
        onErrorMessage('');
    };

    // Render Overview Tab
    const renderOverviewTab = () => (
        <div className="group-overview-container">
            <div className="group-content-card">
                <div className="group-info-panel">
                    <div className="group-header-section">
                        <div className="group-title-area">
                            <h2 className="profile-user-name" style={{ fontSize: '1.8rem' }}>Gruppenfunktion im Grünerator</h2>
                        </div>
                    </div>
                    
                    <div className="group-overview-content">
                        <section className="group-overview-section">
                            <h3>Was sind Gruppen?</h3>
                            <p>
                                Gruppen im Grünerator ermöglichen dir, gemeinsam mit anderen Mitgliedern an Texten und Materialien zu arbeiten.
                                Als virtueller Arbeitsbereich kannst du spezifische Anweisungen und Wissen für deine Gruppe hinterlegen.
                            </p>
                        </section>
                        
                        <section className="group-overview-section">
                            <h3>Was können Gruppen?</h3>
                            <ul>
                                <li>
                                    <strong>Gruppenanweisungen teilen:</strong> Lege spezifische Anweisungen für Anträge und Social-Media-Texte fest, 
                                    die allen Gruppenmitgliedern zur Verfügung stehen.
                                </li>
                                <li>
                                    <strong>Gemeinsames Wissen nutzen:</strong> Hinterlege bis zu drei Wissensbausteine mit spezifischem Wissen deiner Gruppe.
                                </li>
                                <li>
                                    <strong>Konsistente Kommunikation:</strong> Sorge für einheitliche Texte und Formulierungen innerhalb deiner Gruppe.
                                </li>
                                <li>
                                    <strong>Zusammenarbeit fördern:</strong> Lade andere über einen Einladungslink ein und arbeite gemeinsam an Inhalten.
                                </li>
                            </ul>
                        </section>
                        
                        <section className="group-overview-section">
                            <h3>Wie funktionieren Gruppen?</h3>
                            <p>
                                Nachdem du eine Gruppe erstellt hast, wirst du automatisch zum Admin. Als Admin kannst du:
                            </p>
                            <ul>
                                <li>Anweisungen für Anträge und Social Media festlegen und aktivieren</li>
                                <li>Wissensbausteine erstellen und bearbeiten</li>
                                <li>Andere Mitglieder über einen Einladungslink hinzufügen</li>
                            </ul>
                            <p>
                                Gruppenmitglieder können diese gemeinsamen Ressourcen beim Erstellen von Texten nutzen,
                                was zu einer einheitlichen und effizienten Kommunikation führt.
                            </p>
                        </section>

                        <div className="group-overview-cta">
                            {userGroups && userGroups.length > 0 ? (
                                <p>Du bist bereits Mitglied in {userGroups.length} Gruppe{userGroups.length > 1 ? 'n' : ''}. Wähle eine Gruppe aus der Seitenleiste oder erstelle eine neue.</p>
                            ) : (
                                <p>Du bist noch nicht Mitglied einer Gruppe. Erstelle jetzt deine erste Gruppe!</p>
                            )}
                            
                            <button
                                onClick={handleCreateNew}
                                className="profile-action-button profile-primary-button"
                                type="button"
                                disabled={isCreatingGroup || groupView === 'create'}
                            >
                                Neue Gruppe erstellen
                                <HiPlus style={{marginLeft: 'var(--spacing-xsmall)'}} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    // Render Navigation Panel (Left Column)
    const renderNavigationPanel = () => (
        <div className="groups-vertical-navigation"> {/* Class for CSS styling */}
            <button
                className={`groups-vertical-tab ${groupView === 'overview' ? 'active' : ''}`}
                onClick={handleOverviewTab}
                disabled={groupView === 'create'}
            >
                Übersicht
            </button>
            
            {userGroups && userGroups.length > 0 && (
                <nav className="groups-vertical-tabs" aria-label="Gruppen Navigation">
                    {userGroups.map(group => (
                        <button
                            key={group.id}
                            className={`groups-vertical-tab ${selectedGroupId === group.id && groupView === 'detail' ? 'active' : ''}`}
                            onClick={() => handleSelectGroup(group.id)}
                            disabled={groupView === 'create'} // Disable tabs when in create mode
                        >
                            {group.name}
                        </button>
                    ))}
                </nav>
            )}

            <button
                onClick={handleCreateNew}
                className="groups-action-button create-new-group-button" // Style as prominent button
                type="button"
                disabled={isCreatingGroup || groupView === 'create'} // Disable if already in create mode
            >
                Neu
                <HiPlus />
            </button>
        </div>
    );

    // Render Content Panel (Right Column)
    const renderContentPanel = () => {
        if (isLoadingGroups) {
            return (
                <div className="loading-container" style={{padding: 'var(--spacing-xlarge)'}}>
                    <Spinner size="large" />
                    <p>Lade Gruppen...</p>
                </div>
            );
        }

        if (isErrorGroups) {
            return (
                <div className="auth-error-message" style={{padding: 'var(--spacing-large)'}}>
                    Fehler beim Laden der Gruppen: {errorGroups?.message || 'Unbekannter Fehler'}
                </div>
            );
        }

        if (groupView === 'overview') {
            return renderOverviewTab();
        }

        if (groupView === 'create') {
            return (
                <div className="create-group-form-container">
                    {/* Removed profile-avatar-section and profile-form-section wrappers */}
                    <form className="auth-form" onSubmit={handleCreateGroupSubmit}>
                        <div className="form-group">
                            <h2 className="form-group-title" style={{fontSize: '1.8rem'}}>Neue Gruppe erstellen</h2>
                            <p>Erstelle eine neue Gruppe, um Anweisungen und Wissen mit anderen zu teilen. Als Ersteller wirst du automatisch Admin.</p>
                            {isCreateGroupError && (
                            <div className="auth-error-message">
                                Fehler: {createGroupError?.message || 'Gruppe konnte nicht erstellt werden.'}
                            </div>
                            )}
                            <div className="form-field-wrapper" style={{marginTop: 'var(--spacing-large)'}}>
                            <label htmlFor="newGroupName">Gruppenname:</label>
                            <TextInput
                                id="newGroupName"
                                value={newGroupName}
                                onChange={(e) => setNewGroupName(e.target.value)}
                                placeholder="z.B. OV Musterdorf, LAG Digitales"
                                aria-required="true"
                                required
                                disabled={isCreatingGroup}
                            />
                            </div>
                        </div>
                        <div className="profile-actions" style={{marginTop: 'var(--spacing-large)'}}>
                            <button
                                type="button"
                                className="profile-action-button"
                                onClick={handleCancelCreate}
                                disabled={isCreatingGroup}
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className="profile-action-button profile-primary-button"
                                disabled={isCreatingGroup || !newGroupName.trim()}
                                aria-live="polite"
                            >
                                {isCreatingGroup ? <Spinner size="small" /> : 'Gruppe erstellen'}
                            </button>
                        </div>
                    </form>
                </div>
            );
        }

        if (selectedGroupId && groupView === 'detail') {
            return (
                <GroupDetailView
                    groupId={selectedGroupId}
                    templatesSupabase={templatesSupabase}
                    // onBackToList is removed as navigation is persistent
                    onSuccessMessage={onSuccessMessage} // Pass down for internal feedback
                    onErrorMessage={onErrorMessage}   // Pass down for internal feedback
                />
            );
        }
        
        // Fallback für 'list' view - jetzt zur Übersicht umleiten
        return renderOverviewTab();
    };
    

    // Main layout uses .profile-content for the grid
    return (
        <div className="profile-content groups-management-layout"> {/* Added groups-management-layout for specific styling */}
            {/* Left Column for Navigation */}
            <div className="groups-navigation-panel"> {/* Use profile-avatar-section if its base styles are suitable, or this new class */}
                {renderNavigationPanel()}
            </div>

            {/* Right Column for Content */}
            <div className="groups-content-panel profile-form-section"> {/* Re-using profile-form-section for consistent padding/styling */}
                {renderContentPanel()}
            </div>
        </div>
    );
};

export default GroupsManagementTab; 