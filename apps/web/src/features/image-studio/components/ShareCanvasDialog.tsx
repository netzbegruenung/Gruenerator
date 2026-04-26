import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { useCallback, useState } from 'react';
import { FiTrash2, FiUsers } from 'react-icons/fi';

import { useCanvasSharing } from '../hooks/useCanvasSharing';

interface ShareCanvasDialogProps {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareCanvasDialog({ canvasId, open, onOpenChange }: ShareCanvasDialogProps) {
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupPermission, setGroupPermission] = useState<'viewer' | 'editor'>('editor');

  const {
    collaborators,
    shareSettings,
    userGroups,
    canvasGroups,
    isLoading,
    revokeAccess,
    updatePermission,
    shareWithGroup,
    unshareFromGroup,
  } = useCanvasSharing(canvasId);

  const availableGroups = userGroups.filter(
    (g) => !canvasGroups.some((cg) => cg.group_id === g.id)
  );

  const handleShareWithGroup = useCallback(() => {
    if (!selectedGroupId) return;
    shareWithGroup.mutate(
      { groupId: selectedGroupId, permissionLevel: groupPermission },
      { onSuccess: () => setSelectedGroupId('') }
    );
  }, [selectedGroupId, groupPermission, shareWithGroup]);

  if (isLoading || !shareSettings) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teilen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-grey-500 py-md">Laden...</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Canvas teilen</DialogTitle>
          <DialogDescription>
            Teile diesen Canvas mit deinen Gruppen, um gemeinsam zu bearbeiten.
          </DialogDescription>
        </DialogHeader>

        {availableGroups.length > 0 && (
          <div>
            <label className="text-xs font-medium text-grey-500 mb-1 block">
              Mit Gruppe teilen
            </label>
            <div className="flex gap-2">
              <select
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                className="flex-1 rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-sm outline-none focus:border-primary-500"
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
                className="rounded-md border border-grey-200 dark:border-grey-700 bg-background px-2 py-1.5 text-xs outline-none"
              >
                <option value="viewer">Betrachter*in</option>
                <option value="editor">Bearbeiter*in</option>
              </select>
              <Button size="sm" onClick={handleShareWithGroup} disabled={!selectedGroupId}>
                Teilen
              </Button>
            </div>
          </div>
        )}

        {canvasGroups.length > 0 && (
          <div>
            <label className="text-xs font-medium text-grey-500 mb-1 block">Gruppen</label>
            <div className="space-y-1.5">
              {canvasGroups.map((share) => (
                <div
                  key={share.group_id}
                  className="flex items-center justify-between rounded-md border border-grey-200 dark:border-grey-700 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <FiUsers size={13} className="text-grey-400" />
                    <span className="text-sm">{share.group_name}</span>
                    <Badge variant="outline" className="text-[10px] py-0">
                      {share.permission_level === 'editor' ? 'Bearbeiter*in' : 'Betrachter*in'}
                    </Badge>
                  </div>
                  <button
                    onClick={() => unshareFromGroup.mutate(share.group_id)}
                    className="text-grey-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {collaborators.length > 0 && (
          <div>
            <label className="text-xs font-medium text-grey-500 mb-1 block">
              Personen mit Zugriff
            </label>
            <div className="space-y-1.5">
              {collaborators.map((collab) => (
                <div
                  key={collab.user_id}
                  className="flex items-center justify-between rounded-md border border-grey-200 dark:border-grey-700 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-xs font-medium text-primary-700 dark:text-primary-300 shrink-0">
                      {(collab.display_name || collab.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{collab.display_name || collab.email}</p>
                    </div>
                  </div>
                  {collab.permission_level === 'owner' ? (
                    <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                      Eigentümer*in
                    </Badge>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <select
                        value={collab.permission_level}
                        onChange={(e) =>
                          updatePermission.mutate({
                            userId: collab.user_id,
                            permissionLevel: e.target.value,
                          })
                        }
                        className="rounded border border-grey-200 dark:border-grey-700 bg-background px-1 py-0.5 text-[10px] outline-none"
                      >
                        <option value="viewer">Betrachter*in</option>
                        <option value="editor">Bearbeiter*in</option>
                      </select>
                      <button
                        onClick={() => revokeAccess.mutate(collab.user_id)}
                        className="text-grey-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-0.5"
                      >
                        <FiTrash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
