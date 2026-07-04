import { Button } from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiTrash2, FiUsers } from 'react-icons/fi';

import { type SharingGroupShare, type SharingUserGroup } from '../types.js';

interface GroupShareControlsProps {
  userGroups: SharingUserGroup[];
  groupShares: SharingGroupShare[];
  onShare: (groupId: string, permissionLevel: 'viewer' | 'editor') => void;
  onUpdatePermission: (groupId: string, permissionLevel: 'viewer' | 'editor') => void;
  onRemove: (groupId: string) => void;
  isSharing?: boolean;
}

export const GroupShareControls = ({
  userGroups,
  groupShares,
  onShare,
  onUpdatePermission,
  onRemove,
  isSharing,
}: GroupShareControlsProps) => {
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupPermission, setGroupPermission] = useState<'viewer' | 'editor'>('viewer');

  const sharedGroupIds = new Set(groupShares.map((s) => s.group_id));
  const availableGroups = userGroups.filter((g) => !sharedGroupIds.has(g.id));

  const handleShare = useCallback(() => {
    if (!selectedGroupId) return;
    onShare(selectedGroupId, groupPermission);
    setSelectedGroupId('');
    setGroupPermission('viewer');
  }, [selectedGroupId, groupPermission, onShare]);

  if (userGroups.length === 0) return null;

  return (
    <>
      {availableGroups.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-grey-500">Mit Gruppe teilen</label>
          <div className="flex gap-2">
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="flex-1 rounded-md border border-grey-200 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500 dark:border-grey-700"
            >
              <option value="">Gruppe auswählen...</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <select
              value={groupPermission}
              onChange={(e) => setGroupPermission(e.target.value as 'viewer' | 'editor')}
              className="rounded-md border border-grey-200 bg-background px-2 py-1.5 text-xs outline-none dark:border-grey-700"
            >
              <option value="viewer">Betrachter*in</option>
              <option value="editor">Bearbeiter*in</option>
            </select>
            <Button size="sm" onClick={handleShare} disabled={!selectedGroupId || isSharing}>
              Teilen
            </Button>
          </div>
        </div>
      )}

      {groupShares.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-grey-500">Gruppen</label>
          <div className="space-y-1.5">
            {groupShares.map((share) => (
              <div
                key={share.group_id}
                className="flex items-center justify-between rounded-md border border-grey-200 px-2.5 py-1.5 dark:border-grey-700"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FiUsers size={13} className="shrink-0 text-grey-400" />
                  <span className="min-w-0 truncate text-sm">{share.group_name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    value={share.permission_level}
                    onChange={(e) =>
                      onUpdatePermission(share.group_id, e.target.value as 'viewer' | 'editor')
                    }
                    className="rounded border border-grey-200 bg-background px-1 py-0.5 text-[10px] outline-none dark:border-grey-700"
                  >
                    <option value="viewer">Betrachter*in</option>
                    <option value="editor">Bearbeiter*in</option>
                  </select>
                  <button
                    type="button"
                    aria-label="Gruppenfreigabe entfernen"
                    onClick={() => onRemove(share.group_id)}
                    className="cursor-pointer border-none bg-transparent p-0.5 text-grey-400 hover:text-red-600"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};
