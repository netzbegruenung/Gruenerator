import { type AgentListItem } from '@gruenerator/chat';
import { type TextForm } from '@gruenerator/contracts';
import {
  AGENTURA_TYPE_LABELS,
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  agentKey,
  agentRef,
  agenturaMetaLine,
  isLandesverbandIdentifier,
  landesverbandLabel,
  landesverbandRegion,
  type Agent,
} from '@gruenerator/shared/agents';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgenturaSheet } from '../../components/agentura/AgenturaSheet';
import { MarketCard } from '../../components/agentura/MarketCard';
import {
  searchTextOf,
  type MarketAisle,
  type MarketItem,
} from '../../components/agentura/marketItem';
import { SearchField } from '../../components/agentura/SearchField';
import { agentIcon } from '../../components/chat/sidebarIcons';
import { Button, ListGroup, SkeletonRows } from '../../components/common';
import { Fab } from '../../components/common/Fab';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { useAgenturaCatalog } from '../../hooks/agents/useAgenturaCatalog';
import { useOwnRecipes } from '../../hooks/agents/useOwnRecipes';
import { usePublicUserAgents } from '../../hooks/agents/usePublicUserAgents';
import { useUserAgents } from '../../hooks/agents/useUserAgents';
import { useUserLibrary } from '../../hooks/agents/useUserLibrary';
import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, BODY_FONT, HEADING_FONT_SEMIBOLD } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { routeWithParams } from '../../types/routes';
import { goBackOr } from '../../utils/navigation';

const SECTION_KINDS = ['agent', 'recipe'] as const;

/**
 * „Grüneratoren" — womit die Person arbeitet: eigene Agents und Rezepte und was
 * sie aus der Agentura dazugeholt hat, in einer Liste ohne Regale. Die Agentura
 * selbst ist ein Sheet darüber (`AgenturaSheet`), wie im Web das Popup über
 * `/grueneratoren`; `?agentura=1` öffnet sie direkt.
 *
 * Anlegen, Bearbeiten und Teilen bleiben im Web. Mit Projekten geteilte Agents
 * und Rezepte führt die App (noch) nicht — dafür bräuchte sie je Projekt einen
 * Abruf der geteilten Inhalte. Wiederkehrende Aufgaben gibt es mobil nicht.
 */
export default function AgentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ agentura?: string }>();

  const [search, setSearch] = useState('');
  const [shopOpen, setShopOpen] = useState(params.agentura === '1');
  // A deep link into an already open overview only changes its params.
  const [linkedShop, setLinkedShop] = useState(params.agentura);
  if (params.agentura !== linkedShop) {
    setLinkedShop(params.agentura);
    if (params.agentura === '1') setShopOpen(true);
  }
  const [shopQuery, setShopQuery] = useState('');
  const query = search.trim().toLowerCase();

  const { data: userAgents = [], isSuccess: agentsLoaded, isError: agentsFailed } = useUserAgents();
  const { data: publicAgents = [], isLoading: publicLoading } = usePublicUserAgents();
  const {
    data: ownRecipes = [],
    isSuccess: recipesLoaded,
    isError: recipesFailed,
  } = useOwnRecipes();
  const library = useUserLibrary();
  const catalog = useAgenturaCatalog();

  const ownAgentKeys = useMemo(() => new Set(userAgents.map(agentKey)), [userAgents]);

  // „Öffentlich": publicly-listed community agents, minus the ones the user
  // already owns. By `agentKey`: a colleague's agent under one of the user's
  // identifiers is still theirs.
  const communityAgents = useMemo(
    () => publicAgents.filter((pa) => !ownAgentKeys.has(agentKey(pa))),
    [publicAgents, ownAgentKeys]
  );

  const openAgent = useCallback(
    (agent: Agent) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          agentId: agentRef(agent, ownAgentKeys.has(agentKey(agent))),
        })
      );
    },
    [router, ownAgentKeys]
  );

  // A recipe is a composer mention, not an agent selection: open a fresh chat
  // with the mention already typed, so the next thing the user does is describe
  // the task rather than remember the syntax.
  const openWithComposerText = useCallback(
    (text: string) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          initialComposerText: text,
        })
      );
    },
    [router]
  );

  const agentItem = (agent: Agent): MarketItem => ({
    key: `a-${agentKey(agent)}`,
    kind: 'agent',
    isFavorite: false,
    libraryRef: ownAgentKeys.has(agentKey(agent))
      ? null
      : { kind: 'agent', ref: agentRef(agent, false) },
    systemRecipe: false,
    icon: agentIcon(agent.iconKey),
    title: agent.title,
    meta: agenturaMetaLine([
      'Agent',
      isLandesverbandIdentifier(agent.identifier) && landesverbandLabel(agent.identifier),
    ]),
    author: agent.author,
    description: agent.description,
    searchText: searchTextOf([agent.title, agent.description, agent.identifier]),
    onOpen: () => openAgent(agent),
  });

  const skillItem = (skill: AgentListItem): MarketItem => ({
    key: `s-${skill.mention}`,
    kind: 'recipe',
    isFavorite: false,
    libraryRef: { kind: 'recipe', ref: skill.mention },
    systemRecipe: true,
    icon: agentIcon(skill.iconKey),
    title: skill.title,
    meta: agenturaMetaLine([
      'Rezept',
      isLandesverbandIdentifier(skill.identifier)
        ? landesverbandLabel(skill.identifier)
        : SKILL_CATEGORY_LABELS[skill.skillCategory ?? 'sonstiges'],
    ]),
    description: skill.description,
    searchText: searchTextOf([skill.title, skill.description, skill.mention]),
    onOpen: () => openWithComposerText(`${skill.mention} `),
  });

  const recipeItem = (recipe: TextForm): MarketItem => ({
    key: `r-${recipe.id}`,
    kind: 'recipe',
    isFavorite: false,
    libraryRef: null,
    systemRecipe: false,
    icon: agentIcon(recipe.iconKey ?? 'sparkles'),
    title: recipe.title,
    meta: 'Rezept',
    description: recipe.description ?? `@${recipe.mention}`,
    searchText: searchTextOf([recipe.title, recipe.description, recipe.mention]),
    onOpen: () => openWithComposerText(`@${recipe.mention} `),
  });

  // Was die Agentura anbietet, nach Verweis — dieselben Verweise wie im Web:
  // agentRef bei Agents (uuid bei fremden), Mention bei Katalog-Rezepten.
  // Landesverbands-Inhalte erst mit geladenen Rollen, sonst stünden kurz die
  // Inhalte aller Verbände auf der Übersicht. Öffentliche Nutzer-Rezepte führt
  // die App nicht; ein solcher Verweis bleibt hier aus und erscheint im Web.
  const shopAgents = useMemo(() => {
    const lv = catalog.rolesLoaded ? catalog.lvSystemAgents : [];
    const map = new Map<string, Agent>();
    for (const agent of [...catalog.generalSystemAgents, ...lv, ...communityAgents])
      map.set(agentRef(agent, false), agent);
    return map;
  }, [catalog.generalSystemAgents, catalog.lvSystemAgents, catalog.rolesLoaded, communityAgents]);
  const shopSkills = useMemo(
    () =>
      new Map(
        catalog.skills
          .filter((s) => catalog.rolesLoaded || !isLandesverbandIdentifier(s.identifier))
          .map((s) => [s.mention, s])
      ),
    [catalog.skills, catalog.rolesLoaded]
  );
  const addedAgents = library.items.flatMap((i) => {
    const agent = i.kind === 'agent' ? (shopAgents.get(i.ref) ?? null) : null;
    return agent && !ownAgentKeys.has(agentKey(agent)) ? [agent] : [];
  });
  const addedSkills = library.items.flatMap((i) => {
    const skill = i.kind === 'recipe' ? (shopSkills.get(i.ref) ?? null) : null;
    return skill ? [skill] : [];
  });

  const allItems: MarketItem[] = [
    ...userAgents.map(agentItem),
    ...ownRecipes.map(recipeItem),
    ...addedAgents.map(agentItem),
    ...addedSkills.map(skillItem),
  ];
  const items = query ? allItems.filter((item) => item.searchText.includes(query)) : allItems;
  const sections = SECTION_KINDS.map((kind) => ({
    key: kind,
    title: AGENTURA_TYPE_LABELS[kind],
    data: items.filter((item) => item.kind === kind),
  })).filter((section) => section.data.length > 0);

  // „Leer" erst, wenn alles geladen ist — vorher sind die Listen nur leere
  // Rückfälle, und „Noch nichts hier" wäre eine Behauptung ohne Grundlage.
  const settled = agentsLoaded && recipesLoaded && library.loaded;
  const failed = agentsFailed || recipesFailed || library.failed;

  // Nach Region statt nach Nutzung: bei mehreren Zuteilungen sollen die Sachen
  // eines Verbands beieinanderstehen.
  const byRegion = <T,>(list: readonly T[], id: (t: T) => string): T[] =>
    [...list].sort((a, b) => landesverbandRegion(id(a)).localeCompare(landesverbandRegion(id(b))));
  const pinned = catalog.generalSystemAgents.filter((a) => a.pinnedToSidebar);
  const unpinned = catalog.generalSystemAgents.filter((a) => !a.pinnedToSidebar);
  const aisles: MarketAisle[] = [
    {
      key: 'offiziell',
      title: 'Offizielle Grüneratoren',
      items: [
        ...[...pinned, ...unpinned].map(agentItem),
        ...SKILL_CATEGORY_ORDER.flatMap((cat) =>
          (catalog.skillsByCategory.get(cat) ?? []).map(skillItem)
        ),
      ],
    },
    {
      key: 'landesverband',
      // Erst nach der Hydratation der Profilrollen: vorher lässt `lvIds === null`
      // jeden Verband durch, und der Gang hieße kurz „Dein Landesverband" mit
      // fremden Inhalten, bevor er auf „Grüne Hessen" umspringt.
      title: catalog.lvShelfLabel,
      items: catalog.rolesLoaded
        ? [
            ...byRegion(catalog.lvSystemAgents, (a) => a.identifier).map(agentItem),
            ...byRegion(catalog.lvSkills, (s) => s.identifier).map(skillItem),
          ]
        : [],
    },
    { key: 'oeffentlich', title: 'Öffentlich', items: communityAgents.map(agentItem) },
  ];

  const openShop = (initialQuery: string) => {
    setShopQuery(initialQuery);
    setShopOpen(true);
  };

  const note = (text: string, action: ReactNode = null): ReactNode => (
    <View style={styles.empty}>
      <Ionicons name="sparkles-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{text}</Text>
      {action}
    </View>
  );

  const placeholder: ReactNode = failed ? (
    note('Deine Grüneratoren konnten nicht geladen werden. Versuch es gleich noch einmal.')
  ) : !settled ? (
    <ListGroup>
      <SkeletonRows count={6} leading={44} on="card" />
    </ListGroup>
  ) : allItems.length === 0 ? (
    note(
      'Noch nichts hier. Hol dir Agents und Rezepte aus der Agentura — eigene legst du am Rechner an.',
      <Button onPress={() => openShop('')}>Zur Agentura</Button>
    )
  ) : (
    note(
      'Bei deinen Grüneratoren ist nichts dabei — vielleicht in der Agentura.',
      <Button variant="outline" onPress={() => openShop(search.trim())}>
        In der Agentura suchen
      </Button>
    )
  );

  return (
    <ScreenScaffold title="Grüneratoren" onBack={() => goBackOr('/start')}>
      <View style={[styles.column, styles.controls]}>
        <SearchField value={search} onChange={setSearch} placeholder="Grüneratoren durchsuchen" />
      </View>

      <SectionList
        sections={settled && !failed ? sections : []}
        keyExtractor={(item) => item.key}
        // Das Häkchen liest `library` aus dem Abschluss — ohne extraData zeichnet
        // die Liste nach dem Umschalten nicht neu.
        extraData={library.items}
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: theme.text }]} accessibilityRole="header">
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <MarketCard
            icon={item.icon}
            title={item.title}
            meta={item.meta}
            description={item.description}
            onPress={item.onOpen}
            added={item.libraryRef ? library.has(item.libraryRef.kind, item.libraryRef.ref) : null}
            onToggleAdded={() => {
              if (item.libraryRef) library.toggle(item.libraryRef.kind, item.libraryRef.ref);
            }}
          />
        )}
        ItemSeparatorComponent={ListGap}
        ListEmptyComponent={<>{placeholder}</>}
        stickySectionHeadersEnabled={false}
        initialNumToRender={8}
        style={styles.scroll}
        contentContainerStyle={[styles.column, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />

      <Fab
        icon="storefront-outline"
        label="Agentura"
        accessibilityLabel="Agentura öffnen"
        onPress={() => openShop('')}
        style={{
          backgroundColor: colors.secondary[600],
          bottom: Math.max(insets.bottom, spacing.medium),
        }}
      />

      <AgenturaSheet
        visible={shopOpen}
        onClose={() => setShopOpen(false)}
        aisles={aisles}
        publicLoading={publicLoading}
        initialQuery={shopQuery}
        library={library}
      />
    </ScreenScaffold>
  );
}

function ListGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  // Text cards, so the reading measure: on a tablet a full-width card ran its
  // description out to well over a hundred characters a line.
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
  },
  controls: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.small,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.medium,
    // Clears the extended FAB, so the last card is never hidden under it.
    paddingBottom: spacing.xxlarge * 2,
  },
  sectionTitle: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 17,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
  },
  gap: {
    height: spacing.small,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xxlarge,
    paddingHorizontal: spacing.large,
  },
  emptyText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
