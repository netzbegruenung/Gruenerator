import React, { useState, useEffect, useRef } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { HiOutlineTrash, HiPlus, HiLink, HiInformationCircle, HiPencil, HiCheck, HiX } from 'react-icons/hi';
import Spinner from '../../../../components/common/Spinner';
import { useGroups, getGroupInitials } from '../../utils/groupsUtils';
import useGroupDetails from '../../../../features/groups/hooks/useGroupDetails';
import { autoResizeTextarea } from '../../utils/profileUtils';
import { useFormFields } from '../../../../components/common/Form/hooks';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import DeleteWarningTooltip from '../../../../components/common/DeleteWarningTooltip';
import GroupMembersList from './GroupMembersList';
import { motion } from "motion/react";

// Helper function moved to groupsUtils.js

// Component for the Group Detail View
const GroupDetailView = ({ 
    groupId, 
    onSuccessMessage, 
    onErrorMessage,
    isActive,
    currentView = 'anweisungen'
}) => {
    // State for editing group name and description
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedGroupName, setEditedGroupName] = useState('');
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedGroupDescription, setEditedGroupDescription] = useState('');
    // React Hook Form setup for group details
    const formMethods = useForm({
        defaultValues: {
            customAntragPrompt: '',
            customSocialPrompt: '',
            knowledge: []
        },
        mode: 'onChange'
    });
    
    const { control, reset, getValues } = formMethods;
    const { fields, append, remove } = useFieldArray({ 
        control, 
        name: "knowledge",
        keyName: "key"
    });
    const { Input, Textarea } = useFormFields();
    
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
        isErrorDetails, 
        errorDetails,
        hasUnsavedChanges,
        MAX_CONTENT_LENGTH: GROUP_MAX_CONTENT_LENGTH 
    } = useGroupDetails(groupId, { isActive });
    
    const { 
        deleteGroup, 
        isDeletingGroup,
        updateGroupName,
        updateGroupInfo,
        isUpdatingGroupName,
        isUpdateGroupNameError,
        updateGroupNameError 
    } = useGroups({ isActive });

    const [joinLinkCopied, setJoinLinkCopied] = useState(false);

    // Refs for textareas
    const antragTextareaRef = useRef(null);
    const socialTextareaRef = useRef(null);
    const knowledgeTextareaRefs = useRef({});

    // Initialize form when group data loads
    useEffect(() => {
        if (groupInfo) {
            reset({
                customAntragPrompt: customAntragPrompt || '',
                customSocialPrompt: customSocialPrompt || '',
                knowledge: knowledgeEntries || []
            });
            setEditedGroupName(groupInfo.name || '');
            setEditedGroupDescription(groupInfo.description || '');
        }
    }, [groupInfo, customAntragPrompt, customSocialPrompt, knowledgeEntries, reset]);

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

    const confirmDeleteGroup = () => {
        if (!groupId || !isAdmin) return;
        
        onSuccessMessage('');
        onErrorMessage('');
        deleteGroup(groupId, {
            onSuccess: () => {
                onSuccessMessage('Gruppe erfolgreich gelöscht!');
            },
            onError: (error) => {
                onErrorMessage(`Fehler beim Löschen der Gruppe: ${error.message}`);
            }
        });
    };

    const handleFormSave = () => {
        const formData = getValues();
        const changes = {
            custom_antrag_prompt: formData.customAntragPrompt,
            custom_social_prompt: formData.customSocialPrompt
        };
        
        // Handle form save through existing save mechanism
        Object.entries(changes).forEach(([key, value]) => {
            handleInstructionsChange(key, value);
        });
        
        saveChanges();
    };

    const handleDeleteKnowledge = (entry, index) => {
        if (!entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) {
            remove(index);
        } else {
            if (window.confirm("Möchtest du diesen Wissenseintrag wirklich löschen?")) {
                handleKnowledgeDelete(entry.id);
            }
        }
    };

    const handleAddKnowledge = () => {
        if (fields.length < 3) {
            append({ id: `new-${Date.now()}`, title: '', content: '' });
        }
    };

    // Group name editing functions
    const startEditingName = () => {
        if (isAdmin) {
            setIsEditingName(true);
            setEditedGroupName(groupInfo?.name || '');
        }
    };

    const cancelEditingName = () => {
        setIsEditingName(false);
        setEditedGroupName(groupInfo?.name || '');
    };

    const saveGroupName = async () => {
        if (!editedGroupName.trim() || editedGroupName === groupInfo?.name) {
            cancelEditingName();
            return;
        }

        updateGroupName(groupId, editedGroupName.trim(), {
            onSuccess: () => {
                setIsEditingName(false);
                onSuccessMessage('Gruppenname erfolgreich geändert!');
            },
            onError: (error) => {
                onErrorMessage('Fehler beim Ändern des Gruppennamens: ' + error.message);
                setEditedGroupName(groupInfo?.name || '');
            }
        });
    };

    // Group description editing functions
    const startEditingDescription = () => {
        if (isAdmin) {
            setIsEditingDescription(true);
            setEditedGroupDescription(groupInfo?.description || '');
        }
    };

    const cancelEditingDescription = () => {
        setIsEditingDescription(false);
        setEditedGroupDescription(groupInfo?.description || '');
    };

    const saveGroupDescription = async () => {
        if (editedGroupDescription === (groupInfo?.description || '')) {
            cancelEditingDescription();
            return;
        }

        updateGroupInfo(groupId, { description: editedGroupDescription }, {
            onSuccess: () => {
                setIsEditingDescription(false);
                onSuccessMessage('Gruppenbeschreibung erfolgreich geändert!');
            },
            onError: (error) => {
                onErrorMessage('Fehler beim Ändern der Gruppenbeschreibung: ' + error.message);
                setEditedGroupDescription(groupInfo?.description || '');
            }
        });
    };

    // Render Group Header
    const renderGroupHeader = () => (
        <div className="group-content-card">
            <div className="group-info-panel"> 
                <div className="group-header-section"> 
                    <div className="group-title-area"> 
                        <div className="group-title-line">
                            {isEditingName ? (
                                <div className="group-name-edit-container">
                                    <input
                                        type="text"
                                        value={editedGroupName}
                                        onChange={(e) => setEditedGroupName(e.target.value)}
                                        className="group-name-edit-input"
                                        maxLength={100}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveGroupName();
                                            if (e.key === 'Escape') cancelEditingName();
                                        }}
                                        autoFocus
                                    />
                                    <div className="group-name-edit-actions">
                                        <button
                                            onClick={saveGroupName}
                                            className="group-name-edit-button save"
                                            disabled={!editedGroupName.trim() || isUpdatingGroupName}
                                            title="Speichern"
                                        >
                                            <HiCheck />
                                        </button>
                                        <button
                                            onClick={cancelEditingName}
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
                                    <h2 className="profile-user-name large-profile-title">{groupInfo?.name}</h2>
                                    {isAdmin && (
                                        <button
                                            onClick={startEditingName}
                                            className="group-name-edit-icon"
                                            title="Gruppenname bearbeiten"
                                            disabled={isUpdatingGroupName}
                                        >
                                            <HiPencil />
                                        </button>
                                    )}
                                </>
                            )}
                            {isAdmin && <span className="admin-badge">Admin</span>}
                        </div>
                        {!isAdmin && (
                            <p className="group-membership-status">
                                Du bist Mitglied dieser Gruppe
                            </p>
                        )}
                    </div>
                    {isAdmin && (
                        <DeleteWarningTooltip
                            onConfirm={confirmDeleteGroup}
                            disabled={isDeletingGroup || isUpdatingGroupName}
                            title="Gruppe löschen"
                            message="Die gesamte Gruppe wird für alle Mitglieder unwiderruflich gelöscht. Alle Gruppeninhalte und -mitgliedschaften werden permanent entfernt."
                            confirmText="Endgültig löschen"
                            cancelText="Abbrechen"
                        />
                    )}
                </div>

                {isAdmin && joinToken && (
                    <div className="join-link-section">
                        <div className="join-link-display">
                            <div className="join-link-label">
                                <HiInformationCircle className="info-icon-inline" />
                                Einladungslink für neue Mitglieder:
                            </div>
                            <div className="join-link-url-container">
                                <div className="join-link-url" title={getJoinUrl()}>
                                    {getJoinUrl()}
                                </div>
                                <button
                                    onClick={copyJoinLink}
                                    className="copy-join-link-button-inline"
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
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Render Group Info Tab
    const renderGroupInfoTab = () => (
        <>
            {renderGroupHeader()}
            
            {/* Group Description Section */}
            <div className="group-content-card">
                <div className="group-section-header">
                    <h4 className="group-section-title">Gruppenbeschreibung</h4>
                    {isAdmin && !isEditingDescription && (
                        <button
                            onClick={startEditingDescription}
                            className="group-name-edit-icon"
                            title="Beschreibung bearbeiten"
                            disabled={isUpdatingGroupName}
                        >
                            <HiPencil />
                        </button>
                    )}
                </div>
                
                {isEditingDescription ? (
                    <div className="form-field-wrapper">
                        <textarea
                            value={editedGroupDescription}
                            onChange={(e) => setEditedGroupDescription(e.target.value)}
                            className="form-textarea"
                            placeholder="Beschreibung der Gruppe (optional)..."
                            rows={4}
                            maxLength={500}
                            disabled={isUpdatingGroupName}
                        />
                        <div className="character-count">
                            {editedGroupDescription.length}/500 Zeichen
                        </div>
                        <div className="group-name-edit-actions" style={{ marginTop: 'var(--spacing-small)' }}>
                            <button
                                onClick={saveGroupDescription}
                                className="group-name-edit-button save"
                                disabled={isUpdatingGroupName}
                                title="Speichern"
                            >
                                <HiCheck />
                            </button>
                            <button
                                onClick={cancelEditingDescription}
                                className="group-name-edit-button cancel"
                                disabled={isUpdatingGroupName}
                                title="Abbrechen"
                            >
                                <HiX />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="form-field-wrapper">
                        {groupInfo?.description ? (
                            <div className="knowledge-display" style={{ whiteSpace: 'pre-wrap' }}>
                                {groupInfo.description}
                            </div>
                        ) : (
                            <div className="knowledge-display" style={{ fontStyle: 'italic', color: 'var(--font-color-subtle)' }}>
                                {isAdmin ? 'Keine Beschreibung vorhanden. Klicke auf das Bearbeiten-Symbol, um eine hinzuzufügen.' : 'Keine Beschreibung vorhanden.'}
                            </div>
                        )}
                    </div>
                )}
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

    // Render Instructions Tab
    const renderInstructionsTab = () => (
        <>
            <div className="group-content-card">
                <div className="group-instructions-section">
                    <div className="group-section-header">
                        <h3 className="group-section-title">Gruppenanweisungen</h3>
                        <div className="form-help-text">
                            {isSaving ? 'Wird gespeichert...' : 'Änderungen werden automatisch gespeichert'}
                        </div>
                    </div>

                    <div className="group-instructions-grid">
                        <div className="group-instruction-card">
                            <div className="instruction-card-header">
                                <h4>Anträge</h4>
                            </div>
                            <div className="instruction-content">
                                {isAdmin ? (
                                    <FormProvider {...formMethods}>
                                        <Textarea
                                            name="customAntragPrompt"
                                            placeholder="Spezifische Anweisungen für Anträge..."
                                            className="group-instruction-textarea"
                                            disabled={isSaving}
                                            maxLength={GROUP_MAX_CONTENT_LENGTH}
                                            showCharacterCount={true}
                                            minRows={3}
                                            maxRows={8}
                                            control={control}
                                            onChange={(value) => handleInstructionsChange('custom_antrag_prompt', value)}
                                        />
                                    </FormProvider>
                                ) : (
                                    <div className="instruction-display">
                                        {customAntragPrompt || 'Keine spezifischen Anweisungen für Anträge.'}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="group-instruction-card">
                            <div className="instruction-card-header">
                                <h4>Social Media</h4>
                            </div>
                            <div className="instruction-content">
                                {isAdmin ? (
                                    <FormProvider {...formMethods}>
                                        <Textarea
                                            name="customSocialPrompt"
                                            placeholder="Spezifische Anweisungen für Social Media..."
                                            className="group-instruction-textarea"
                                            disabled={isSaving}
                                            maxLength={GROUP_MAX_CONTENT_LENGTH}
                                            showCharacterCount={true}
                                            minRows={3}
                                            maxRows={8}
                                            control={control}
                                            onChange={(value) => handleInstructionsChange('custom_social_prompt', value)}
                                        />
                                    </FormProvider>
                                ) : (
                                    <div className="instruction-display">
                                        {customSocialPrompt || 'Keine spezifischen Anweisungen für Social Media.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    // Render Knowledge Tab
    const renderKnowledgeTab = () => (
        <>
            <div className="group-content-card">
                <FormProvider {...formMethods}>
                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h3>Gruppenwissen</h3>
                            {isAdmin && (
                                <button
                                    type="button"
                                    className="btn-primary size-s"
                                    onClick={handleAddKnowledge}
                                    disabled={isSaving || isDeletingKnowledge || fields.length >= 3}
                                >
                                    <HiPlus className="icon" /> Wissen hinzufügen
                                </button>
                            )}
                        </div>
                        <div className="profile-card-content">
                            {fields.length === 0 && (
                                <div className="knowledge-empty-state centered">
                                    <p>Noch kein Gruppenwissen vorhanden.</p>
                                    {isAdmin ? (
                                        <p>
                                            Klicke auf "Wissen hinzufügen", um wiederkehrende Informationen zu speichern.
                                        </p>
                                    ) : (
                                        <p>Nur Admins können Gruppenwissen hinzufügen.</p>
                                    )}
                                </div>
                            )}

                            {fields.map((field, index) => (
                                <div key={field.key} className={`knowledge-entry ${index > 0 ? 'knowledge-entry-bordered' : ''}`}>
                                    <div className="form-field-wrapper anweisungen-field">
                                        <div className="anweisungen-header">
                                            <label htmlFor={`knowledge.${index}.title`}>Wissen #{index + 1}: Titel</label>
                                            {isAdmin && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteKnowledge(field, index)}
                                                    className="knowledge-delete-button icon-button danger"
                                                    disabled={isSaving || (isDeletingKnowledge && deletingKnowledgeId === field.id)}
                                                    aria-label={`Wissenseintrag ${index + 1} löschen`}
                                                >
                                                    {(isDeletingKnowledge && deletingKnowledgeId === field.id) ? <Spinner size="xsmall" /> : <HiOutlineTrash />}
                                                </button>
                                            )}
                                        </div>
                                        {isAdmin ? (
                                            <Input
                                                name={`knowledge.${index}.title`}
                                                type="text"
                                                placeholder="Kurzer, prägnanter Titel (z.B. 'Gruppenstrategie 2024')"
                                                rules={{ maxLength: { value: 100, message: 'Titel darf maximal 100 Zeichen haben' } }}
                                                disabled={isSaving || isDeletingKnowledge}
                                                control={control}
                                            />
                                        ) : (
                                            <div className="knowledge-display">
                                                <strong>{field.title || 'Ohne Titel'}</strong>
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-field-wrapper anweisungen-field">
                                        {isAdmin ? (
                                            <Textarea
                                                name={`knowledge.${index}.content`}
                                                label="Inhalt:"
                                                placeholder="Füge hier den Wissensinhalt ein..."
                                                minRows={2}
                                                maxRows={8}
                                                maxLength={GROUP_MAX_CONTENT_LENGTH}
                                                showCharacterCount={true}
                                                disabled={isSaving || isDeletingKnowledge}
                                                control={control}
                                            />
                                        ) : (
                                            <>
                                                <label className="form-label">Inhalt:</label>
                                                <div className="knowledge-display">
                                                    {field.content || 'Kein Inhalt vorhanden.'}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </FormProvider>
            </div>
        </>
    );

    return (
        <motion.div 
            className="group-detail-cards-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            {currentView === 'gruppeninfo' && renderGroupInfoTab()}
            {currentView === 'anweisungen' && renderInstructionsTab()}
            {currentView === 'wissen' && renderKnowledgeTab()}

        </motion.div>
    );
};

// Main component for the Groups Management Tab
const GroupsManagementTab = ({ onSuccessMessage, onErrorMessage, isActive }) => {
    const [currentView, setCurrentView] = useState('overview');
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [groupDetailView, setGroupDetailView] = useState('gruppeninfo');
    
    // React Hook Form setup for create group form
    const createGroupFormMethods = useForm({
        defaultValues: {
            groupName: ''
        },
        mode: 'onChange'
    });
    
    const { control: createGroupControl, reset: resetCreateGroup, handleSubmit: handleCreateGroupSubmit, getValues: getCreateGroupValues } = createGroupFormMethods;
    const { Input } = useFormFields();

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
    } = useGroups({ isActive });

    // Handle Group Creation Submit
    const handleCreateGroupFormSubmit = (data) => {
        if (!data.groupName.trim() || isCreatingGroup) return;
        onSuccessMessage(''); 
        onErrorMessage('');
        createGroup(data.groupName, {
          onSuccess: (newGroup) => {
            const newGroupId = newGroup.id;
            setSelectedGroupId(newGroupId);
            setCurrentView('group');
            setGroupDetailView('gruppeninfo');
            resetCreateGroup();
            onSuccessMessage('Gruppe erfolgreich erstellt!');
          },
          onError: (error) => {
            onErrorMessage(error?.message || 'Gruppe konnte nicht erstellt werden.');
          }
        });
    };

    // Auto-select logic & handle group deletion side effects
    useEffect(() => {
        if (userGroups) {
            if (userGroups.length === 1 && !selectedGroupId && currentView === 'overview') {
                setSelectedGroupId(userGroups[0].id);
                setCurrentView('group');
            } else if (userGroups.length === 0) {
                setSelectedGroupId(null);
                if (currentView !== 'overview') {
                    setCurrentView('overview');
                }
            }
        }

        // Handle view update after successful group deletion
        if (isDeleteGroupSuccess && selectedGroupId) {
            const deletedGroupWasSelected = !userGroups || !userGroups.some(g => g.id === selectedGroupId);
            if (deletedGroupWasSelected) {
                onSuccessMessage('Gruppe erfolgreich gelöscht!');
                if (userGroups && userGroups.length > 0) {
                    setSelectedGroupId(userGroups[0].id);
                    setCurrentView('group');
                } else {
                    setSelectedGroupId(null);
                    setCurrentView('overview');
                }
            }
        }
    }, [userGroups, selectedGroupId, isDeleteGroupSuccess, rawDeleteGroupError, onSuccessMessage, currentView]);

    // Function to switch view
    const handleSelectGroup = (groupId) => {
        if (selectedGroupId !== groupId) {
            onSuccessMessage('');
            onErrorMessage('');
            setSelectedGroupId(groupId);
            setCurrentView('group');
            setGroupDetailView('gruppeninfo');
        }
    };

    const handleCreateNew = () => {
        setCurrentView('create');
        setSelectedGroupId(null);
        resetCreateGroup();
        onSuccessMessage('');
        onErrorMessage('');
    };

    const handleCancelCreate = () => {
        if (userGroups && userGroups.length > 0) {
            setSelectedGroupId(userGroups[0].id);
            setCurrentView('group');
        } else {
            setCurrentView('overview');
        }
        onSuccessMessage('');
        onErrorMessage('');
    };

    // Handle switching between main tabs
    const handleTabClick = (view) => {
        setCurrentView(view);
        if (view === 'overview') {
            setSelectedGroupId(null);
        }
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
                            
                            <div className="profile-actions profile-actions-centered">
                                <button 
                                    onClick={handleCreateNew}
                                    className="btn-primary size-m"
                                    disabled={isCreatingGroup}
                                >
                                    <HiPlus className="icon" /> {isCreatingGroup ? 'Wird erstellt...' : 'Neue Gruppe erstellen'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );

    // Render Navigation Panel with dynamic group tabs
    const renderNavigationPanel = () => (
        <div className="groups-navigation-panel">
            <div className="groups-vertical-navigation">
                <button
                    className={`groups-vertical-tab ${currentView === 'overview' ? 'active' : ''}`}
                    onClick={() => handleTabClick('overview')}
                >
                    Übersicht
                </button>
                
                {/* Dynamic group tabs */}
                {userGroups && userGroups.map(group => (
                    <button
                        key={group.id}
                        className={`groups-vertical-tab ${selectedGroupId === group.id ? 'active' : ''}`}
                        onClick={() => handleSelectGroup(group.id)}
                    >
                        <div className="group-tab-content">
                            <div className="group-tab-avatar">
                                {getGroupInitials(group.name)}
                            </div>
                            <div className="group-tab-info">
                                <div className="group-tab-name">{group.name}</div>
                                <div className="group-tab-badge">{group.isAdmin ? 'Admin' : 'Mitglied'}</div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );

    // Render Create Group Form
    const renderCreateGroupForm = () => (
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
                    
                    <FormProvider {...createGroupFormMethods}>
                        <form onSubmit={handleCreateGroupSubmit(handleCreateGroupFormSubmit)} className="auth-form">
                            <div className="form-group">
                                <div className="form-field-wrapper">
                                    <Input
                                        name="groupName"
                                        type="text"
                                        label="Gruppenname:"
                                        placeholder="Name der neuen Gruppe"
                                        rules={{ 
                                            required: 'Gruppenname ist erforderlich',
                                            maxLength: { value: 100, message: 'Gruppenname darf maximal 100 Zeichen haben' }
                                        }}
                                        disabled={isCreatingGroup}
                                        control={createGroupControl}
                                    />
                                </div>
                            </div>
                            <div className="profile-actions">
                                <button 
                                    type="submit" 
                                    className="profile-action-button profile-primary-button"
                                    disabled={isCreatingGroup || !getCreateGroupValues().groupName?.trim()}
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
                    </FormProvider>
                </div>
            </div>
        </motion.div>
    );

    // Main Content Panel
    const renderContentPanel = () => {
        if (currentView === 'overview') {
            return renderOverviewTab();
        }

        if (currentView === 'create') {
            return renderCreateGroupForm();
        }

        if (currentView === 'group' && selectedGroupId) {
            return (
                <>
                    {/* Top horizontal navigation for group sub-tabs - outside auth-form */}
                    <div className="groups-horizontal-navigation">
                        <button
                            className={`groups-vertical-tab ${groupDetailView === 'gruppeninfo' ? 'active' : ''}`}
                            onClick={() => setGroupDetailView('gruppeninfo')}
                        >
                            Gruppeninfo
                        </button>
                        <button
                            className={`groups-vertical-tab ${groupDetailView === 'anweisungen' ? 'active' : ''}`}
                            onClick={() => setGroupDetailView('anweisungen')}
                        >
                            Gruppenanweisungen
                        </button>
                        <button
                            className={`groups-vertical-tab ${groupDetailView === 'wissen' ? 'active' : ''}`}
                            onClick={() => setGroupDetailView('wissen')}
                        >
                            Gruppenwissen
                        </button>
                    </div>
                    
                    {/* Group content */}
                    <motion.div 
                        className="group-detail-with-tabs"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <GroupDetailView 
                            groupId={selectedGroupId}
                            onSuccessMessage={onSuccessMessage}
                            onErrorMessage={onErrorMessage}
                            isActive={isActive}
                            currentView={groupDetailView}
                        />
                    </motion.div>
                </>
            );
        }

        return renderOverviewTab();
    };

    return (
        <motion.div 
            className="profile-content groups-management-layout"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <div className="groups-navigation-panel">
                {renderNavigationPanel()}
            </div>
            <div className="groups-content-panel profile-form-section">
                <div className="group-content-card">
                    <div className="auth-form">
                        {renderContentPanel()}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default GroupsManagementTab; 