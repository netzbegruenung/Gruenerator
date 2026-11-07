import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { canShareIntoGroup } from '@gruenerator/shared/groups';
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
  useConfirm,
} from '@gruenerator/ui';
import { useState } from 'react';
import { HiDotsVertical, HiOutlineTrash, HiPencil, HiShare, HiUserGroup } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { getPublicAppOrigin } from '../../../utils/platform';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { useGroups } from '../../groups/hooks/useGroups';
import { useTrashUndoToast } from '../../trash/trashUndoToast';

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
function OwnNotebookActions({ collection }: { collection: NotebookCollection }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const showTrashUndo = useTrashUndoToast();
  const { deleteQACollection } = useNotebookCollections({ isActive: true });
  const { userGroups = [] } = useGroups({ isActive: true });
  const groups = userGroups.filter(canShareIntoGroup) as { id: string; name: string }[];
  const [shareFlash, flashShare] = useFlash();
  const [deleteFlash, flashDelete] = useFlash();
  const [deleting, setDeleting] = useState(false);
  const slug = collectionSlug(collection);

  const copyLink = () => {
    // Kanonisch: `/notebooks/<slug>` — die Alt-Route `/notebook/:id` leitet nur weiter.
    void navigator.clipboard.writeText(`${getPublicAppOrigin()}/notebooks/${slug}`);
    flashShare('Link kopiert!');
  };

  const shareToGroup = async (groupId: string) => {
    try {
      const res = await getContractsClient().groups.shareContent({
        params: { groupId },
        body: {
          contentType: 'notebook_collections',
          contentId: collection.id,
          permissions: { read: true, write: false, collaborative: false },
        },
      });
      if (res.status !== 200) throw new ApiError(res.status, 'share failed');
      flashShare('Geteilt!');
    } catch {
      flashShare('Fehler!');
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
          {groups.map((group) => (
            <DropdownMenuItem key={group.id} onClick={() => void shareToGroup(group.id)}>
              <HiUserGroup />
              {group.name}
            </DropdownMenuItem>
          ))}
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
