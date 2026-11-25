import { type SiteMember, type SiteRole } from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useState, type RefObject } from 'react';

import { type SiteData } from '../../hooks/useSite';
import { SiteMemberError, useSiteProjects, useSiteSharing } from '../../hooks/useSiteSharing';
import { useAuth } from '../../SitesContext';

export const LAST_ADMIN_MESSAGE = 'Mindestens eine Person muss Admin bleiben.';

const ROLE_LABELS: Record<SiteRole, string> = {
  admin: 'Admin',
  editor: 'Bearbeiten',
  viewer: 'Ansehen',
};
const ROLES: readonly SiteRole[] = ['admin', 'editor', 'viewer'];

// `min-w-0 max-w-full`: a native select is as wide as its longest option and would
// otherwise push the dialog column past its edge (long project names).
const selectClass =
  'min-w-0 max-w-full rounded-md border border-grey-300 bg-background px-sm py-xs text-sm text-foreground dark:border-grey-600';

function errorText(error: unknown, fallback: string): string {
  if (error instanceof SiteMemberError) {
    if (error.code === 'last_admin') return LAST_ADMIN_MESSAGE;
    if (error.code === 'not_eligible') return 'Diese Person kann nicht hinzugefügt werden.';
  }
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) return 'Dafür fehlt dir die Berechtigung.';
  return fallback;
}

function MemberRow({
  member,
  isSelf,
  onRole,
  onRemove,
}: {
  member: SiteMember;
  isSelf: boolean;
  onRole: (role: SiteRole) => void;
  onRemove: () => void;
}) {
  const name = member.displayName ?? 'Unbekannt';
  // Project admins and project shares give the role; only direct memberships are edited here.
  const direct = member.source === 'member';
  return (
    <li className="flex flex-wrap items-center gap-sm py-xs">
      <span className="min-w-0 flex-1 truncate text-sm text-foreground max-sm:basis-full">
        {name}
        {isSelf && ' (du)'}
      </span>
      {direct ? (
        <>
          <select
            aria-label={`Rolle von ${name}`}
            className={selectClass}
            value={member.role}
            onChange={(e) => onRole(e.target.value as SiteRole)}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Entfernen<span className="sr-only"> {name}</span>
          </Button>
        </>
      ) : (
        <span className="text-sm text-grey-600 dark:text-grey-400">
          {ROLE_LABELS[member.role]} · über Projekt
        </span>
      )}
    </li>
  );
}

function ShareBody({ site, isProjectSite }: { site: SiteData; isProjectSite: boolean }) {
  const { user } = useAuth();
  const sharing = useSiteSharing(site.id, true, !isProjectSite);
  const projects = useSiteProjects();
  const [message, setMessage] = useState<string | null>(null);
  const [pick, setPick] = useState('');

  const members = sharing.members.data ?? [];
  const shares = sharing.groups.data ?? [];
  const sharedIds = new Set(shares.map((g) => g.groupId));
  const options = (projects.data ?? []).filter((g) => !sharedIds.has(g.id));

  const run = async (action: Promise<unknown>, fallback: string) => {
    setMessage(null);
    try {
      await action;
    } catch (error) {
      setMessage(errorText(error, fallback));
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Website teilen</DialogTitle>
        <DialogDescription id="site-share-desc">
          Lege fest, wer diese Website bearbeitet oder ansieht.
        </DialogDescription>
      </DialogHeader>

      {message && (
        <p role="alert" className="m-0 min-w-0 text-sm text-red-600 dark:text-red-400">
          {message}
        </p>
      )}

      <section aria-labelledby="share-people" className="min-w-0">
        <h3 id="share-people" className="mb-xs text-base font-semibold text-foreground">
          Personen
        </h3>
        {sharing.members.isLoading ? (
          <p className="m-0 text-sm text-grey-600 dark:text-grey-400">Wird geladen …</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {members.map((member) => (
              <MemberRow
                key={`${member.userId}-${member.source}-${member.groupId ?? ''}`}
                member={member}
                isSelf={member.userId === user?.id}
                onRole={(role) =>
                  void run(
                    sharing.setRole.mutateAsync({ userId: member.userId, role }),
                    'Die Rolle konnte nicht geändert werden.'
                  )
                }
                onRemove={() =>
                  void run(
                    sharing.removeMember.mutateAsync(member.userId),
                    'Die Person konnte nicht entfernt werden.'
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      {!isProjectSite && (
        <section aria-labelledby="share-projects" className="min-w-0">
          <h3 id="share-projects" className="mb-xs text-base font-semibold text-foreground">
            Projekte
          </h3>
          <ul className="m-0 list-none p-0">
            {shares.map((share) => (
              <li key={share.groupId} className="flex flex-wrap items-center gap-sm py-xs">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground max-sm:basis-full">
                  {share.name}
                </span>
                <select
                  aria-label={`Zugriff für ${share.name}`}
                  className={selectClass}
                  value={share.write ? 'write' : 'read'}
                  onChange={(e) =>
                    void run(
                      sharing.shareToGroup.mutateAsync({
                        groupId: share.groupId,
                        write: e.target.value === 'write',
                      }),
                      'Die Freigabe konnte nicht geändert werden.'
                    )
                  }
                >
                  <option value="write">Bearbeiten</option>
                  <option value="read">Ansehen</option>
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void run(
                      sharing.unshareFromGroup.mutateAsync(share.groupId),
                      'Die Freigabe konnte nicht entfernt werden.'
                    )
                  }
                >
                  Entfernen<span className="sr-only"> {share.name}</span>
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-xs flex flex-wrap items-center gap-sm">
            <select
              aria-label="Projekt hinzufügen"
              className={`${selectClass} flex-1`}
              value={pick}
              onChange={(e) => setPick(e.target.value)}
            >
              <option value="">Projekt wählen …</option>
              {options.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pick === ''}
              onClick={() => {
                const groupId = pick;
                setPick('');
                void run(
                  sharing.shareToGroup.mutateAsync({ groupId, write: true }),
                  'Die Website konnte nicht geteilt werden.'
                );
              }}
            >
              Teilen
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

export function SiteShareDialog({
  site,
  isProjectSite,
  open,
  onOpenChange,
  returnFocusRef,
}: {
  site: SiteData;
  /** The by-handle `group` is set: the site belongs to a project and has no project shares. */
  isProjectSite: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby="site-share-desc"
        onCloseAutoFocus={(e) => {
          const target = returnFocusRef?.current;
          if (target?.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        <ShareBody site={site} isProjectSite={isProjectSite} />
      </DialogContent>
    </Dialog>
  );
}
