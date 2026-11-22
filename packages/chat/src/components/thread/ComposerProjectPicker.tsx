'use client';

import { useAuiState } from '@assistant-ui/react';
import { useUserGroups } from '@gruenerator/shared/groups';
import { FolderOpen } from 'lucide-react';
import { memo, useMemo } from 'react';

import { useAgentStore } from '../../stores/chatStore';

import { type ComposerOption, ComposerOptionPicker } from './ComposerOptionPicker';

const NO_PROJECT = 'none';
// Eine Wahl im Composer darf länger liegen als die Übergabe von einer Projektseite.
const PICK_TTL_MS = 10 * 60_000;

/**
 * Projekt für einen NEUEN Chat, direkt im Composer gewählt. Die Wahl landet als
 * `pendingGroup` im Chat-Store — derselbe Weg wie bei „Neuer Chat in <Projekt>“:
 * der Thread wird beim ersten Senden MIT `groupId` angelegt, bevor der erste Turn
 * läuft. Sobald der Chat Nachrichten hat, zeigt `ThreadProjectCrumb` das Projekt
 * (nur lesend); Verschieben bleibt im „Zu Projekt hinzufügen“-Dialog.
 */
export const ComposerProjectPicker = memo(function ComposerProjectPicker() {
  const isEmpty = useAuiState((s) => s.optional.thread?.isEmpty ?? false);
  const pendingGroup = useAgentStore((s) => s.pendingGroup);
  const setPendingGroup = useAgentStore((s) => s.setPendingGroup);
  const { data: groups } = useUserGroups();

  // Archivierte Projekte nehmen keine neuen Chats an (Server: `assertCanShareToGroup`).
  const projects = useMemo(
    () => (groups ?? []).filter((g) => !g.is_system && !g.archived_at),
    [groups]
  );
  const options = useMemo<ComposerOption[]>(
    () => [
      { id: NO_PROJECT, name: 'Kein Projekt' },
      ...projects.map((g) => ({ id: g.id, name: g.name })),
    ],
    [projects]
  );

  if (!isEmpty || projects.length === 0) return null;

  const activeId =
    pendingGroup && pendingGroup.expiresAt > Date.now() ? pendingGroup.id : NO_PROJECT;
  const value = options.some((o) => o.id === activeId) ? activeId : NO_PROJECT;
  const current = options.find((o) => o.id === value);

  return (
    <ComposerOptionPicker
      options={options}
      value={value}
      onChange={(id) =>
        setPendingGroup(
          id === NO_PROJECT ? null : id,
          id === pendingGroup?.id && pendingGroup.teamShared,
          PICK_TTL_MS
        )
      }
      sheetTitle="Projekt wählen"
      sectionTitle="Projekt"
      label="Projekt für diesen Chat"
      triggerLabel={
        <span className="inline-flex max-w-[10rem] items-center gap-1 truncate">
          <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{value === NO_PROJECT ? 'Projekt' : current?.name}</span>
        </span>
      }
    />
  );
});
