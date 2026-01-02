import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { motion } from "motion/react";

import { useAutosave } from '../../../../../../../hooks/useAutosave';
import { useGroups, useGroupSharing } from '../../../../../../../features/groups/hooks/useGroups';
import { useAnweisungenWissen } from '../../../../../hooks/useProfileData';
import { useInstructionsUiStore } from '../../../../../../../stores/auth/instructionsUiStore';
import { useWolkeStore } from '../../../../../../../stores/wolkeStore';

import GroupInfoSection from './subcomponents/GroupInfoSection';
import GroupInstructionsSection from './subcomponents/GroupInstructionsSection';
import GroupSharedContentSection from './subcomponents/GroupSharedContentSection';
import GroupWolkeSection from './subcomponents/GroupWolkeSection';

interface GroupData {
    antragInstructionsEnabled?: boolean;
    socialInstructionsEnabled?: boolean;
    isAdmin?: boolean;
    membership?: {
        role?: string;
    };
    antragPrompt?: string;
    socialPrompt?: string;
    universalPrompt?: string;
    redePrompt?: string;
    buergeranfragenPrompt?: string;
    gruenejugendPrompt?: string;
    groupInfo?: {
        id?: string;
        name?: string;
        description?: string;
    };
    joinToken?: string;
    [key: string]: unknown;
}

interface TabIndexConfig {
    groupDetailTabs: number;
    groupNameEdit?: number;
}

interface GroupDetailSectionProps {
    groupId: string;
    groupDetailView: string;
    setGroupDetailView: (view: string) => void;
    onSuccessMessage: (msg: string) => void;
    onErrorMessage: (msg: string) => void;
    isActive: boolean;
    tabIndex: TabIndexConfig;
}

const GroupDetailSection = memo(({
    groupId,
    groupDetailView,
    setGroupDetailView,
    onSuccessMessage,
    onErrorMessage,
    isActive,
    tabIndex
}: GroupDetailSectionProps) => {
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedGroupName, setEditedGroupName] = useState('');
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedGroupDescription, setEditedGroupDescription] = useState('');
    const [joinLinkCopied, setJoinLinkCopied] = useState(false);
    const [enabledFields, setEnabledFields] = useState<string[]>([]);

    const isInitialized = useRef(false);
    const prevCurrentView = useRef<string | undefined>(undefined);

    useEffect(() => {
        isInitialized.current = false;
    }, [groupId]);

    const formMethods = useForm({
        defaultValues: {
            customAntragPrompt: '',
            customSocialPrompt: '',
            customUniversalPrompt: '',
            customRedePrompt: '',
            customBuergeranfragenPrompt: '',
            customGruenejugendPrompt: ''
        },
        mode: 'onSubmit'
    });

    const { control, reset, getValues, watch, setValue } = formMethods;

    const {
        query,
        saveChanges,
        saveError,
    } = useAnweisungenWissen({
        enabled: isActive,
        context: 'group',
        groupId
    });

    const {
        data: rawData,
        isLoading: isLoadingDetails,
        isError: isErrorDetails,
        error: errorDetails,
        refetch: refetchGroupData
    } = query;

    const data = rawData as GroupData | undefined;

    const GROUP_MAX_CONTENT_LENGTH = 1000;
    const isSaveError = !!saveError;

    const {
        deleteGroup,
        isDeletingGroup,
        updateGroupName,
        updateGroupInfo,
        isUpdatingGroupName,
    } = useGroups({ isActive });

    const {
        groupContent,
        isLoadingGroupContent,
        isFetchingGroupContent,
        unshareContent,
        isUnsharing,
        shareContent,
        isSharing,
        refetchGroupContent
    } = useGroupSharing(groupId, { isActive });

    const { clearMessages: clearUiMessages } = useInstructionsUiStore();
    const { setScope, permissions } = useWolkeStore();

    const { resetTracking } = useAutosave({
        saveFunction: useCallback(async () => {
            const formValues = getValues();
            const saveData = {
                customAntragPrompt: formValues.customAntragPrompt || '',
                customSocialPrompt: formValues.customSocialPrompt || '',
                customUniversalPrompt: formValues.customUniversalPrompt || '',
                customRedePrompt: formValues.customRedePrompt || '',
                customBuergeranfragenPrompt: formValues.customBuergeranfragenPrompt || '',
                customGruenejugendPrompt: formValues.customGruenejugendPrompt || '',
                presseabbinder: '',
                antragInstructionsEnabled: data?.antragInstructionsEnabled || false,
                socialInstructionsEnabled: data?.socialInstructionsEnabled || false,
                _groupMembership: {
                    isAdmin: data?.isAdmin || false,
                    role: data?.membership?.role || 'member'
                }
            };
            return await (saveChanges as unknown as (data: typeof saveData) => Promise<unknown>)(saveData);
        }, [saveChanges, getValues, data]),
        formRef: { getValues, watch },
        enabled: data && isInitialized.current && data?.isAdmin,
        debounceMs: 2000,
        getFieldsToTrack: () => ['customAntragPrompt', 'customSocialPrompt', 'customUniversalPrompt', 'customRedePrompt', 'customBuergeranfragenPrompt', 'customGruenejugendPrompt'],
        onError: (error) => console.error('Groups autosave failed:', error)
    });

    useEffect(() => {
        if (!data) return;
        if (!isInitialized.current) {
            reset({
                customAntragPrompt: data.antragPrompt || '',
                customSocialPrompt: data.socialPrompt || '',
                customUniversalPrompt: data.universalPrompt || '',
                customRedePrompt: data.redePrompt || '',
                customBuergeranfragenPrompt: data.buergeranfragenPrompt || '',
                customGruenejugendPrompt: data.gruenejugendPrompt || ''
            });
            setEditedGroupName(data.groupInfo?.name || '');
            setEditedGroupDescription(data.groupInfo?.description || '');
            isInitialized.current = true;
            setTimeout(() => resetTracking(), 100);
        }
    }, [data, reset, resetTracking]);

    useEffect(() => {
        if (isSaveError) {
            const message = saveError instanceof Error ? saveError.message : 'Ein unbekannter Fehler ist aufgetreten.';
            onErrorMessage(`Fehler beim Speichern (Gruppe): ${message}`);
        }
    }, [isSaveError, saveError, onErrorMessage]);

    useEffect(() => {
        clearUiMessages();
    }, [groupId, isActive, clearUiMessages]);

    useEffect(() => {
        if (prevCurrentView.current !== groupDetailView) {
            if (groupDetailView === 'wolke' && groupId && data?.groupInfo?.id) {
                setScope('group', data.groupInfo.id);
            } else if (groupDetailView !== 'wolke' && prevCurrentView.current === 'wolke') {
                setScope('personal', null);
            }
            prevCurrentView.current = groupDetailView;
        }
    }, [groupDetailView, groupId, data?.groupInfo?.id, setScope]);

    const getJoinUrl = useCallback(() => {
        if (!data?.joinToken) return '';
        return `${window.location.origin}/join-group/${data.joinToken}`;
    }, [data?.joinToken]);

    const copyJoinLink = useCallback(() => {
        navigator.clipboard.writeText(getJoinUrl())
            .then(() => {
                setJoinLinkCopied(true);
                setTimeout(() => setJoinLinkCopied(false), 3000);
            })
            .catch(err => console.error('Failed to copy link:', err));
    }, [getJoinUrl]);

    const confirmDeleteGroup = useCallback(() => {
        if (!groupId || !data?.isAdmin) return;
        onSuccessMessage('');
        onErrorMessage('');
        deleteGroup(groupId, {
            onSuccess: () => onSuccessMessage('Gruppe erfolgreich gelöscht!'),
            onError: (error: Error) => onErrorMessage(`Fehler beim Löschen der Gruppe: ${error.message}`)
        });
    }, [groupId, data?.isAdmin, deleteGroup, onSuccessMessage, onErrorMessage]);

    const startEditingName = useCallback(() => {
        if (data?.isAdmin) {
            setIsEditingName(true);
            setEditedGroupName(data?.groupInfo?.name || '');
        }
    }, [data?.isAdmin, data?.groupInfo?.name]);

    const cancelEditingName = useCallback(() => {
        setIsEditingName(false);
        setEditedGroupName(data?.groupInfo?.name || '');
    }, [data?.groupInfo?.name]);

    const saveGroupName = useCallback(async () => {
        if (!editedGroupName.trim() || editedGroupName === data?.groupInfo?.name) {
            cancelEditingName();
            return;
        }
        updateGroupName(groupId, editedGroupName.trim(), {
            onSuccess: () => {
                setIsEditingName(false);
                onSuccessMessage('Gruppenname erfolgreich geändert!');
                refetchGroupData();
            },
            onError: (error: Error) => {
                onErrorMessage('Fehler beim Ändern des Gruppennamens: ' + error.message);
                setEditedGroupName(data?.groupInfo?.name || '');
            }
        });
    }, [editedGroupName, data?.groupInfo?.name, groupId, updateGroupName, cancelEditingName, onSuccessMessage, onErrorMessage, refetchGroupData]);

    const startEditingDescription = useCallback(() => {
        if (data?.isAdmin) {
            setIsEditingDescription(true);
            setEditedGroupDescription(data?.groupInfo?.description || '');
        }
    }, [data?.isAdmin, data?.groupInfo?.description]);

    const cancelEditingDescription = useCallback(() => {
        setIsEditingDescription(false);
        setEditedGroupDescription(data?.groupInfo?.description || '');
    }, [data?.groupInfo?.description]);

    const saveGroupDescription = useCallback(async () => {
        if (editedGroupDescription === (data?.groupInfo?.description || '')) {
            cancelEditingDescription();
            return;
        }
        updateGroupInfo(groupId, { name: data?.groupInfo?.name, description: editedGroupDescription }, {
            onSuccess: () => {
                setIsEditingDescription(false);
                onSuccessMessage('Gruppenbeschreibung erfolgreich geändert!');
                refetchGroupData();
            },
            onError: (error: Error) => {
                onErrorMessage('Fehler beim Ändern der Gruppenbeschreibung: ' + error.message);
                setEditedGroupDescription(data?.groupInfo?.description || '');
            }
        });
    }, [editedGroupDescription, data?.groupInfo?.description, data?.groupInfo?.name, groupId, updateGroupInfo, cancelEditingDescription, onSuccessMessage, onErrorMessage, refetchGroupData]);

    const handleAddField = useCallback((fieldName: string) => {
        setEnabledFields(prev => [...prev, fieldName]);
    }, []);

    const handleRemoveField = useCallback((fieldName: string) => {
        (setValue as (name: string, value: string) => void)(fieldName, '');
        setEnabledFields(prev => prev.filter(f => f !== fieldName));
    }, [setValue]);

    if (isLoadingDetails || !data) {
        return null;
    }

    if (isErrorDetails) {
        return (
            <div className="auth-error-message">
                Fehler beim Laden der Gruppendetails: {errorDetails?.message || 'Unbekannter Fehler'}
            </div>
        );
    }

    return (
        <>
            <div className="groups-horizontal-navigation" role="tablist">
                <button
                    className={`profile-vertical-tab ${groupDetailView === 'gruppeninfo' ? 'active' : ''}`}
                    onClick={() => setGroupDetailView('gruppeninfo')}
                    tabIndex={tabIndex.groupDetailTabs}
                    role="tab"
                    aria-selected={groupDetailView === 'gruppeninfo'}
                >
                    Gruppeninfo
                </button>
                <button
                    className={`profile-vertical-tab ${groupDetailView === 'anweisungen-wissen' ? 'active' : ''}`}
                    onClick={() => setGroupDetailView('anweisungen-wissen')}
                    tabIndex={tabIndex.groupDetailTabs + 1}
                    role="tab"
                    aria-selected={groupDetailView === 'anweisungen-wissen'}
                >
                    Anweisungen & Wissen
                </button>
                <button
                    className={`profile-vertical-tab ${groupDetailView === 'shared' ? 'active' : ''}`}
                    onClick={() => setGroupDetailView('shared')}
                    tabIndex={tabIndex.groupDetailTabs + 2}
                    role="tab"
                    aria-selected={groupDetailView === 'shared'}
                >
                    Geteilte Inhalte & Vorlagen
                </button>
                <button
                    className={`profile-vertical-tab ${groupDetailView === 'wolke' ? 'active' : ''}`}
                    onClick={() => setGroupDetailView('wolke')}
                    tabIndex={tabIndex.groupDetailTabs + 3}
                    role="tab"
                    aria-selected={groupDetailView === 'wolke'}
                >
                    Wolke-Ordner
                </button>
            </div>

            <motion.div
                className="group-detail-cards-layout"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
            >
                {groupDetailView === 'gruppeninfo' && (
                    <GroupInfoSection
                        data={data}
                        groupId={groupId}
                        isEditingName={isEditingName}
                        editedGroupName={editedGroupName}
                        setEditedGroupName={setEditedGroupName}
                        isEditingDescription={isEditingDescription}
                        editedGroupDescription={editedGroupDescription}
                        setEditedGroupDescription={setEditedGroupDescription}
                        isUpdatingGroupName={isUpdatingGroupName}
                        isDeletingGroup={isDeletingGroup}
                        joinLinkCopied={joinLinkCopied}
                        getJoinUrl={getJoinUrl}
                        copyJoinLink={copyJoinLink}
                        startEditingName={startEditingName}
                        cancelEditingName={cancelEditingName}
                        saveGroupName={saveGroupName}
                        startEditingDescription={startEditingDescription}
                        cancelEditingDescription={cancelEditingDescription}
                        saveGroupDescription={saveGroupDescription}
                        confirmDeleteGroup={confirmDeleteGroup}
                        isActive={isActive}
                        tabIndex={{ ...tabIndex, groupNameEdit: tabIndex.groupNameEdit ?? 0 }}
                    />
                )}

                {groupDetailView === 'anweisungen-wissen' && (
                    <FormProvider {...formMethods}>
                        <GroupInstructionsSection
                            data={data}
                            control={control as unknown as import('react-hook-form').Control<Record<string, unknown>>}
                            GROUP_MAX_CONTENT_LENGTH={GROUP_MAX_CONTENT_LENGTH}
                            enabledFields={enabledFields}
                            onAddField={handleAddField}
                            onRemoveField={handleRemoveField}
                        />
                    </FormProvider>
                )}

                {groupDetailView === 'shared' && (
                    <GroupSharedContentSection
                        groupContent={groupContent}
                        isLoadingGroupContent={isLoadingGroupContent}
                        isFetchingGroupContent={isFetchingGroupContent}
                        isAdmin={data?.isAdmin ?? false}
                        onUnshare={(contentType: string, contentId: string) => unshareContent(contentType, contentId)}
                        isUnsharing={isUnsharing}
                        groupId={groupId}
                        onShareContent={async (contentType: string, itemId: string, options: { permissions: { read: boolean; write: boolean; collaborative: boolean }; targetGroupId: string }) => {
                            shareContent(contentType, itemId, options);
                        }}
                        isSharing={isSharing}
                        onRefetch={refetchGroupContent}
                        onSuccessMessage={onSuccessMessage}
                        onErrorMessage={onErrorMessage}
                    />
                )}

                {groupDetailView === 'wolke' && (
                    <GroupWolkeSection
                        isAdmin={data?.isAdmin ?? false}
                        permissions={permissions}
                    />
                )}
            </motion.div>
        </>
    );
});

export default GroupDetailSection;
