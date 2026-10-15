import { agentKey, agentRef, type Agent } from '@gruenerator/shared/agents';
import { errMessage } from '@gruenerator/shared/groups';
import {
  relatedAgents,
  useDeleteUserAgent,
  useUserAgents,
} from '@gruenerator/shared/grueneratoren';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { AgentDiscussion } from '../../../../../components/agentura/detail/AgentDiscussion';
import {
  agentKnowledge,
  agentShareUrl,
  agentToolLabels,
} from '../../../../../components/agentura/detail/detailFacts';
import {
  DetailHero,
  DetailSection,
  DetailState,
  HeaderButtons,
  HeaderIconButton,
  TextCard,
  WrappingRow,
  detailStyles,
  shareLink,
} from '../../../../../components/agentura/detail/DetailParts';
import { LibraryToggleButton } from '../../../../../components/agentura/detail/LibraryToggleButton';
import { agentIcon } from '../../../../../components/chat/sidebarIcons';
import { Button, ListGroup, ListRow } from '../../../../../components/common';
import { useAgentBySlug } from '../../../../../hooks/agents/useAgentBySlug';
import { useAgenturaCatalog } from '../../../../../hooks/agents/useAgenturaCatalog';
import { routeWithParams } from '../../../../../types/routes';
import { goBackOr } from '../../../../../utils/navigation';

/**
 * Die Detailseite eines Agents — System, eigener oder fremder (geteilt,
 * öffentlich). Wie `AgentDetailPage` im Web, aber als eine gruppierte Spalte
 * statt Tabs. Bearbeiten, Teilen und Löschen nur für eigene Agents.
 */
export default function AgentDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { agent, isUserAgent, isOwn, isLoading, isError } = useAgentBySlug(slug);
  const catalog = useAgenturaCatalog();
  const { data: ownAgents = [] } = useUserAgents();
  const deleteAgent = useDeleteUserAgent();

  const ownKeys = useMemo(() => new Set(ownAgents.map(agentKey)), [ownAgents]);
  const related = useMemo(
    () => (agent ? relatedAgents(agent, [...catalog.systemAgents, ...ownAgents]) : []),
    [agent, catalog.systemAgents, ownAgents]
  );

  if (!agent) {
    const title = isLoading ? '' : 'Agent';
    return (
      <>
        <Stack.Screen options={{ title }} />
        {isLoading ? (
          <DetailState kind="loading" />
        ) : (
          <DetailState
            kind="message"
            message={
              isError
                ? 'Die Agents konnten gerade nicht geladen werden. Bitte versuch es später noch einmal.'
                : 'Dieser Agent ist nicht (mehr) da.'
            }
            actionLabel="Zurück"
            onAction={() => goBackOr('/(focused)/agents')}
          />
        )}
      </>
    );
  }

  const ref = agentRef(agent, isOwn);
  const tools = agentToolLabels(agent);
  const knowledge = agentKnowledge(agent);

  const openChat = (initialMessage: string | null) =>
    router.push(
      routeWithParams('/(focused)/chat-conversation', {
        threadId: 'new',
        agentId: ref,
        ...(initialMessage ? { initialMessage } : {}),
      })
    );

  const openRelated = (other: Agent) =>
    router.push({
      pathname: '/(focused)/grueneratoren/agent/[slug]',
      params: { slug: agentRef(other, ownKeys.has(agentKey(other))) },
    });

  const confirmDelete = () =>
    Alert.alert(
      'Agent löschen?',
      `„${agent.title}“ liegt danach 30 Tage im Papierkorb und lässt sich dort wiederherstellen.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            deleteAgent.mutate(agent.identifier, {
              onSuccess: () => goBackOr('/(focused)/agents'),
              onError: (error) => Alert.alert('Fehler', errMessage(error)),
            }),
        },
      ]
    );

  return (
    <>
      <Stack.Screen
        options={{
          title: agent.title,
          headerRight: () => (
            <HeaderButtons>
              <HeaderIconButton
                icon="share-outline"
                label={isOwn ? 'Teilen' : 'Link teilen'}
                onPress={() =>
                  isOwn
                    ? router.push({
                        pathname: '/(focused)/grueneratoren/agent/[slug]/teilen',
                        params: { slug: ref },
                      })
                    : shareLink(agentShareUrl(agent), agent.title)
                }
              />
            </HeaderButtons>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={detailStyles.scrollContent}
      >
        <DetailHero
          iconKey={agent.iconKey ?? null}
          title={agent.title}
          lines={[`Grünerator-Agent${agent.author ? ` · von ${agent.author}` : ''}`]}
        />

        <View style={detailStyles.actions}>
          <Button onPress={() => openChat(null)}>Im Chat öffnen</Button>
          {isOwn ? (
            <Button
              variant="outline"
              onPress={() =>
                router.push({
                  pathname: '/(focused)/grueneratoren/agent-editor',
                  params: { identifier: agent.identifier },
                })
              }
            >
              Bearbeiten
            </Button>
          ) : (
            <LibraryToggleButton kind="agent" itemRef={agentRef(agent, false)} />
          )}
        </View>

        {agent.description ? (
          <DetailSection title="Über diesen Agent">
            <TextCard text={agent.description} markdown />
          </DetailSection>
        ) : null}

        {agent.openingMessage || agent.openingQuestions.length > 0 ? (
          <DetailSection title="Gesprächsbeginn">
            {agent.openingMessage ? <TextCard text={agent.openingMessage} markdown /> : null}
            {agent.openingQuestions.length > 0 ? (
              <ListGroup>
                {agent.openingQuestions.map((question, i) => (
                  <WrappingRow
                    key={question}
                    icon="chatbubble-ellipses-outline"
                    text={question}
                    onPress={() => openChat(question)}
                    last={i === agent.openingQuestions.length - 1}
                  />
                ))}
              </ListGroup>
            ) : null}
          </DetailSection>
        ) : null}

        <DetailSection title="Fähigkeiten">
          <ListGroup>
            <ListRow
              icon="construct-outline"
              title="Werkzeuge"
              value={tools.length > 0 ? tools.join(', ') : 'Keine Werkzeuge hinterlegt'}
              valueLines={4}
            />
            <ListRow
              icon="library-outline"
              title="Wissensbasis"
              value={
                knowledge.length === 0
                  ? 'Keine — arbeitet mit dem Modell und seinen Werkzeugen'
                  : knowledge.length === 1
                    ? '1 Quelle hinterlegt'
                    : `${knowledge.length} Quellen hinterlegt`
              }
              valueLines={2}
            />
            <ListRow icon="hardware-chip-outline" title="Modell" value={agent.model} last />
          </ListGroup>
        </DetailSection>

        {related.length > 0 ? (
          <DetailSection title="Verwandte">
            <ListGroup>
              {related.map((other, i) => (
                <ListRow
                  key={agentKey(other)}
                  icon={agentIcon(other.iconKey)}
                  title={other.title}
                  value={other.description}
                  onPress={() => openRelated(other)}
                  last={i === related.length - 1}
                />
              ))}
            </ListGroup>
          </DetailSection>
        ) : null}

        {isUserAgent && agent.id ? <AgentDiscussion agentId={agent.id} isOwner={isOwn} /> : null}

        {isOwn ? (
          <ListGroup>
            <ListRow
              icon="trash-outline"
              title="Agent löschen"
              value="Liegt danach 30 Tage im Papierkorb."
              destructive
              disabled={deleteAgent.isPending}
              onPress={confirmDelete}
              last
            />
          </ListGroup>
        ) : null}
      </ScrollView>
    </>
  );
}
