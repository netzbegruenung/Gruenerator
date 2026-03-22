import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';

import apiClient from '../../../components/utils/apiClient';
import { useOptimizedAuth } from '../../../hooks/useAuth';
import { getNotebookById } from '../../notebook/config/notebooksConfig';
import { useGroupPresence } from '../hooks/useGroupPresence';
import { useGroups, useGroupAvatar, useGroupLinks, useGroupSharing } from '../hooks/useGroups';

import GroupInfoSection, { type GroupData } from './GroupInfoSection';

interface GroupDetailSectionProps {
  groupId: string;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

const GroupDetailSection = memo(
  ({ groupId, onSuccessMessage, onErrorMessage }: GroupDetailSectionProps) => {
    const { user } = useOptimizedAuth();
    const { onlineMembers } = useGroupPresence(
      groupId,
      user ? { id: user.id, name: user.display_name || user.email || 'User' } : null
    );
    const onlineUserIds = useMemo(() => new Set(onlineMembers.map((m) => m.id)), [onlineMembers]);

    const [isEditingName, setIsEditingName] = useState(false);
    const [editedGroupName, setEditedGroupName] = useState('');
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedGroupDescription, setEditedGroupDescription] = useState('');
    const [joinLinkCopied, setJoinLinkCopied] = useState(false);

    const isInitialized = useRef(false);

    const {
      data: rawData,
      isLoading: isLoadingDetails,
      isError: isErrorDetails,
      error: errorDetails,
      refetch: refetchGroupData,
    } = useQuery({
      queryKey: ['groupDetails', groupId],
      queryFn: async () => {
        const response = await apiClient.get(`/auth/groups/${groupId}/details`);
        const result = response.data;
        if (!result.success) throw new Error(result.message || 'Failed to fetch group details');
        return {
          groupInfo: result.group,
          isAdmin: result.membership.isAdmin,
          membership: result.membership,
          joinToken: result.group?.join_token,
          knowledge: result.knowledge || [],
        };
      },
      enabled: !!groupId,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always' as const,
    });

    const data = rawData as GroupData | undefined;

    const { deleteGroup, isDeletingGroup, updateGroupName, updateGroupInfo, isUpdatingGroupName } =
      useGroups({ isActive: true });

    const { uploadAvatar, isUploadingAvatar, deleteAvatar, isDeletingAvatar } =
      useGroupAvatar(groupId);

    const { addLink, updateLink, deleteLink, isAddingLink, isUpdatingLink } =
      useGroupLinks(groupId);

    const { groupContent, isLoadingGroupContent, unshareContent, refetchGroupContent } =
      useGroupSharing(groupId, { isActive: true });

    const sharedContent = useMemo(() => {
      const allCollabDocs = groupContent?.collaborative_documents || [];
      return {
        collabDocs: allCollabDocs.filter((d: any) => d.document_subtype !== 'boards'),
        boards: allCollabDocs.filter((d: any) => d.document_subtype === 'boards'),
        documents: groupContent?.documents || [],
        generators: groupContent?.generators || [],
        notebooks: [
          ...(groupContent?.notebooks || []),
          ...(groupContent?.system_notebooks || []).map((nb: any) => {
            const config = getNotebookById(nb.id);
            return { ...nb, name: config?.title ?? nb.id };
          }),
        ],
        texts: groupContent?.texts || [],
      };
    }, [groupContent]);

    useEffect(() => {
      if (!data) return;
      if (!isInitialized.current) {
        setEditedGroupName(data.groupInfo?.name || '');
        setEditedGroupDescription(data.groupInfo?.description || '');
        isInitialized.current = true;
      }
    }, [data]);

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
        { name: data?.groupInfo?.name ?? '', description: editedGroupDescription },
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
        <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Fehler beim Laden der Gruppendetails: {errorDetails?.message || 'Unbekannter Fehler'}
        </div>
      );
    }

    return (
      <motion.div
        className="flex flex-col gap-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <GroupInfoSection
          data={data}
          groupId={groupId}
          currentUserId={user?.id}
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
          onlineUserIds={onlineUserIds}
          sharedContent={sharedContent}
          isLoadingSharedContent={isLoadingGroupContent}
          onUnshareContent={(contentId, contentType) => {
            if (window.confirm('Inhalt aus der Gruppe entfernen?')) {
              unshareContent.mutate({ contentId, contentType });
            }
          }}
          refetchSharedContent={refetchGroupContent}
          onUploadAvatar={(file) => uploadAvatar(file)}
          onDeleteAvatar={() => deleteAvatar()}
          isUploadingAvatar={isUploadingAvatar || isDeletingAvatar}
          onAddLink={addLink}
          onUpdateLink={updateLink}
          onDeleteLink={deleteLink}
          isAddingLink={isAddingLink}
          isUpdatingLink={isUpdatingLink}
        />
      </motion.div>
    );
  }
);

export default GroupDetailSection;
