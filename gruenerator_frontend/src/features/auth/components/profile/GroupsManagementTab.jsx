import React, { useState, useEffect, useRef } from 'react';
import { HiOutlineTrash, HiPlus, HiLink, HiInformationCircle } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import TextInput from '../../../../components/common/Form/Input/TextInput';
import GroupList from '../../../../features/groups/components/GroupList';
import useGroups from '../../../../features/groups/hooks/useGroups';
import useGroupDetails from '../../../../features/groups/hooks/useGroupDetails';
import { useProfileResourceManager } from '../../utils/profileUtils';
import { autoResizeTextarea } from '../../utils/profileUtils';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import { motion } from "motion/react";

// Helper function for group initials
const getGroupInitials = (groupName) => {
    if (!groupName) return 'G';
    
    if (!groupName.includes(' ')) {
        return groupName.substring(0, 2).toUpperCase();
    }
    
    const words = groupName.split(' ');
    return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
};

// Component for the Group Detail View
const GroupDetailView = ({ 
    groupId, 
    onBackToList,
    onSuccessMessage, 
    onErrorMessage,
    isActive
}) => {
    const { templatesSupabase } = useProfileResourceManager();
    
    const { 
        groupInfo, 
        joinToken, 
        isAdmin, 
        customAntragPrompt, 
        customSocialPrompt, 
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
    } = useGroupDetails(groupId, { isActive });
    
    const { 
        deleteGroup, 
        isDeletingGroup, 
    } = useGroups({ isActive });

    const [showJoinLink, setShowJoinLink] = useState(false);
    const [joinLinkCopied, setJoinLinkCopied] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Refs for textareas
    const antragTextareaRef = useRef(null);
    const socialTextareaRef = useRef(null);
    const knowledgeTextareaRefs = useRef({});

    // Effect for save/delete feedback
    useEffect(() => {
        if (isSaveSuccess) {
            onSuccessMessage('Gruppenänderungen erfolgreich gespeichert!');
        } else if (isSaveError) {
            const message = saveError instanceof Error ? saveError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Speichern (Gruppe): ${message}`);
        } else if (isDeleteKnowledgeError) {
            const message = deleteKnowledgeError instanceof Error ? deleteKnowledgeError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Löschen (Gruppenwissen): ${message}`);
        }
    }, [isSaveSuccess, isSaveError, saveError, isDeleteKnowledgeError, deleteKnowledgeError, onSuccessMessage, onErrorMessage]);

    // Auto-resize effect for textareas
    useEffect(() => {
        if (antragTextareaRef.current) {
            autoResizeTextarea(antragTextareaRef.current);
        }
        if (socialTextareaRef.current) {
            autoResizeTextarea(socialTextareaRef.current);
        }
        
        Object.values(knowledgeTextareaRefs.current).forEach(ref => {
            if (ref) autoResizeTextarea(ref);
        });
    }, [customAntragPrompt, customSocialPrompt, knowledgeEntries]);

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

    if (isErrorDetails) {
        return (
            <>
                <div className="auth-error-message">
                    Fehler beim Laden der Gruppendetails: {errorDetails?.message || 'Unbekannter Fehler'}
                </div>
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
        <motion.div 
            className="group-detail-cards-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="group-content-card">
                <div className="group-info-panel"> 
                    <div className="group-header-section"> 
                        <div className="group-title-area"> 
                            <div className="group-title-line">
                                <h2 className="profile-user-name large-profile-title">{groupInfo?.name}</h2>
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

                    {isAdmin && joinToken && (
                        <div className="join-link-section">
                            <div className="join-link-display">
                                <div className="join-link-label">
                                    <HiInformationCircle className="info-icon-inline" />
                                    Einladungslink für neue Mitglieder:
                                </div>
                                <div className="join-link-url" title={getJoinUrl()}>
                                    {getJoinUrl()}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="group-content-card">
                <div className="group-instructions-section">
                    <div className="group-section-header">
                        <h3 className="group-section-title">Gruppenanweisungen</h3>
                        {isAdmin && (
                            <div className="group-save-actions">
                                <button 
                                    onClick={saveChanges} 
                                    className="profile-action-button profile-primary-button"
                                    disabled={isSaving || !hasUnsavedChanges}
                                >
                                    {isSaving ? <Spinner size="small" /> : 'Speichern'}
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="group-instructions-grid">
                        <div className="group-instruction-card">
                            <div className="instruction-card-header">
                                <h4>Anträge</h4>
                                {isAdmin ? (
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={groupInfo?.antrag_instructions_enabled || false}
                                            onChange={(e) => handleInstructionsChange('antrag_instructions_enabled', e.target.checked)}
                                            disabled={isSaving}
                                        />
                                        Aktiv
                                    </label>
                                ) : (
                                    <span className={`status-badge ${groupInfo?.antrag_instructions_enabled ? 'active' : 'inactive'}`}>
                                        {groupInfo?.antrag_instructions_enabled ? 'Aktiv' : 'Inaktiv'}
                                    </span>
                                )}
                            </div>
                            <div className="instruction-content">
                                {isAdmin ? (
                                    <textarea
                                        ref={antragTextareaRef}
                                        value={customAntragPrompt}
                                        onChange={(e) => handleInstructionsChange('custom_antrag_prompt', e.target.value)}
                                        placeholder="Spezifische Anweisungen für Anträge..."
                                        className="group-instruction-textarea"
                                        disabled={isSaving}
                                        maxLength={GROUP_MAX_CONTENT_LENGTH}
                                        onInput={(e) => autoResizeTextarea(e.target)}
                                    />
                                ) : (
                                    <div className="instruction-display">
                                        {customAntragPrompt || 'Keine spezifischen Anweisungen für Anträge.'}
                                    </div>
                                )}
                                <div className="character-count">
                                    {customAntragPrompt?.length || 0} / {GROUP_MAX_CONTENT_LENGTH}
                                </div>
                            </div>
                        </div>

                        <div className="group-instruction-card">
                            <div className="instruction-card-header">
                                <h4>Social Media</h4>
                                {isAdmin ? (
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={groupInfo?.social_instructions_enabled || false}
                                            onChange={(e) => handleInstructionsChange('social_instructions_enabled', e.target.checked)}
                                            disabled={isSaving}
                                        />
                                        Aktiv
                                    </label>
                                ) : (
                                    <span className={`status-badge ${groupInfo?.social_instructions_enabled ? 'active' : 'inactive'}`}>
                                        {groupInfo?.social_instructions_enabled ? 'Aktiv' : 'Inaktiv'}
                                    </span>
                                )}
                            </div>
                            <div className="instruction-content">
                                {isAdmin ? (
                                    <textarea
                                        ref={socialTextareaRef}
                                        value={customSocialPrompt}
                                        onChange={(e) => handleInstructionsChange('custom_social_prompt', e.target.value)}
                                        placeholder="Spezifische Anweisungen für Social Media..."
                                        className="group-instruction-textarea"
                                        disabled={isSaving}
                                        maxLength={GROUP_MAX_CONTENT_LENGTH}
                                        onInput={(e) => autoResizeTextarea(e.target)}
                                    />
                                ) : (
                                    <div className="instruction-display">
                                        {customSocialPrompt || 'Keine spezifischen Anweisungen für Social Media.'}
                                    </div>
                                )}
                                <div className="character-count">
                                    {customSocialPrompt?.length || 0} / {GROUP_MAX_CONTENT_LENGTH}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="group-content-card">
                <div className="group-knowledge-section">
                    <div className="group-section-header">
                        <h3 className="group-section-title">Gruppenwissen</h3>
                        {isAdmin && knowledgeEntries.length < 3 && (
                            <button 
                                onClick={() => handleKnowledgeChange(null, '', 'add')} 
                                className="profile-action-button"
                                disabled={isSaving}
                            >
                                <HiPlus /> Wissen hinzufügen
                            </button>
                        )}
                    </div>

                    {knowledgeEntries.length === 0 ? (
                        <div className="knowledge-empty-state">
                            <p>Noch kein Gruppenwissen vorhanden.</p>
                            {!isAdmin && <p>Nur Admins können Gruppenwissen hinzufügen.</p>}
                        </div>
                    ) : (
                        <div className="knowledge-entries">
                            {knowledgeEntries.map((entry, index) => (
                                <div key={entry.id || index} className="knowledge-entry">
                                    <div className="knowledge-entry-header">
                                        <span className="knowledge-entry-number">#{index + 1}</span>
                                        {isAdmin && (
                                            <button
                                                onClick={() => handleKnowledgeDelete(entry.id)}
                                                className="delete-knowledge-button"
                                                disabled={isDeletingKnowledge && deletingKnowledgeId === entry.id}
                                                title="Wissen löschen"
                                            >
                                                {isDeletingKnowledge && deletingKnowledgeId === entry.id ? 
                                                    <Spinner size="small" /> : <HiOutlineTrash />
                                                }
                                            </button>
                                        )}
                                    </div>
                                    <div className="knowledge-entry-content">
                                        {isAdmin ? (
                                            <textarea
                                                ref={el => knowledgeTextareaRefs.current[entry.id] = el}
                                                value={entry.content}
                                                onChange={(e) => handleKnowledgeChange(entry.id, e.target.value, 'update')}
                                                placeholder="Gruppenwissen eingeben..."
                                                className="knowledge-textarea"
                                                disabled={isSaving}
                                                maxLength={GROUP_MAX_CONTENT_LENGTH}
                                                onInput={(e) => autoResizeTextarea(e.target)}
                                            />
                                        ) : (
                                            <div className="knowledge-display">
                                                {entry.content || 'Kein Inhalt vorhanden.'}
                                            </div>
                                        )}
                                        <div className="character-count">
                                            {entry.content?.length || 0} / {GROUP_MAX_CONTENT_LENGTH}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isAdmin && (
                <div className="group-content-card">
                    <div className="group-danger-zone">
                        <h3 className="group-section-title error-section-title">
                            Gruppe löschen
                        </h3>
                        <p className="danger-zone-description">
                            Das Löschen der Gruppe ist unwiderruflich. Alle Gruppeninhalte und -mitgliedschaften werden permanent entfernt.
                        </p>
                        <button 
                            onClick={handleDeleteGroup}
                            className="profile-action-button profile-danger-button"
                            disabled={isDeletingGroup || isSaving}
                        >
                            {isDeletingGroup ? <Spinner size="small" /> : 'Gruppe löschen'}
                        </button>
                    </div>
                </div>
            )}

            {showDeleteConfirm && (
                <div className="modal-overlay">
                    <div className="confirm-dialog">
                        <h3>Gruppe wirklich löschen?</h3>
                        <p>
                            Die Gruppe "{groupInfo?.name}" wird unwiderruflich gelöscht.
                            Diese Aktion kann nicht rückgängig gemacht werden.
                        </p>
                        <div className="confirm-dialog-actions">
                            <button onClick={cancelDeleteGroup} className="profile-action-button" disabled={isDeletingGroup}>
                                Abbrechen
                            </button>
                            <button onClick={confirmDeleteGroup} className="profile-action-button profile-danger-button danger-button-spaced" disabled={isDeletingGroup}>
                                {isDeletingGroup ? <Spinner size="small" /> : 'Endgültig löschen'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </motion.div>
    );
};

// Main component for the Groups Management Tab
const GroupsManagementTab = ({ user, onSuccessMessage, onErrorMessage, isActive }) => {
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [groupView, setGroupView] = useState('overview');
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
        isDeleteGroupSuccess, 
        deleteGroupError: rawDeleteGroupError,
        isDeletingGroup,
    } = useGroups({ isActive });

    // Handle Group Creation Submit
    const handleCreateGroupSubmit = (e) => {
        e.preventDefault();
        if (!newGroupName.trim() || isCreatingGroup) return;
        onSuccessMessage(''); 
        onErrorMessage('');
        createGroup(newGroupName, {
          onSuccess: (newGroup) => {
            const newGroupId = newGroup.id;
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
        if (groupView === 'list' && userGroups) {
            if (userGroups.length === 1 && !selectedGroupId) {
                setSelectedGroupId(userGroups[0].id);
                setGroupView('detail');
            } else if (userGroups.length > 0 && !selectedGroupId) {
                setSelectedGroupId(userGroups[0].id);
                setGroupView('detail');
            } else if (userGroups.length === 0) {
                setSelectedGroupId(null);
                setGroupView('list');
            }
        }

        // Handle view update after successful group deletion
        if (isDeleteGroupSuccess && selectedGroupId) {
            const deletedGroupWasSelected = !userGroups || !userGroups.some(g => g.id === selectedGroupId);
            if (deletedGroupWasSelected) {
                onSuccessMessage('Gruppe erfolgreich gelöscht!');
                if (userGroups && userGroups.length > 0) {
                    setSelectedGroupId(userGroups[0].id);
                    setGroupView('detail');
                } else {
                    setSelectedGroupId(null);
                    setGroupView('overview');
                }
            }
        }
    }, [userGroups, groupView, selectedGroupId, isDeleteGroupSuccess, rawDeleteGroupError, onSuccessMessage]);

    // Function to switch view
    const handleSelectGroup = (groupId) => {
        if (selectedGroupId !== groupId) {
            onSuccessMessage('');
            onErrorMessage('');
            setSelectedGroupId(groupId);
            setGroupView('detail');
        }
    };

    const handleCreateNew = () => {
        setGroupView('create');
        setSelectedGroupId(null);
        setNewGroupName('');
        onSuccessMessage('');
        onErrorMessage('');
    };

    const handleCancelCreate = () => {
        if (userGroups && userGroups.length > 0) {
            setSelectedGroupId(userGroups[0].id);
            setGroupView('detail');
        } else {
            setGroupView('overview');
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
        <motion.div 
            className="group-overview-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="group-content-card">
                <div className="group-info-panel">
                    <div className="group-header-section">
                        <div className="group-title-area">
                            <div className="header-with-help">
                                <h2 className="profile-user-name large-profile-title">Gruppenfunktion im Grünerator</h2>
                                <HelpTooltip>
                                    <p>
                                        Mit Gruppen kannst du Anweisungen und Wissen mit anderen teilen und gemeinsam nutzen.
                                    </p>
                                    <p>
                                        <strong>Tipp:</strong> Erstelle eine Gruppe für deinen Verband oder dein Team und lade andere über den Join-Link ein.
                                    </p>
                                </HelpTooltip>
                            </div>
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
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );

    // Render Navigation Panel
    const renderNavigationPanel = () => (
        <div className="group-navigation-panel">
            <div className="group-nav-header">
                <button 
                    onClick={handleOverviewTab} 
                    className={`nav-tab-button ${groupView === 'overview' ? 'active' : ''}`}
                >
                    Übersicht
                </button>
                <button 
                    onClick={handleCreateNew} 
                    className="create-group-button"
                    disabled={isCreatingGroup}
                >
                    <HiPlus /> Gruppe erstellen
                </button>
            </div>

            {isLoadingGroups ? (
                <div className="groups-loading">
                    <Spinner size="medium" />
                    <p>Lade Gruppen...</p>
                </div>
            ) : isErrorGroups ? (
                <div className="groups-error">
                    <p>Fehler beim Laden der Gruppen: {errorGroups?.message}</p>
                </div>
            ) : (
                <div className="groups-list">
                    {userGroups && userGroups.length > 0 ? (
                        <GroupList 
                            groups={userGroups} 
                            selectedGroupId={selectedGroupId}
                            onSelectGroup={handleSelectGroup}
                            getGroupInitials={getGroupInitials}
                        />
                    ) : (
                        <div className="no-groups-message">
                            <p>Keine Gruppen gefunden</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    // Render Content Panel
    const renderContentPanel = () => {
        if (groupView === 'overview') {
            return renderOverviewTab();
        }

        if (groupView === 'create') {
            return (
                <motion.div 
                    className="group-create-container"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                >
                    <div className="group-content-card">
                        <div className="group-info-panel">
                            <div className="group-header-section">
                                <div className="group-title-area">
                                    <h2 className="profile-user-name large-profile-title">Neue Gruppe erstellen</h2>
                                </div>
                            </div>
                            
                            {isCreateGroupError && (
                                <div className="auth-error-message error-margin">
                                    {createGroupError?.message || 'Fehler beim Erstellen der Gruppe'}
                                </div>
                            )}
                            
                            <form onSubmit={handleCreateGroupSubmit} className="auth-form">
                                <div className="form-group">
                                    <div className="form-field-wrapper">
                                        <label htmlFor="groupName">Gruppenname:</label>
                                        <TextInput
                                            id="groupName"
                                            type="text"
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            placeholder="Name der neuen Gruppe"
                                            required
                                            disabled={isCreatingGroup}
                                            maxLength={100}
                                        />
                                    </div>
                                </div>
                                <div className="profile-actions">
                                    <button 
                                        type="submit" 
                                        className="profile-action-button profile-primary-button"
                                        disabled={isCreatingGroup || !newGroupName.trim()}
                                    >
                                        {isCreatingGroup ? <Spinner size="small" /> : 'Gruppe erstellen'}
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={handleCancelCreate}
                                        className="profile-action-button"
                                        disabled={isCreatingGroup}
                                    >
                                        Abbrechen
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </motion.div>
            );
        }

        if (groupView === 'detail' && selectedGroupId) {
            return (
                <GroupDetailView 
                    groupId={selectedGroupId}
                    onBackToList={() => setGroupView('overview')}
                    onSuccessMessage={onSuccessMessage}
                    onErrorMessage={onErrorMessage}
                    isActive={isActive}
                />
            );
        }

        return renderOverviewTab();
    };

    return (
        <motion.div 
            className="groups-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            {renderNavigationPanel()}
            <div className="group-content-area">
                {renderContentPanel()}
            </div>
        </motion.div>
    );
};

export default GroupsManagementTab; 