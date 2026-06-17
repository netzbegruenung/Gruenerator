import { getContractsClient } from '@gruenerator/shared/api';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { getPublicAppOrigin } from '../../../utils/platform';
import { getNotebookById } from '../../notebook/config/notebooksConfig';
import { useGroupPresence } from '../hooks/useGroupPresence';
import { useGroups, useGroupAvatar, useGroupLinks, useGroupSharing } from '../hooks/useGroups';

import GroupInfoSection, { type GroupData, type SharedItem } from './GroupInfoSection';

interface GroupDetailSectionProps {
  groupId: string;
  onSuccessMessage: (msg: string) => void;
  onErrorMessage: (msg: string) => void;
}

const GroupDetailSection = memo(
  ({ groupId, onSuccessMessage, onErrorMessage }: GroupDetailSectionProps) => {
    const user = useAuthStore((s) => s.user);
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
        const res = await getContractsClient().groups.getDetails({ params: { groupId } });
        if (res.status !== 200) throw new Error('Failed to fetch group details');
        return {
          groupInfo: res.body.group,
          isAdmin: res.body.membership.isAdmin,
          membership: res.body.membership,
          joinToken: res.body.group.join_token ?? undefined,
          knowledge: [] as unknown[],
        };
      },
      enabled: !!groupId,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: 'always' as const,
    });

    const data = rawData as GroupData | undefined;

    const navigate = useNavigate();

    const { deleteGroup, isDeletingGroup, updateGroupName, updateGroupInfo, isUpdatingGroupName } =
      useGroups({ isActive: true });

    const { uploadAvatar, isUploadingAvatar, deleteAvatar, isDeletingAvatar } =
      useGroupAvatar(groupId);

    const { addLink, updateLink, deleteLink, isAddingLink, isUpdatingLink } =
      useGroupLinks(groupId);

    const { groupContent, isLoadingGroupContent, unshareContent, refetchGroupContent } =
      useGroupSharing(groupId, { isActive: true });

    const sharedContent = useMemo(() => {
      interface CollabDoc extends SharedItem {
        document_subtype?: string;
      }
      interface SystemNotebook {
        id: string;
        [key: string]: unknown;
      }
      const allCollabDocs = (groupContent?.collaborative_documents ?? []) as CollabDoc[];

      const collabDocs: CollabDoc[] = [];
      const boards: CollabDoc[] = [];
      const canvases: CollabDoc[] = [];
      for (const doc of allCollabDocs) {
        switch (doc.document_subtype) {
          case 'boards':
            boards.push(doc);
            break;
          case 'canvas':
            canvases.push(doc);
            break;
          case 'blank':
          case undefined:
          case null:
          case '':
            collabDocs.push(doc);
            break;
          default:
            console.warn(
              '[GroupDetailSection] Unknown document_subtype, bucketing as Doc:',
              doc.document_subtype,
              doc.id
            );
            collabDocs.push(doc);
        }
      }

      return {
        collabDocs,
        boards,
        canvases,
        documents: (groupContent?.documents ?? []) as SharedItem[],
        generators: (groupContent?.generators ?? []) as SharedItem[],
        notebooks: [
          ...((groupContent?.notebooks ?? []) as SystemNotebook[]),
          ...((groupContent?.system_notebooks ?? []) as SystemNotebook[]).map((nb) => {
            const config = getNotebookById(nb.id);
            return { ...nb, name: config?.title ?? nb.id };
          }),
        ] as SharedItem[],
        texts: (groupContent?.texts ?? []) as SharedItem[],
        canvasTemplates: (groupContent?.canvas_templates ?? []) as SharedItem[],
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
      return `${getPublicAppOrigin()}/join-group/${data.joinToken}`;
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
        onSuccess: () => navigate('/'),
        onError: (error: Error) =>
          onErrorMessage(`Fehler beim Löschen der Gruppe: ${error.message}`),
      });
    }, [groupId, data?.isAdmin, deleteGroup, navigate, onErrorMessage]);

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
          onSuccessMessage={onSuccessMessage}
          onErrorMessage={onErrorMessage}
        />
      </motion.div>
    );
  }
);

export default GroupDetailSection;
