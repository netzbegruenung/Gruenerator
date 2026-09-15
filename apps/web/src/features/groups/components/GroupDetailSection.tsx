import { SYSTEM_AGENTS } from '@gruenerator/shared/agents';
import {
  apiErrorFromResponse,
  getContractsClient,
  isApiErrorWithStatus,
} from '@gruenerator/shared/api';
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
        if (res.status !== 200)
          throw apiErrorFromResponse(res, 'Fehler beim Laden der Gruppendetails.');
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
      // This component renders the failure inline (including the 403 "no
      // access" panel below), so the global toast layer stays out of it.
      meta: { silent: true },
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
        // User agents carry their full Agent shape (incl. identifier/title);
        // system agents arrive as { id: identifier } and get their title from
        // the static registry, mirroring the system_notebooks hydration above.
        agents: [
          ...((groupContent?.user_agents ?? []) as SharedItem[]),
          ...((groupContent?.system_agents ?? []) as SystemNotebook[]).map((sa) => {
            const sys = SYSTEM_AGENTS.find((a) => a.identifier === sa.id);
            return { ...sa, identifier: sa.id, title: sys?.title ?? sa.id };
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
        onError: (error: Error) => onErrorMessage(`Fehler beim Löschen: ${error.message}`),
      });
    }, [groupId, data?.isAdmin, deleteGroup, navigate, onErrorMessage, onSuccessMessage]);

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
          onSuccessMessage('Name erfolgreich geändert!');
          void refetchGroupData();
        },
        onError: (error: Error) => {
          onErrorMessage('Fehler beim Ändern des Namens: ' + error.message);
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
            onSuccessMessage('Beschreibung erfolgreich geändert!');
            void refetchGroupData();
          },
          onError: (error: Error) => {
            onErrorMessage('Fehler beim Ändern der Beschreibung: ' + error.message);
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

    // Error branch first: a failed query has no `data`, so the `!data` bail
    // below used to swallow it and render a blank page (GlitchTip #590).
    if (isErrorDetails) {
      // 403 is the designed answer for a non-member, not a fault — say so
      // plainly instead of showing a red error box.
      if (isApiErrorWithStatus(errorDetails, 403)) {
        return (
          <div className="rounded-md border border-grey-200 bg-grey-50 p-lg text-center dark:border-grey-700 dark:bg-grey-800/40">
            <p className="text-base font-medium text-grey-900 dark:text-grey-100">
              Kein Zugriff auf dieses Projekt
            </p>
            <p className="mt-xs text-sm text-grey-600 dark:text-grey-400">
              {errorDetails?.message || 'Du bist nicht Mitglied dieser Gruppe.'}
            </p>
            <button
              type="button"
              onClick={() => void navigate('/projekte')}
              className="mt-md text-sm font-medium underline text-grey-700 dark:text-grey-300"
            >
              Zu meinen Projekten
            </button>
          </div>
        );
      }
      return (
        <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Fehler beim Laden der Gruppendetails: {errorDetails?.message || 'Unbekannter Fehler'}
        </div>
      );
    }

    if (isLoadingDetails || !data) {
      return null;
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
