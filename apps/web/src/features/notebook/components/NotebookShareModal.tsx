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
  CopyLinkRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
} from '@gruenerator/ui';
import { useEffect, useMemo, useRef } from 'react';
import { HiTrash } from 'react-icons/hi';

import { useAuthStore } from '../../../stores/authStore';
import { cn } from '../../../utils/cn';
import {
  useAddNotebookGroupShare,
  useMyGroupsForSharing,
  useNotebookGroupShares,
  useNotebookShareSettings,
  useRemoveNotebookGroupShare,
  useSetNotebookAudience,
  useSetNotebookEditPolicy,
  useSetNotebookIsPublic,
  useSetNotebookShareMode,
} from '../hooks/useNotebookSharing';

import type {
  NotebookEditPolicy,
  NotebookShareMode,
  PublicOwnership,
} from '@gruenerator/contracts';

interface NotebookShareModalProps {
  notebookId: string;
  /** Absolute URL of the notebook's viewer page, used for the copy-link row. */
  shareUrl: string;
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

export function NotebookShareModal({
  notebookId,
  shareUrl,
  open,
  onOpenChange,
}: NotebookShareModalProps) {
  const settingsQuery = useNotebookShareSettings(notebookId, open);
  const groupSharesQuery = useNotebookGroupShares(notebookId, open);
  const myGroupsQuery = useMyGroupsForSharing(open);

  const setShareMode = useSetNotebookShareMode(notebookId);
  const setEditPolicy = useSetNotebookEditPolicy(notebookId);
  const setAudience = useSetNotebookAudience(notebookId);
  const setIsPublic = useSetNotebookIsPublic(notebookId);
  const addGroupShare = useAddNotebookGroupShare(notebookId);
  const removeGroupShare = useRemoveNotebookGroupShare(notebookId);

  const userLocale = useAuthStore((s) => s.locale);
  const shareMode = settingsQuery.data?.share_mode ?? 'private';
  const editPolicy = settingsQuery.data?.edit_policy ?? 'owner_only';
  const isPublic = settingsQuery.data?.is_public ?? false;
  const publicOwnership = settingsQuery.data?.public_ownership ?? null;

  const sharedGroupIds = useMemo(
    () => new Set((groupSharesQuery.data ?? []).map((g) => g.group_id)),
    [groupSharesQuery.data]
  );
  const availableGroups = useMemo(
    () => (myGroupsQuery.data ?? []).filter((g) => !sharedGroupIds.has(g.id)),
    [myGroupsQuery.data, sharedGroupIds]
  );

  const editPolicyMeaningful = shareMode === 'groups';

  // Auto-pin audience to the owner's locale: legacy rows persist 'all' or even
  // the wrong country; the UI no longer offers a choice. Run at most once per
  // open() so we never thrash on refetch.
  const correctedRef = useRef(false);
  useEffect(() => {
    if (!open) {
      correctedRef.current = false;
      return;
    }
    if (correctedRef.current) return;
    if (settingsQuery.isLoading || !settingsQuery.data) return;
    if (settingsQuery.data.share_mode !== 'authenticated') return;
    if (settingsQuery.data.audience === userLocale) return;
    if (setAudience.isPending) return;
    correctedRef.current = true;
    setAudience.mutate(userLocale);
  }, [open, settingsQuery.data, settingsQuery.isLoading, userLocale, setAudience]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[42rem]">
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
          <div className="-mx-2 flex max-h-[70vh] flex-col gap-md overflow-y-auto px-2">
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

            <div>
              <p className="mb-xs text-sm font-semibold">Link zum Teilen</p>
              {shareMode === 'private' ? (
                <p className="text-xs text-grey-500">
                  Solange das Notebook privat ist, kann nur die Eigentümer*in es öffnen. Stelle die
                  Sichtbarkeit oben um, um einen Link zu teilen.
                </p>
              ) : (
                <>
                  <CopyLinkRow value={shareUrl} copyLabel="Link kopieren" copiedLabel="Kopiert" />
                  <p className="mt-xs text-xs text-grey-500">
                    {shareMode === 'authenticated'
                      ? 'Eingeloggte Nutzer*innen mit diesem Link können das Notebook öffnen.'
                      : 'Mitglieder der geteilten Gruppen können das Notebook über diesen Link öffnen.'}
                  </p>
                </>
              )}
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

            {shareMode === 'authenticated' ? (
              <>
                <p className="text-xs text-grey-500">
                  Sichtbar nur für eingeloggte Nutzer*innen aus deinem Land. Gruppen-Mitglieder und
                  Eigentümer*in sind nicht betroffen.
                </p>

                <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
                  <div className="space-y-xs">
                    <Label htmlFor="notebook-von-der-basis-toggle" className="text-sm">
                      Auf „Von der Basis" listen
                    </Label>
                    <p className="text-xs text-grey-500 dark:text-grey-400">
                      Dein Notebook erscheint dann auf der Notebooks-Seite zum Entdecken.
                    </p>
                  </div>
                  <Switch
                    id="notebook-von-der-basis-toggle"
                    checked={isPublic}
                    onCheckedChange={(checked) => {
                      if (!checked) {
                        setIsPublic.mutate({ is_public: false, public_ownership: null });
                      } else {
                        // Default to 'owner' on first activation — the most
                        // common case. User can change via the buttons below.
                        setIsPublic.mutate({
                          is_public: true,
                          public_ownership: publicOwnership ?? 'owner',
                        });
                      }
                    }}
                    disabled={setIsPublic.isPending}
                  />
                </div>

                {isPublic ? (
                  <div className="space-y-sm">
                    <p className="text-sm text-foreground-heading">Bitte bestätige:</p>
                    <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                      {(['owner', 'public_data'] as const).map((choice: PublicOwnership) => (
                        <button
                          key={choice}
                          type="button"
                          onClick={() =>
                            setIsPublic.mutate({ is_public: true, public_ownership: choice })
                          }
                          disabled={setIsPublic.isPending}
                          className={cn(
                            'flex flex-col gap-xs rounded-lg border p-md text-left transition-colors',
                            publicOwnership === choice
                              ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                              : 'border-grey-200 hover:border-primary-300 dark:border-grey-700 dark:hover:border-primary-600'
                          )}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {choice === 'owner'
                              ? 'Ich besitze die Daten'
                              : 'Daten sind öffentlich verfügbar'}
                          </span>
                          <span className="text-xs text-grey-500">
                            {choice === 'owner'
                              ? '… oder habe die Rechte zur Veröffentlichung'
                              : 'z.B. offizielle Dokumente, Pressemitteilungen'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
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
