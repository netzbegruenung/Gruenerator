import { apiErrorFromResponse, getContractsClient, shareErrorText } from '@gruenerator/shared/api';
import { canShareIntoGroup, groupContentKey } from '@gruenerator/shared/groups';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  cn,
  toast,
  useConfirm,
} from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  HiCheck,
  HiDotsVertical,
  HiOutlineTrash,
  HiPencil,
  HiShare,
  HiUserGroup,
} from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups } from '../../groups/hooks/useGroups';
import { useTrashUndoToast } from '../../trash/trashUndoToast';
import { useNotebookGroupShares } from '../hooks/useNotebookSharing';

import { collectionSlug } from './useNotebookShelves';

import type { NotebookCollection } from '../../../types/notebook';

import { DASH_FOCUS } from '@/components/dashboard/dashboardStyles';

/** Kurze Rückmeldung im Menüeintrag selbst („Link kopiert!"), dann wieder der normale Text. */
function useFlash(): [string | null, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  return [
    msg,
    (next) => {
      setMsg(next);
      setTimeout(() => setMsg(null), 2000);
    },
  ];
}

/**
 * Die Einträge des Menüs. Eigene Komponente, weil Radix den Inhalt erst beim
 * Öffnen einhängt: die Abfragen (Notebooks, Projekte) laufen so nur bei
 * geöffnetem Menü — sonst rendert jede Karte der Liste bei jedem Ladeschritt
 * mit. Das Löschen läuft nach dem Schließen weiter (`mutateAsync`).
 */
export function OwnNotebookActions({ collection }: { collection: NotebookCollection }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const showTrashUndo = useTrashUndoToast();
  const { deleteQACollection } = useNotebookCollections({ isActive: true });
  const { userGroups = [] } = useGroups({ isActive: true });
  const groups = userGroups.filter(canShareIntoGroup) as { id: string; name: string }[];
  // Projekte, in denen das Notebook schon liegt: markiert statt ein zweites Mal
  // anzubieten (der Server antwortete sonst mit 409).
  const sharesQuery = useNotebookGroupShares(collection.id, true);
  const sharedIn = new Set((sharesQuery.data ?? []).map((share) => share.group_id));
  const queryClient = useQueryClient();
  const [shareFlash, flashShare] = useFlash();
  const [deleteFlash, flashDelete] = useFlash();
  const [deleting, setDeleting] = useState(false);
  const slug = collectionSlug(collection);

  const copyLink = () => {
    // Kanonisch: `/notebooks/<slug>` — die Alt-Route `/notebook/:id` leitet nur weiter.
    void navigator.clipboard.writeText(`${getPublicAppOrigin()}/notebooks/${slug}`);
    flashShare('Link kopiert!');
  };

  const shareToGroup = async (groupId: string, groupName: string) => {
    try {
      const res = await getContractsClient().groups.shareContent({
        params: { groupId },
        body: {
          contentType: 'notebook_collections',
          contentId: collection.id,
          permissions: { read: true, write: false, collaborative: false },
        },
      });
      if (res.status !== 200) throw apiErrorFromResponse(res);
      void queryClient.invalidateQueries({ queryKey: groupContentKey(groupId) });
      void sharesQuery.refetch();
      toast(`Zu „${groupName}“ hinzugefügt`);
    } catch (error) {
      // Dieselben Sätze wie auf der Projektseite statt „Fehler!“ im Menütitel.
      toast.error(shareErrorText(error));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Notebook löschen?',
      description: `„${collection.name}“ wird in den Papierkorb verschoben und kann 30 Tage lang wiederhergestellt werden.`,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteQACollection(collection.id);
      showTrashUndo({ kind: 'notebook', id: collection.id, title: collection.name });
    } catch {
      flashDelete('Fehler!');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DropdownMenuItem onClick={() => void navigate(`/notebooks/${slug}/bearbeiten`)}>
        <HiPencil />
        Bearbeiten
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HiShare />
          {shareFlash ?? 'Teilen'}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={copyLink}>
            <HiShare />
            Link kopieren
          </DropdownMenuItem>
          {groups.length > 0 && <DropdownMenuSeparator />}
          {groups.map((group) =>
            sharedIn.has(group.id) ? (
              <DropdownMenuItem key={group.id} disabled>
                <HiCheck />
                {group.name}
                <span className="ml-auto text-xs text-muted-foreground">Im Projekt</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={group.id}
                onClick={() => void shareToGroup(group.id, group.name)}
              >
                <HiUserGroup />
                {group.name}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
        <HiOutlineTrash />
        {deleteFlash ?? (deleting ? 'Wird gelöscht…' : 'Löschen')}
      </DropdownMenuItem>
    </>
  );
}

/**
 * Aktionen an einem eigenen Notebook: Bearbeiten, Link kopieren, in ein
 * Projekt teilen, in den Papierkorb legen. Braucht einen
 * `ConfirmDialogProvider` darüber.
 */
export function OwnNotebookMenu({ collection }: { collection: NotebookCollection }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Aktionen für ${collection.name}`}
          className={cn(
            'flex size-7 cursor-pointer items-center justify-center rounded-full text-(--dash-mg) transition-colors hover:bg-(--dash-mg-tint)',
            DASH_FOCUS
          )}
        >
          <HiDotsVertical size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <OwnNotebookActions collection={collection} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
