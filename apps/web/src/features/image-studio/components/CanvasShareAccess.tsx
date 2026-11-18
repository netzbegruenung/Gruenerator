import { CollaboratorList } from '@gruenerator/docs';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PiCaretRight, PiLink, PiPlus, PiUsersThree } from 'react-icons/pi';

import { useCanvasSharing } from '../hooks/useCanvasSharing';

import type { ShareNav } from '@ggraphic/editor/shell';

/** Marks people who joined through the share link (server: GRANTED_BY_SHARE_LINK). */
const GRANTED_BY_SHARE_LINK = 'auto:share_link';

type LinkChoice = 'viewer' | 'editor' | 'off';
type Role = 'viewer' | 'editor';

const ROLE_LABELS: Record<Role, string> = { viewer: 'Ansehen', editor: 'Bearbeiten' };

const selectClass =
  'shrink-0 cursor-pointer rounded-md border border-[var(--editor-border)] bg-[var(--editor-tile)] py-1 pl-2 pr-1 text-xs text-[var(--editor-text)] outline-none focus-visible:border-[var(--editor-accent)]';

const badgeClass =
  'flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[var(--editor-active-bg)] text-xs font-semibold text-[var(--editor-active-fg)]';

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span aria-hidden="true" className={badgeClass}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-[var(--editor-text)]">{label}</span>
      {children}
    </div>
  );
}

function CopyLinkButton({ canvasId }: { canvasId: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/studio/canvas/${canvasId}`);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="mt-2 flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border-none bg-[var(--editor-green-deep)] text-sm font-semibold text-white transition-opacity hover:opacity-90"
    >
      {copied ? 'Kopiert' : 'Link kopieren'}
    </button>
  );
}

/** Sub-page: everyone with personal access, with role change and revoke. */
function PeoplePage({ canvasId }: { canvasId: string }) {
  const { collaborators, updatePermission, revokeAccess } = useCanvasSharing(canvasId);
  return (
    <CollaboratorList
      collaborators={collaborators}
      onUpdatePermission={(userId, permissionLevel) =>
        updatePermission.mutate({ userId, permissionLevel })
      }
      onRevoke={(userId) => revokeAccess.mutate(userId)}
    />
  );
}

function OwnerAccess({ canvasId, nav }: { canvasId: string; nav: ShareNav }) {
  const {
    collaborators,
    shareSettings,
    userGroups,
    canvasGroups,
    isLoading,
    setShareMode,
    setSharePermission,
    shareWithGroup,
    updateGroupPermission,
    unshareFromGroup,
  } = useCanvasSharing(canvasId);

  const [confirmOff, setConfirmOff] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addGroupId, setAddGroupId] = useState('');

  if (isLoading) {
    return (
      <div aria-busy="true" aria-label="Freigaben werden geladen" className="animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2">
            <span className="size-[30px] shrink-0 rounded-full bg-[var(--editor-tile)]" />
            <span className="h-3.5 flex-1 rounded bg-[var(--editor-tile)]" />
            <span className="h-6 w-20 rounded bg-[var(--editor-tile)]" />
          </div>
        ))}
        <div className="mt-2 h-10 rounded-lg bg-[var(--editor-tile)]" />
      </div>
    );
  }

  if (!shareSettings) {
    return (
      <p role="alert" className="m-0 py-2 text-sm text-[var(--editor-danger-fg)]">
        Die Freigabe-Einstellungen konnten nicht geladen werden.
      </p>
    );
  }

  const linkOn = shareSettings.share_mode !== 'private';
  const linkChoice: LinkChoice = linkOn ? shareSettings.share_permission : 'off';

  const people = collaborators.filter((c) => c.type !== 'group' && c.permission_level !== 'owner');
  const linkJoined = people.filter((c) => c.granted_by === GRANTED_BY_SHARE_LINK);
  const availableGroups = userGroups.filter((g) => !canvasGroups.some((s) => s.group_id === g.id));

  const applyLink = (choice: LinkChoice) => {
    setConfirmOff(false);
    if (choice === 'off') {
      setShareMode.mutate('private');
      return;
    }
    if (!linkOn) {
      setShareMode.mutate('authenticated', {
        onSuccess: () => {
          if (shareSettings.share_permission !== choice) setSharePermission.mutate(choice);
        },
      });
    } else if (shareSettings.share_permission !== choice) {
      setSharePermission.mutate(choice);
    }
  };

  const onLinkChange = (choice: LinkChoice) => {
    if (choice === 'off' && linkJoined.length > 0) {
      setConfirmOff(true);
      return;
    }
    applyLink(choice);
  };

  const onGroupChange = (groupId: string, value: Role | 'remove') => {
    if (value === 'remove') unshareFromGroup.mutate(groupId);
    else updateGroupPermission.mutate({ groupId, permissionLevel: value });
  };

  const addGroup = () => {
    if (!addGroupId) return;
    shareWithGroup.mutate({ groupId: addGroupId, permissionLevel: 'viewer' });
    setAddGroupId('');
    setAddOpen(false);
  };

  const noun = people.length === 1 ? 'Person' : 'Personen';
  const peopleLabel =
    linkJoined.length === people.length
      ? `${people.length} ${noun} über den Link`
      : `${people.length} ${noun} mit Zugriff`;

  return (
    <div>
      {canvasGroups.map((share) => (
        <Row
          key={share.group_id}
          icon={share.group_name.slice(0, 2).toUpperCase()}
          label={share.group_name}
        >
          <select
            aria-label={`Zugriff für ${share.group_name}`}
            value={share.permission_level}
            onChange={(e) => onGroupChange(share.group_id, e.target.value as Role | 'remove')}
            className={selectClass}
          >
            <option value="viewer">{ROLE_LABELS.viewer}</option>
            <option value="editor">{ROLE_LABELS.editor}</option>
            <option value="remove">Entfernen</option>
          </select>
        </Row>
      ))}

      <Row icon={<PiLink size={15} />} label={linkOn ? 'Alle Grünen mit dem Link' : 'Link aus'}>
        <select
          aria-label="Zugriff über den Link"
          value={linkChoice}
          onChange={(e) => onLinkChange(e.target.value as LinkChoice)}
          disabled={setShareMode.isPending}
          className={selectClass}
        >
          <option value="viewer">{ROLE_LABELS.viewer}</option>
          <option value="editor">{ROLE_LABELS.editor}</option>
          <option value="off">Aus</option>
        </select>
      </Row>

      {confirmOff && (
        <div
          role="alertdialog"
          aria-label="Link ausschalten"
          className="my-1 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-tile)] p-3"
        >
          <p className="m-0 text-sm text-[var(--editor-text)]">
            {linkJoined.length === 1
              ? '1 Person verliert den Zugriff.'
              : `${linkJoined.length} Personen verlieren den Zugriff.`}{' '}
            Link ausschalten?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => applyLink('off')}
              className="cursor-pointer rounded-md border-none bg-[var(--editor-danger-fg)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Link ausschalten
            </button>
            <button
              type="button"
              onClick={() => setConfirmOff(false)}
              className="cursor-pointer rounded-md border border-[var(--editor-border)] bg-transparent px-3 py-1.5 text-xs text-[var(--editor-text)]"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {people.length > 0 && (
        <button
          type="button"
          onClick={() =>
            nav.openPage({
              title: 'Personen mit Zugriff',
              render: () => <PeoplePage canvasId={canvasId} />,
            })
          }
          className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-0 py-2 text-left"
        >
          <span aria-hidden="true" className={badgeClass}>
            {people.length}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-[var(--editor-text)]">
            {peopleLabel}
          </span>
          <PiCaretRight size={14} aria-hidden="true" className="text-[var(--editor-text-muted)]" />
        </button>
      )}

      {availableGroups.length > 0 &&
        (addOpen ? (
          <div className="flex items-center gap-2 py-2">
            <select
              aria-label="Projekt auswählen"
              value={addGroupId}
              onChange={(e) => setAddGroupId(e.target.value)}
              className={`${selectClass} min-w-0 flex-1`}
            >
              <option value="">Projekt auswählen…</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addGroup}
              disabled={!addGroupId || shareWithGroup.isPending}
              className="cursor-pointer rounded-md border-none bg-[var(--editor-green-deep)] px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-50"
            >
              Hinzufügen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex cursor-pointer items-center gap-2 border-none bg-transparent px-0 py-2 text-sm font-medium text-[var(--editor-active-fg)]"
          >
            <PiPlus size={14} aria-hidden="true" />
            Projekt hinzufügen
          </button>
        ))}

      <CopyLinkButton canvasId={canvasId} />
    </div>
  );
}

interface CanvasShareAccessProps {
  canvasId: string;
  isOwner: boolean;
  /** Whether the connection may write (the effective scope, not just ownership). */
  canEdit: boolean;
  nav: ShareNav;
}

/**
 * The share panel's access section: project shares, the login-gated link and
 * the people who came through it. Only owners manage; everyone else gets the
 * link to pass on (the share-settings endpoint is owner-only and would 403).
 */
export function CanvasShareAccess({ canvasId, isOwner, canEdit, nav }: CanvasShareAccessProps) {
  if (isOwner) return <OwnerAccess canvasId={canvasId} nav={nav} />;
  return (
    <div>
      <Row
        icon={<PiUsersThree size={15} />}
        label={canEdit ? 'Du kannst dieses Design bearbeiten' : 'Du kannst dieses Design ansehen'}
      />
      <CopyLinkButton canvasId={canvasId} />
    </div>
  );
}
