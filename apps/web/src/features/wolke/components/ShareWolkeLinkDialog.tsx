import { useUserGroups } from '@gruenerator/shared/groups';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import {
  useLinkGroupShares,
  useShareLinkWithGroup,
  useUnshareLinkFromGroup,
} from '@gruenerator/wolke';
import { useMemo, useState } from 'react';
import { FiUsers, FiX } from 'react-icons/fi';

interface ShareWolkeLinkDialogProps {
  shareLinkId: string;
  displayName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

const ShareWolkeLinkDialog = ({
  shareLinkId,
  displayName,
  open,
  onOpenChange,
  onSuccess,
  onError,
}: ShareWolkeLinkDialogProps) => {
  const { data: userGroups = [], isLoading: groupsLoading } = useUserGroups({ enabled: open });
  const { data: linkGroupShares = [], isLoading: sharesLoading } = useLinkGroupShares(
    open ? shareLinkId : null
  );

  const shareMutation = useShareLinkWithGroup(shareLinkId);
  const unshareMutation = useUnshareLinkFromGroup(shareLinkId);

  const sharedGroupIds = useMemo(
    () => new Set(linkGroupShares.map((s) => s.groupId)),
    [linkGroupShares]
  );

  const availableGroups = useMemo(
    () => userGroups.filter((g) => !sharedGroupIds.has(g.id)),
    [userGroups, sharedGroupIds]
  );

  const [selectedGroupId, setSelectedGroupId] = useState('');

  const handleShare = async () => {
    if (!selectedGroupId) return;
    try {
      await shareMutation.mutateAsync(selectedGroupId);
      const groupName = userGroups.find((g) => g.id === selectedGroupId)?.name ?? 'Gruppe';
      setSelectedGroupId('');
      onSuccess?.(`Wolke-Verbindung wurde mit „${groupName}" geteilt.`);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Fehler beim Teilen.');
    }
  };

  const handleUnshare = async (groupId: string, groupName: string) => {
    try {
      await unshareMutation.mutateAsync(groupId);
      onSuccess?.(`Aus „${groupName}" entfernt.`);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Fehler beim Entfernen.');
    }
  };

  const isLoading = groupsLoading || sharesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-sm">
            <FiUsers className="w-5 h-5" />
            Wolke-Verbindung teilen
          </DialogTitle>
          <DialogDescription>
            Mitglieder der gewählten Gruppe können „{displayName}" anschließend lesend nutzen. Der
            Link bleibt ein öffentlicher Nextcloud-Share — jede*r mit dem Link hat Zugriff.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-md">
          <section className="flex flex-col gap-sm">
            <h3 className="text-sm font-medium text-grey-600 dark:text-grey-300">
              Bereits geteilt mit
            </h3>
            {isLoading ? (
              <p className="text-sm text-grey-400">Lade Gruppen...</p>
            ) : linkGroupShares.length === 0 ? (
              <p className="text-sm text-grey-400">Noch keine Gruppe.</p>
            ) : (
              <ul className="flex flex-col gap-xs">
                {linkGroupShares.map((share) => (
                  <li
                    key={share.groupId}
                    className="flex items-center justify-between gap-sm rounded-md border border-grey-200 dark:border-grey-700 px-sm py-xs"
                  >
                    <span className="text-sm truncate">{share.groupName}</span>
                    <div className="flex items-center gap-xs shrink-0">
                      <Badge variant="secondary" className="text-[0.65rem]">
                        Lesen
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleUnshare(share.groupId, share.groupName)}
                        disabled={unshareMutation.isPending}
                        title="Aus Gruppe entfernen"
                      >
                        <FiX className="w-4 h-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-sm">
            <h3 className="text-sm font-medium text-grey-600 dark:text-grey-300">
              Mit weiterer Gruppe teilen
            </h3>
            {availableGroups.length === 0 ? (
              <p className="text-sm text-grey-400">
                {userGroups.length === 0
                  ? 'Du bist noch in keiner Gruppe.'
                  : 'Mit all deinen Gruppen bereits geteilt.'}
              </p>
            ) : (
              <div className="flex items-center gap-sm">
                <select
                  className="flex-1 rounded-md border border-grey-300 dark:border-grey-700 bg-background-pure px-sm py-xs text-sm"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  disabled={shareMutation.isPending}
                >
                  <option value="">Gruppe wählen...</option>
                  {availableGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={handleShare}
                  disabled={!selectedGroupId || shareMutation.isPending}
                >
                  Teilen
                </Button>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareWolkeLinkDialog;
