/**
 * Modal for managing user-agent (Agentura) sharing: visibility
 * (private/groups/authenticated), the set of groups the agent is shared with,
 * and the "Von der Basis" public-discovery toggle. That toggle is shown in
 * every visibility mode; enabling it from a lower mode auto-promotes
 * visibility to 'authenticated' first (the backend invariant for a listing).
 *
 * Owner-only: callers must gate by ownership before opening — the server still
 * rejects non-owners with 404/403, but rendering the modal for them is bad UX.
 * Agents are USED, not co-edited, so there is no edit-policy axis.
 */
import {
  Button,
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
import { useMemo } from 'react';
import { HiTrash } from 'react-icons/hi';
import { PiLink } from 'react-icons/pi';

import {
  useAddAgentGroupShare,
  useAgentGroupShares,
  useAgentShareSettings,
  useMyGroupsForSharing,
  useRemoveAgentGroupShare,
  useSetAgentIsPublic,
  useSetAgentShareMode,
} from '../hooks/useAgentSharing';

import type { PublicOwnership, UserAgentShareMode } from '@gruenerator/contracts';

import { cn } from '@/utils/cn';

interface ShareAgentModalProps {
  /** The agent's per-user identifier (slug). */
  identifier: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHARE_MODE_LABELS: Record<UserAgentShareMode, string> = {
  private: 'Privat — nur ich',
  groups: 'Mit Gruppen geteilt',
  authenticated: 'Mit Anmeldung — alle eingeloggten Nutzer*innen',
};

export function ShareAgentModal({ identifier, open, onOpenChange }: ShareAgentModalProps) {
  const settingsQuery = useAgentShareSettings(identifier, open);
  const groupSharesQuery = useAgentGroupShares(identifier, open);
  const myGroupsQuery = useMyGroupsForSharing(open);

  const setShareMode = useSetAgentShareMode(identifier);
  const setIsPublic = useSetAgentIsPublic(identifier);
  const addGroupShare = useAddAgentGroupShare(identifier);
  const removeGroupShare = useRemoveAgentGroupShare(identifier);

  const shareMode = settingsQuery.data?.share_mode ?? 'private';
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

  const handleCopyLink = () => {
    void navigator.clipboard?.writeText(window.location.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[42rem]">
        <DialogHeader>
          <DialogTitle>Agent*in teilen</DialogTitle>
          <DialogDescription>
            Lege fest, wer diese*n Agent*in sehen und im Chat nutzen darf.
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
                onValueChange={(v) => setShareMode.mutate(v as UserAgentShareMode)}
                disabled={setShareMode.isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SHARE_MODE_LABELS) as UserAgentShareMode[]).map((m) => (
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
                    Du bist noch in keiner Gruppe. Tritt einer Gruppe bei, um Agent*innen zu teilen.
                  </p>
                ) : null}
              </div>
            ) : null}

            {shareMode === 'authenticated' ? (
              <p className="text-xs text-grey-500">
                Sichtbar nur für eingeloggte Nutzer*innen aus deinem Land.
              </p>
            ) : null}

            {/* "Von der Basis" public listing. Shown in every visibility mode so
                it's discoverable — enabling it from a lower mode first promotes
                Sichtbarkeit to 'authenticated' (the backend invariant for an
                Agentura listing), then lists the agent. */}
            <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
              <div className="space-y-xs">
                <Label htmlFor="agent-agentura-toggle" className="text-sm">
                  Auf „Von der Basis“ listen
                </Label>
                <p className="text-xs text-grey-500 dark:text-grey-400">
                  Dein*e Agent*in erscheint dann in der Agentura unter „Von der Basis“ zum
                  Entdecken.
                </p>
                {!isPublic && shareMode !== 'authenticated' ? (
                  <p className="text-xs text-grey-500 dark:text-grey-400">
                    Beim Aktivieren wird die Sichtbarkeit auf „Mit Anmeldung — alle eingeloggten
                    Nutzer*innen“ gesetzt.
                  </p>
                ) : null}
              </div>
              <Switch
                id="agent-agentura-toggle"
                checked={isPublic}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    setIsPublic.mutate({ is_public: false, public_ownership: null });
                    return;
                  }
                  // Default to 'owner' on first activation — the most common
                  // case. User can change via the buttons below.
                  const list = () =>
                    setIsPublic.mutate({
                      is_public: true,
                      public_ownership: publicOwnership ?? 'owner',
                    });
                  // Backend rejects is_public unless share_mode='authenticated';
                  // promote first, then list (sequenced so the listing call sees
                  // the freshly-updated row).
                  if (shareMode !== 'authenticated') {
                    void setShareMode.mutateAsync('authenticated').then(list);
                  } else {
                    list();
                  }
                }}
                disabled={setIsPublic.isPending || setShareMode.isPending}
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
                          ? 'Ich besitze die Inhalte'
                          : 'Inhalte sind öffentlich verfügbar'}
                      </span>
                      <span className="text-xs text-grey-500">
                        {choice === 'owner'
                          ? '… oder habe die Rechte zur Veröffentlichung'
                          : 'z.B. offizielle Inhalte, Pressematerial'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <Separator />

            <Button variant="outline" size="sm" className="self-start" onClick={handleCopyLink}>
              <PiLink className="mr-xs" />
              Link kopieren
            </Button>
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
