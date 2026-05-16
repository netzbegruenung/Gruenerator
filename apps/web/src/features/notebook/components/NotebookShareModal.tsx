/**
 * Modal for managing notebook sharing: visibility (private/groups/authenticated),
 * edit policy (owner_only/group_admins/all_members), and the set of groups the
 * notebook is shared with.
 *
 * Owner-only: callers must gate by ownership before opening — the server still
 * rejects non-owners with 403, but rendering the modal for them is bad UX.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@gruenerator/ui';
import { useMemo } from 'react';
import { HiTrash } from 'react-icons/hi';

import {
  useAddNotebookGroupShare,
  useMyGroupsForSharing,
  useNotebookGroupShares,
  useNotebookShareSettings,
  useRemoveNotebookGroupShare,
  useSetNotebookEditPolicy,
  useSetNotebookShareMode,
} from '../hooks/useNotebookSharing';

import type { NotebookEditPolicy, NotebookShareMode } from '@gruenerator/contracts';

interface NotebookShareModalProps {
  notebookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHARE_MODE_LABELS: Record<NotebookShareMode, string> = {
  private: 'Privat — nur ich',
  groups: 'Mit Gruppen geteilt',
  authenticated: 'Mit Anmeldung — alle eingeloggten Nutzer*innen',
};

const EDIT_POLICY_LABELS: Record<NotebookEditPolicy, string> = {
  owner_only: 'Nur ich',
  group_admins: 'Gruppen-Admins der geteilten Gruppen',
  all_members: 'Alle Mitglieder der geteilten Gruppen',
};

export function NotebookShareModal({ notebookId, open, onOpenChange }: NotebookShareModalProps) {
  const settingsQuery = useNotebookShareSettings(notebookId, open);
  const groupSharesQuery = useNotebookGroupShares(notebookId, open);
  const myGroupsQuery = useMyGroupsForSharing(open);

  const setShareMode = useSetNotebookShareMode(notebookId);
  const setEditPolicy = useSetNotebookEditPolicy(notebookId);
  const addGroupShare = useAddNotebookGroupShare(notebookId);
  const removeGroupShare = useRemoveNotebookGroupShare(notebookId);

  const shareMode = settingsQuery.data?.share_mode ?? 'private';
  const editPolicy = settingsQuery.data?.edit_policy ?? 'owner_only';

  const sharedGroupIds = useMemo(
    () => new Set((groupSharesQuery.data ?? []).map((g) => g.group_id)),
    [groupSharesQuery.data]
  );
  const availableGroups = useMemo(
    () => (myGroupsQuery.data ?? []).filter((g) => !sharedGroupIds.has(g.id)),
    [myGroupsQuery.data, sharedGroupIds]
  );

  const editPolicyMeaningful = shareMode === 'groups';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Notebook teilen</DialogTitle>
          <DialogDescription>
            Lege fest, wer dieses Notebook sehen und bearbeiten darf.
          </DialogDescription>
        </DialogHeader>

        {settingsQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Keine Berechtigung, die Freigabe-Einstellungen zu verwalten.
          </p>
        ) : null}

        {settingsQuery.isLoading ? (
          <p className="text-sm text-grey-500">Wird geladen…</p>
        ) : settingsQuery.data ? (
          <div className="flex flex-col gap-md">
            <div>
              <p className="mb-xs text-sm font-semibold">Sichtbarkeit</p>
              <Select
                value={shareMode}
                onValueChange={(v) => setShareMode.mutate(v as NotebookShareMode)}
                disabled={setShareMode.isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SHARE_MODE_LABELS) as NotebookShareMode[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {SHARE_MODE_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {shareMode === 'groups' ? (
              <div>
                <p className="mb-xs text-sm font-semibold">Gruppen</p>
                {groupSharesQuery.data && groupSharesQuery.data.length > 0 ? (
                  <ul className="mb-xs flex flex-col gap-xs">
                    {groupSharesQuery.data.map((share) => (
                      <li
                        key={share.group_id}
                        className="flex items-center justify-between rounded-md border border-grey-200 bg-background p-xs dark:border-grey-700"
                      >
                        <span className="truncate text-sm">{share.group_name}</span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => removeGroupShare.mutate(share.group_id)}
                          disabled={removeGroupShare.isPending}
                          aria-label={`${share.group_name} entfernen`}
                        >
                          <HiTrash size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-xs text-xs text-grey-500">Noch keine Gruppen hinzugefügt.</p>
                )}
                {availableGroups.length > 0 ? (
                  <Select
                    value=""
                    onValueChange={(v) => {
                      if (v) addGroupShare.mutate(v);
                    }}
                    disabled={addGroupShare.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Gruppe hinzufügen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGroups.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : myGroupsQuery.data && myGroupsQuery.data.length === 0 ? (
                  <p className="text-xs text-grey-500">
                    Du bist noch in keiner Gruppe. Tritt einer Gruppe bei, um Notebooks zu teilen.
                  </p>
                ) : null}
              </div>
            ) : null}

            <Separator />

            <div>
              <p className="mb-xs text-sm font-semibold">Wer darf bearbeiten?</p>
              <Select
                value={editPolicy}
                onValueChange={(v) => setEditPolicy.mutate(v as NotebookEditPolicy)}
                disabled={setEditPolicy.isPending || shareMode === 'private'}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(EDIT_POLICY_LABELS) as NotebookEditPolicy[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {EDIT_POLICY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shareMode === 'private' ? (
                <p className="mt-xs text-xs text-grey-500">
                  Bei privaten Notebooks kann nur die Eigentümer*in bearbeiten.
                </p>
              ) : null}
              {shareMode === 'authenticated' && editPolicy !== 'owner_only' ? (
                <p className="mt-xs text-xs text-grey-500">
                  Diese Option wirkt nur, wenn das Notebook zusätzlich mit Gruppen geteilt wird.
                </p>
              ) : null}
              {editPolicyMeaningful && (groupSharesQuery.data?.length ?? 0) === 0 ? (
                <p className="mt-xs text-xs text-grey-500">
                  Füge oben Gruppen hinzu, damit Mitglieder bearbeiten können.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
