import {
  useAddAgentGroupShare,
  useAgentGroupShares,
  useAgentShareSettings,
  useMyGroupsForSharing,
  useRemoveAgentGroupShare,
  useSetAgentIsPublic,
  useSetAgentShareMode,
} from '@gruenerator/shared/grueneratoren';
import { Stack, useLocalSearchParams } from 'expo-router';

import { agentShareUrl } from '../../../../../components/agentura/detail/detailFacts';
import { DetailState } from '../../../../../components/agentura/detail/DetailParts';
import { SharingControls } from '../../../../../components/agentura/share/SharingControls';
import { useAgentBySlug } from '../../../../../hooks/agents/useAgentBySlug';
import { goBackOr } from '../../../../../utils/navigation';

// Die Agent-Freigabe-Hooks werfen technische Sätze („Failed to … (HTTP 409)");
// davon ist keiner für Nutzer*innen gedacht.
const agentShareError = () => 'Die Freigabe konnte nicht geändert werden.';

/** Freigabe eines eigenen Agents — wie `ShareAgentModal` im Web. */
export default function AgentShareScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { agent, isOwn, isLoading } = useAgentBySlug(slug);

  if (!agent || !isOwn) {
    return (
      <>
        <Stack.Screen options={{ title: 'Teilen' }} />
        {isLoading ? (
          <DetailState kind="loading" />
        ) : (
          <DetailState
            kind="message"
            message="Teilen lassen sich nur eigene Agents."
            actionLabel="Zurück"
            onAction={() => goBackOr('/(focused)/agents')}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Agent teilen' }} />
      <AgentSharing
        identifier={agent.identifier}
        shareUrl={agentShareUrl(agent)}
        title={agent.title}
      />
    </>
  );
}

function AgentSharing({
  identifier,
  shareUrl,
  title,
}: {
  identifier: string;
  shareUrl: string;
  title: string;
}) {
  const settings = useAgentShareSettings(identifier, true);
  const groupShares = useAgentGroupShares(identifier, true);
  const myGroups = useMyGroupsForSharing(true);
  const setMode = useSetAgentShareMode(identifier);
  const setListing = useSetAgentIsPublic(identifier);
  const addGroup = useAddAgentGroupShare(identifier);
  const removeGroup = useRemoveAgentGroupShare(identifier);

  return (
    <SharingControls
      noun="Agent"
      settings={settings.data ?? null}
      settingsLoading={settings.isLoading}
      settingsError={settings.isError}
      groupShares={(groupShares.data ?? []).map((g) => ({ id: g.group_id, name: g.group_name }))}
      myGroups={myGroups.data ?? null}
      authenticatedHint="Sichtbar nur für eingeloggte Nutzer*innen aus deinem Land."
      shareUrl={shareUrl}
      shareTitle={title}
      setMode={(mode) => setMode.mutateAsync(mode)}
      setListing={(input) => setListing.mutateAsync(input)}
      addGroup={(groupId) => addGroup.mutateAsync(groupId)}
      removeGroup={(groupId) => removeGroup.mutateAsync(groupId)}
      pending={{
        mode: setMode.isPending,
        listing: setListing.isPending,
        groups: addGroup.isPending || removeGroup.isPending,
      }}
      describeError={agentShareError}
    />
  );
}
