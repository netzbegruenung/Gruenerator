/**
 * Freigabe-Dialog für einen eigenen Agent: der Dialog-Rahmen um
 * {@link SharingPanel} mit den Agent-Hooks — dieselbe Fläche wie beim Rezept.
 *
 * Nur für Eigentümer*innen: Aufrufer prüfen das vorher — der Server antwortet
 * zwar ohnehin mit 404/403, den Dialog trotzdem zu zeigen wäre irreführend.
 * Agents werden benutzt, nicht gemeinsam bearbeitet, darum keine Bearbeiten-Achse.
 */
import {
  agentSharePath,
  useAddAgentGroupShare,
  useAgentGroupShares,
  useAgentShareSettings,
  useMyGroupsForSharing,
  useRemoveAgentGroupShare,
  useSetAgentIsPublic,
  useSetAgentShareMode,
} from '@gruenerator/shared/grueneratoren';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';

import { SharingPanel } from './SharingPanel';

import { getPublicAppOrigin } from '@/utils/platform';

interface ShareAgentModalProps {
  /** The agent — `identifier` addresses the sharing endpoints, `id` the link. */
  agent: { id?: string; identifier: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareAgentModal({ agent, open, onOpenChange }: ShareAgentModalProps) {
  const { identifier } = agent;
  const settingsQuery = useAgentShareSettings(identifier, open);
  const groupSharesQuery = useAgentGroupShares(identifier, open);
  const myGroupsQuery = useMyGroupsForSharing(open);

  const setShareMode = useSetAgentShareMode(identifier);
  const setIsPublic = useSetAgentIsPublic(identifier);
  const addGroupShare = useAddAgentGroupShare(identifier);
  const removeGroupShare = useRemoveAgentGroupShare(identifier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[42rem]">
        <DialogHeader>
          <DialogTitle>Agent teilen</DialogTitle>
          <DialogDescription>
            Lege fest, wer diesen Agent sehen und im Chat nutzen darf.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-2 flex max-h-[70vh] flex-col gap-md overflow-y-auto px-2">
          <SharingPanel
            noun="Agent"
            settings={settingsQuery.data ?? null}
            settingsLoading={settingsQuery.isLoading}
            settingsError={settingsQuery.isError}
            groupShares={(groupSharesQuery.data ?? []).map((g) => ({
              id: g.group_id,
              name: g.group_name,
            }))}
            myGroups={myGroupsQuery.data ?? null}
            authenticatedHint="Sichtbar nur für eingeloggte Nutzer*innen aus deinem Land."
            shareUrl={`${getPublicAppOrigin()}${agentSharePath(agent)}`}
            setMode={(mode) => setShareMode.mutateAsync(mode)}
            setListing={(input) => setIsPublic.mutateAsync(input)}
            addGroup={(groupId) => addGroupShare.mutateAsync(groupId)}
            removeGroup={(groupId) => removeGroupShare.mutateAsync(groupId)}
            pending={{
              mode: setShareMode.isPending,
              listing: setIsPublic.isPending,
              groups: addGroupShare.isPending || removeGroupShare.isPending,
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
