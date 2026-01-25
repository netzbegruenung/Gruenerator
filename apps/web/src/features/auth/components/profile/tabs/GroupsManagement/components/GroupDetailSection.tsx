import { motion } from 'motion/react';
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';

import { useGroups, useGroupSharing } from '../../../../../../../features/groups/hooks/useGroups';
import { useAutosave } from '../../../../../../../hooks/useAutosave';
import { useInstructionsUiStore } from '../../../../../../../stores/auth/instructionsUiStore';
import { useAnweisungenWissen } from '../../../../../hooks/useProfileData';

import GroupInfoSection from './subcomponents/GroupInfoSection';
import GroupSharedContentSection from './subcomponents/GroupSharedContentSection';

interface GroupData {
  instructionsEnabled?: boolean;
  isAdmin?: boolean;
  membership?: {
    role?: string;
  };
  customPrompt?: string;
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
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
  isActive: boolean;
  tabIndex: TabIndexConfig;
}

const GroupDetailSection = memo(
  ({ groupId, onSuccessMessage, onErrorMessage, isActive, tabIndex }: GroupDetailSectionProps) => {
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedGroupName, setEditedGroupName] = useState('');
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedGroupDescription, setEditedGroupDescription] = useState('');
    const [joinLinkCopied, setJoinLinkCopied] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');

    const isInitialized = useRef(false);

    useEffect(() => {
      isInitialized.current = false;
    }, [groupId]);

    const { query, saveChanges, saveError } = useAnweisungenWissen({
      enabled: isActive,
      context: 'group',
      groupId,
    });

    const {
      data: rawData,
      isLoading: isLoadingDetails,
      isError: isErrorDetails,
      error: errorDetails,
      refetch: refetchGroupData,
    } = query;

    const data = rawData as GroupData | undefined;
    const isSaveError = !!saveError;

    const { deleteGroup, isDeletingGroup, updateGroupName, updateGroupInfo, isUpdatingGroupName } =
      useGroups({ isActive });

    const {
      groupContent,
      isLoadingGroupContent,
      isFetchingGroupContent,
      unshareContent,
      isUnsharing,
      shareContent,
      isSharing,
      refetchGroupContent,
    } = useGroupSharing(groupId, { isActive });

    const { clearMessages: clearUiMessages } = useInstructionsUiStore();

    const { resetTracking } = useAutosave({
      saveFunction: useCallback(async () => {
        const saveData = {
          customPrompt: customPrompt || '',
          _groupMembership: {
            isAdmin: data?.isAdmin || false,
            role: data?.membership?.role || 'member',
          },
        };
        await (saveChanges as unknown as (data: typeof saveData) => Promise<unknown>)(saveData);
      }, [saveChanges, customPrompt, data]),
      formRef: {
        getValues: () => ({ customPrompt }),
        watch: (callback: (value: Record<string, unknown>, info: { name?: string }) => void) => ({
          unsubscribe: () => {},
        }),
      },
      enabled: data && isInitialized.current && data?.isAdmin,
      debounceMs: 2000,
      getFieldsToTrack: () => ['customPrompt'],
      onError: (error) => console.error('Groups autosave failed:', error),
    });

    useEffect(() => {
      if (!data) return;
      if (!isInitialized.current) {
        setCustomPrompt(data.customPrompt || '');
        setEditedGroupName(data.groupInfo?.name || '');
        setEditedGroupDescription(data.groupInfo?.description || '');
        isInitialized.current = true;
        setTimeout(() => resetTracking(), 100);
      }
    }, [data, resetTracking]);

    useEffect(() => {
      if (isSaveError) {
        const message =
          saveError instanceof Error
            ? saveError.message
            : 'Ein unbekannter Fehler ist aufgetreten.';
        onErrorMessage(`Fehler beim Speichern (Gruppe): ${message}`);
      }
    }, [isSaveError, saveError, onErrorMessage]);

    useEffect(() => {
      clearUiMessages();
    }, [groupId, isActive, clearUiMessages]);

    const getJoinUrl = useCallback(() => {
      if (!data?.joinToken) return '';
      return `${window.location.origin}/join-group/${data.joinToken}`;
    }, [data?.joinToken]);

    const copyJoinLink = useCallback(() => {
      navigator.clipboard
        .writeText(getJoinUrl())
        .then(() => {
          setJoinLinkCopied(true);
          setTimeout(() => setJoinLinkCopied(false), 3000);
        })
        .catch((err) => console.error('Failed to copy link:', err));
    }, [getJoinUrl]);

    const confirmDeleteGroup = useCallback(() => {
      if (!groupId || !data?.isAdmin) return;
      onSuccessMessage('');
      onErrorMessage('');
      deleteGroup(groupId, {
        onSuccess: () => onSuccessMessage('Gruppe erfolgreich gelöscht!'),
        onError: (error: Error) =>
          onErrorMessage(`Fehler beim Löschen der Gruppe: ${error.message}`),
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
          void refetchGroupData();
        },
        onError: (error: Error) => {
          onErrorMessage('Fehler beim Ändern des Gruppennamens: ' + error.message);
          setEditedGroupName(data?.groupInfo?.name || '');
        },
      });
    }, [
      editedGroupName,
      data?.groupInfo?.name,
      groupId,
      updateGroupName,
      cancelEditingName,
      onSuccessMessage,
      onErrorMessage,
      refetchGroupData,
    ]);

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
      updateGroupInfo(
        groupId,
        { name: data?.groupInfo?.name, description: editedGroupDescription },
        {
          onSuccess: () => {
            setIsEditingDescription(false);
            onSuccessMessage('Gruppenbeschreibung erfolgreich geändert!');
            void refetchGroupData();
          },
          onError: (error: Error) => {
            onErrorMessage('Fehler beim Ändern der Gruppenbeschreibung: ' + error.message);
            setEditedGroupDescription(data?.groupInfo?.description || '');
          },
        }
      );
    }, [
      editedGroupDescription,
      data?.groupInfo?.description,
      data?.groupInfo?.name,
      groupId,
      updateGroupInfo,
      cancelEditingDescription,
      onSuccessMessage,
      onErrorMessage,
      refetchGroupData,
    ]);

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
      <motion.div
        className="group-detail-cards-layout"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
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
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
        />

        <GroupSharedContentSection
          groupContent={groupContent}
          isLoadingGroupContent={isLoadingGroupContent}
          isFetchingGroupContent={isFetchingGroupContent}
          isAdmin={data?.isAdmin ?? false}
          onUnshare={(contentType: string, contentId: string) =>
            unshareContent(contentType, contentId)
          }
          isUnsharing={isUnsharing}
          groupId={groupId}
          onShareContent={async (contentType: string, itemId: string | number, options: any) => {
            shareContent(contentType, String(itemId), options);
          }}
          isSharing={isSharing}
          onRefetch={refetchGroupContent}
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={onErrorMessage}
        />
      </motion.div>
    );
  }
);

export default GroupDetailSection;
