import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useForm, FormProvider, useFieldArray } from 'react-hook-form';
import { HiOutlineTrash, HiPlus, HiLink, HiInformationCircle, HiPencil, HiCheck, HiX } from 'react-icons/hi';
import { useAutosave } from '../../../../hooks/useAutosave';
import Spinner from '../../../../components/common/Spinner';
import { useGroups, useGroupSharing, getGroupInitials } from '../../utils/groupsUtils';
import useGroupDetails from '../../../../features/groups/hooks/useGroupDetails';
import { useFormFields } from '../../../../components/common/Form/hooks';
import HelpTooltip from '../../../../components/common/HelpTooltip';
import DeleteWarningTooltip from '../../../../components/common/DeleteWarningTooltip';
import GroupMembersList from './GroupMembersList';
import SharedContentSelector from '../../../../features/groups/components/SharedContentSelector';
import { useInstructionsUiStore } from '../../../../stores/auth/instructionsUiStore';
import { motion } from "motion/react";
import { useTabIndex } from '../../../../hooks/useTabIndex';
import { useModalFocus, useRovingTabindex } from '../../../../hooks/useKeyboardNavigation';
import { announceToScreenReader, createInlineEditorFocus } from '../../../../utils/focusManagement';

// Helper function moved to groupsUtils.js

// Component for the Group Detail View
const GroupDetailView = ({ 
    groupId, 
    onSuccessMessage, 
    onErrorMessage,
    isActive,
    currentView = 'anweisungen-wissen'
}) => {
    // State for editing group name and description
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedGroupName, setEditedGroupName] = useState('');
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedGroupDescription, setEditedGroupDescription] = useState('');
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_GROUPS');
    
    // Ref to track initialization
    const isInitialized = useRef(false);
    // React Hook Form setup for group details
    const formMethods = useForm({
        defaultValues: {
            customAntragPrompt: '',
            customSocialPrompt: '',
            customUniversalPrompt: '',
            knowledge: []
        },
        mode: 'onChange'
    });
    
    const { control, reset, getValues, watch } = formMethods;
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
        customUniversalPrompt,
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

    // Group sharing functionality
    const {
        groupContent,
        isLoadingGroupContent,
        unshareContent,
        updatePermissions,
        isUnsharing,
        isUpdatingPermissions
    } = useGroupSharing(groupId, { isActive });

    // UI state management using shared store
    const {
        isSaving: uiIsSaving, 
        isDeleting: uiIsDeleting, 
        deletingKnowledgeId: uiDeletingKnowledgeId,
        clearMessages: clearUiMessages
    } = useInstructionsUiStore();

    const [joinLinkCopied, setJoinLinkCopied] = useState(false);

    // Auto-save using shared hook (moved before initialization to prevent "cannot access before initialization" error)
    const { resetTracking } = useAutosave({
        saveFunction: useCallback(async (changedFields) => {
            // Use existing save mechanism through handleInstructionsChange
            Object.entries(changedFields).forEach(([key, value]) => {
                if (key !== 'knowledge') {
                    handleInstructionsChange(key, value);
                }
            });
            
            // Save changes
            return await saveChanges();
        }, [handleInstructionsChange, saveChanges]),
        formRef: { getValues, watch },
        enabled: groupInfo && isInitialized.current,
        debounceMs: 2000,
        getFieldsToTrack: () => [
            'customAntragPrompt',
            'customSocialPrompt',
            'customUniversalPrompt',
            'knowledge'
        ],
        onError: (error) => {
            console.error('Groups autosave failed:', error);
        }
    });

    // Initialize form when group data loads
    useEffect(() => {
        if (groupInfo && !isInitialized.current) {
            reset({
                customAntragPrompt: customAntragPrompt || '',
                customSocialPrompt: customSocialPrompt || '',
                customUniversalPrompt: customUniversalPrompt || '',
                knowledge: knowledgeEntries || []
            });
            setEditedGroupName(groupInfo.name || '');
            setEditedGroupDescription(groupInfo.description || '');
            
            // Mark as initialized after first load
            isInitialized.current = true;
            // Reset autosave tracking after initial form setup
            setTimeout(() => resetTracking(), 100);
        }
    }, [groupInfo, customAntragPrompt, customSocialPrompt, customUniversalPrompt, knowledgeEntries, reset, resetTracking]);

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

    // Effect to clear UI messages when view changes or component becomes inactive
    useEffect(() => {
        clearUiMessages();
    }, [groupId, isActive, clearUiMessages]);

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


    const handleDeleteKnowledge = (entry, index) => {
        if (!entry.id || (typeof entry.id === 'string' && entry.id.startsWith('new-'))) {
            remove(index); // Remove from form state if it's a new, unsaved entry
        } else {
            if (window.confirm("Möchtest du diesen Wissenseintrag wirklich löschen?")) {
                // For saved entries, remove from form and let auto-save handle the backend deletion
                remove(index);
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
                                        tabIndex={tabIndex.groupNameEdit}
                                        aria-label="Gruppenname bearbeiten"
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
                                            tabIndex={tabIndex.groupNameEdit}
                                            aria-label="Gruppenname bearbeiten"
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
                            tabIndex={tabIndex.deleteGroupButton}
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
                                    tabIndex={tabIndex.copyLinkButton}
                                    aria-label={joinLinkCopied ? 'Link wurde kopiert' : 'Einladungslink kopieren'}
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
                            maxLength={500}
                            disabled={isUpdatingGroupName}
                            style={{ minHeight: 'auto', resize: 'none', overflow: 'hidden' }}
                            onInput={(e) => {
                                e.target.style.height = 'auto';
                                e.target.style.height = (e.target.scrollHeight + 2) + 'px';
                            }}
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

    // Render combined Anweisungen & Wissen Tab
    const renderAnweisungenWissenTab = () => {
        return (
            <>
                <div className="group-content-card">
                    <FormProvider {...formMethods}>
                        <div className="auth-form">
                            <div className="profile-cards-grid">
                                <div className="profile-card">
                                    <div className="profile-card-header">
                                        <h3>Anträge</h3>
                                    </div>
                                    <div className="profile-card-content">
                                        {isAdmin ? (
                                            <Textarea
                                                name="customAntragPrompt"
                                                label="Gruppenanweisungen:"
                                                placeholder="Spezifische Anweisungen für Anträge..."
                                                helpText="z.B. bevorzugter Stil, spezielle Formulierungen, politische Schwerpunkte"
                                                maxLength={GROUP_MAX_CONTENT_LENGTH}
                                                showCharacterCount={true}
                                                control={control}
                                            />
                                        ) : (
                                            <div className="instruction-display">
                                                {customAntragPrompt || 'Keine spezifischen Anweisungen für Anträge.'}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="profile-card">
                                    <div className="profile-card-header">
                                        <h3>Presse & Social Media</h3>
                                    </div>
                                    <div className="profile-card-content">
                                        {isAdmin ? (
                                            <Textarea
                                                name="customSocialPrompt"
                                                label="Gruppenanweisungen:"
                                                placeholder="Spezifische Anweisungen für Presse- und Social Media-Inhalten..."
                                                helpText="z.B. Tonalität, Hashtag-Präferenzen, Zielgruppen-Ansprache"
                                                maxLength={GROUP_MAX_CONTENT_LENGTH}
                                                showCharacterCount={true}
                                                control={control}
                                            />
                                        ) : (
                                            <div className="instruction-display">
                                                {customSocialPrompt || 'Keine spezifischen Anweisungen für Social Media.'}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="profile-card">
                                    <div className="profile-card-header">
                                        <h3>Universelle Texte</h3>
                                    </div>
                                    <div className="profile-card-content">
                                        {isAdmin ? (
                                            <Textarea
                                                name="customUniversalPrompt"
                                                label="Gruppenanweisungen:"
                                                placeholder="Spezifische Anweisungen für universelle Texte..."
                                                helpText="z.B. allgemeine Schreibweise, politische Grundhaltung, Formulierungspräferenzen"
                                                maxLength={GROUP_MAX_CONTENT_LENGTH}
                                                showCharacterCount={true}
                                                control={control}
                                            />
                                        ) : (
                                            <div className="instruction-display">
                                                {customUniversalPrompt || 'Keine spezifischen Anweisungen für universelle Texte.'}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="profile-card">
                                    <div className="profile-card-header">
                                        <h3>Gruppenwissen</h3>
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                className="btn-primary size-s"
                                                onClick={handleAddKnowledge}
                                                disabled={isDeletingKnowledge || fields.length >= 3}
                                            >
                                                <HiPlus className="icon" /> Wissen hinzufügen
                                            </button>
                                        )}
                                    </div>
                                    <div className="profile-card-content">
                                        {fields.length === 0 && !isAdmin && (
                                            <div className="knowledge-empty-state centered">
                                                <p>Noch kein Gruppenwissen vorhanden.</p>
                                                <p>Nur Admins können Gruppenwissen hinzufügen.</p>
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
                                                                disabled={isDeletingKnowledge && deletingKnowledgeId === field.id}
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
                                                            disabled={isDeletingKnowledge}
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
                                                            maxLength={GROUP_MAX_CONTENT_LENGTH}
                                                            showCharacterCount={true}
                                                            disabled={isDeletingKnowledge}
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
                            </div>

                            <div className="form-help-text">
                                Änderungen werden automatisch gespeichert
                            </div>
                        </div>
                    </FormProvider>
                </div>
            </>
        );
    };

    // Render Combined Shared Content Tab with both content and templates
    const renderSharedContentTab = () => (
        <>
            <div className="group-content-card">
                <div className="profile-cards-grid">
                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h3>Geteilte Inhalte</h3>
                        </div>
                        <div className="profile-card-content">
                            <SharedContentSelector
                                groupContent={groupContent}
                                isLoading={isLoadingGroupContent}
                                isAdmin={isAdmin}
                                onUnshare={unshareContent}
                                isUnsharing={isUnsharing}
                                config={{
                                    title: "",
                                    description: "Texte und Dokumente, die mit der Gruppe geteilt wurden",
                                    excludeTypes: ['user_content'], // Exclude templates from this section
                                    hideFilters: ['permissions'],
                                    cardStyle: 'content-default'
                                }}
                            />
                        </div>
                    </div>

                    <div className="profile-card">
                        <div className="profile-card-header">
                            <h3>Geteilte Vorlagen</h3>
                        </div>
                        <div className="profile-card-content">
                            <SharedContentSelector
                                groupContent={groupContent}
                                isLoading={isLoadingGroupContent}
                                isAdmin={isAdmin}
                                onUnshare={unshareContent}
                                isUnsharing={isUnsharing}
                                config={{
                                    title: "",
                                    description: "Canva-Vorlagen, die mit der Gruppe geteilt wurden",
                                    contentFilter: 'user_content',
                                    hideFilters: ['contentType', 'permissions'],
                                    cardStyle: 'template-square',
                                    gridConfig: {
                                        minCardWidth: '280px',
                                        aspectRatio: '1:1'
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
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
            {currentView === 'anweisungen-wissen' && renderAnweisungenWissenTab()}
            {currentView === 'shared' && renderSharedContentTab()}

        </motion.div>
    );
};

// Main component for the Groups Management Tab
const GroupsManagementTab = ({ onSuccessMessage, onErrorMessage, isActive }) => {
    const [currentView, setCurrentView] = useState('overview');
    const [selectedGroupId, setSelectedGroupId] = useState(null);
    const [groupDetailView, setGroupDetailView] = useState('anweisungen-wissen');
    
    // Track whether initial auto-selection has been performed
    const hasInitialAutoSelection = useRef(false);
    
    // Tab index configuration
    const tabIndex = useTabIndex('PROFILE_GROUPS');
    
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
            setGroupDetailView('anweisungen-wissen');
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
            // Only auto-select on initial load, not when user manually navigates
            if (!hasInitialAutoSelection.current) {
                if (userGroups.length === 1 && !selectedGroupId && currentView === 'overview') {
                    setSelectedGroupId(userGroups[0].id);
                    setCurrentView('group');
                }
                hasInitialAutoSelection.current = true;
            }
            
            // Always handle the case where user has no groups
            if (userGroups.length === 0) {
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
            setGroupDetailView('anweisungen-wissen');
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
    const handleTabClick = useCallback((view) => {
        setCurrentView(view);
        if (view === 'overview') {
            setSelectedGroupId(null);
        }
        onSuccessMessage('');
        onErrorMessage('');
        announceToScreenReader(`${view === 'overview' ? 'Übersicht' : view} ausgewählt`);
    }, [onSuccessMessage, onErrorMessage]);
    
    // Navigation items for roving tabindex
    const navigationItems = [
        'overview',
        ...(userGroups ? userGroups.map(g => `group-${g.id}`) : [])
    ];
    
    // Roving tabindex for navigation
    const { getItemProps } = useRovingTabindex({
        items: navigationItems,
        defaultActiveItem: currentView === 'overview' ? 'overview' : `group-${selectedGroupId}`
    });

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
                                    tabIndex={tabIndex.createGroupButton}
                                    aria-label="Neue Gruppe erstellen"
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
            <div 
                className="groups-vertical-navigation"
                role="tablist"
                aria-label="Gruppen Navigation"
                aria-orientation="vertical"
            >
                <button
                    {...getItemProps('overview')}
                    className={`groups-vertical-tab ${currentView === 'overview' ? 'active' : ''}`}
                    onClick={() => handleTabClick('overview')}
                    role="tab"
                    aria-selected={currentView === 'overview'}
                    aria-controls="overview-panel"
                    id="overview-tab"
                >
                    Übersicht
                </button>
                
                {/* Dynamic group tabs */}
                {userGroups && userGroups.map(group => (
                    <button
                        key={group.id}
                        {...getItemProps(`group-${group.id}`)}
                        className={`groups-vertical-tab ${selectedGroupId === group.id ? 'active' : ''}`}
                        onClick={() => handleSelectGroup(group.id)}
                        role="tab"
                        aria-selected={selectedGroupId === group.id}
                        aria-controls={`group-${group.id}-panel`}
                        id={`group-${group.id}-tab`}
                        aria-label={`Gruppe ${group.name} ${group.isAdmin ? '(Admin)' : '(Mitglied)'}`}
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
                                        tabIndex={tabIndex.groupNameInput}
                                    />
                                </div>
                            </div>
                            <div className="profile-actions">
                                <button 
                                    type="submit" 
                                    className="btn-primary size-m"
                                    disabled={isCreatingGroup || !getCreateGroupValues().groupName?.trim()}
                                    tabIndex={tabIndex.createSubmitButton}
                                >
                                    {isCreatingGroup ? <Spinner size="small" /> : 'Gruppe erstellen'}
                                </button>
                                <button 
                                    type="button" 
                                    onClick={handleCancelCreate}
                                    className="btn-primary size-m"
                                    disabled={isCreatingGroup}
                                    tabIndex={tabIndex.createCancelButton}
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
                    <div className="groups-horizontal-navigation" role="tablist">
                        <button
                            className={`groups-vertical-tab ${groupDetailView === 'gruppeninfo' ? 'active' : ''}`}
                            onClick={() => setGroupDetailView('gruppeninfo')}
                            tabIndex={tabIndex.groupDetailTabs}
                            role="tab"
                            aria-selected={groupDetailView === 'gruppeninfo'}
                            aria-controls="gruppeninfo-panel"
                        >
                            Gruppeninfo
                        </button>
                        <button
                            className={`groups-vertical-tab ${groupDetailView === 'anweisungen-wissen' ? 'active' : ''}`}
                            onClick={() => setGroupDetailView('anweisungen-wissen')}
                            tabIndex={tabIndex.groupDetailTabs + 1}
                            role="tab"
                            aria-selected={groupDetailView === 'anweisungen-wissen'}
                            aria-controls="anweisungen-wissen-panel"
                        >
                            Profil auswählen
                        </button>
                        <button
                            className={`groups-vertical-tab ${groupDetailView === 'shared' ? 'active' : ''}`}
                            onClick={() => setGroupDetailView('shared')}
                            tabIndex={tabIndex.groupDetailTabs + 2}
                            role="tab"
                            aria-selected={groupDetailView === 'shared'}
                            aria-controls="shared-panel"
                        >
                            Geteilte Inhalte & Vorlagen
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