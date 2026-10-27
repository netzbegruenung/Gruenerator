import { type AgentListItem } from '@gruenerator/chat';
import { type RecurringTask, type TextForm } from '@gruenerator/contracts';
import {
  AGENTURA_TYPE_LABELS,
  SKILL_CATEGORY_LABELS,
  agentKey,
  agentRef,
  agenturaMetaLine,
  isLandesverbandIdentifier,
  landesverbandLabel,
  type Agent,
} from '@gruenerator/shared/agents';
import {
  describeRecurrence,
  useDeleteRecipe,
  useDeleteRecurringTask,
  useDeleteUserAgent,
  usePublicUserAgents,
  useRecurringTasks,
  useUserAgents,
} from '@gruenerator/shared/grueneratoren';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, View, Text, SectionList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { searchTextOf, type MarketItem } from '../../components/agentura/marketItem';
import { buildMarketMenuActions, type MarketMenuId } from '../../components/agentura/marketMenu';
import { SearchField } from '../../components/agentura/SearchField';
import { MenuActionSheet } from '../../components/chat/MenuActionSheet';
import { Button, ListGroup, SkeletonRows } from '../../components/common';
import { SHEET_HANDOFF_MS } from '../../components/common/CreateMenuSheet';
import { Fab } from '../../components/common/Fab';
import { NeutralBackdrop } from '../../components/common/NeutralBackdrop';
import { MarketCard } from '../../components/marketplace/MarketCard';
import { MarketplaceSheet } from '../../components/marketplace/MarketplaceSheet';
import { marketplaceRoute } from '../../components/marketplace/marketplaceTarget';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { useAgenturaCatalog } from '../../hooks/agents/useAgenturaCatalog';
import { useOwnRecipes } from '../../hooks/agents/useOwnRecipes';
import { useSharedUserAgents } from '../../hooks/agents/useSharedUserAgents';
import { useUserLibrary } from '../../hooks/agents/useUserLibrary';
import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, BODY_FONT, HEADING_FONT_SEMIBOLD } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { routeWithParams } from '../../types/routes';
import { goBackOr } from '../../utils/navigation';

const SECTION_KINDS = ['agent', 'recipe', 'task'] as const;

/** Was das Sheet über der Übersicht anbietet — wie im Web. */
const AGENTURA_KINDS = ['agent', 'recipe'] as const;

const CREATE_ACTIONS = [
  { id: 'agent', title: 'Agent' },
  { id: 'recipe', title: 'Rezept' },
  { id: 'task', title: 'Wiederkehrende Aufgabe' },
];

/**
 * „Grüneratoren" — womit die Person arbeitet: eigene Agents, Rezepte und
 * wiederkehrende Aufgaben, aus Projekten geteilte Agents und was sie aus dem
 * Marktplatz dazugeholt hat, in einer Liste ohne Regale. Der Marktplatz für
 * Agents und Rezepte ist ein Sheet darüber (`MarketplaceSheet`), wie im Web das
 * Popup über `/grueneratoren`; das alte `?agentura=1` leitet auf den
 * Marktplatz-Bildschirm weiter.
 *
 * Ein Tipp öffnet die Detailseite (`(focused)/grueneratoren/…`), wie im Web;
 * der lange Druck bietet Chat, Bearbeiten, Teilen und Löschen an. Angelegt wird
 * über „+" oben rechts.
 */
export default function AgentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ agentura?: string }>();

  const [search, setSearch] = useState('');
  const [shopOpen, setShopOpen] = useState(false);
  // The sheet is a native modal: left open, it would sit over the next screen.
  useFocusEffect(useCallback(() => () => setShopOpen(false), []));
  // `?agentura=1` (alte Links und Binaries) meinte den Shop — der ist heute der Marktplatz.
  useEffect(() => {
    if (params.agentura === '1') router.replace(marketplaceRoute({ tab: 'agents' }));
  }, [params.agentura, router]);
  const [shopQuery, setShopQuery] = useState('');
  const query = search.trim().toLowerCase();

  const { data: userAgents = [], isSuccess: agentsLoaded, isError: agentsFailed } = useUserAgents();
  const { data: publicAgents = [] } = usePublicUserAgents();
  const { data: sharedEntries = [] } = useSharedUserAgents();
  const {
    data: ownRecipes = [],
    isSuccess: recipesLoaded,
    isError: recipesFailed,
  } = useOwnRecipes();
  // Aufgaben sind ein Zusatz: scheitert ihre Liste, bleiben Agents und Rezepte stehen.
  const tasks = useRecurringTasks();
  const library = useUserLibrary();
  const catalog = useAgenturaCatalog();
  const deleteAgent = useDeleteUserAgent();
  const deleteRecipe = useDeleteRecipe();
  const deleteTask = useDeleteRecurringTask();

  const [createOpen, setCreateOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<MarketItem | null>(null);
  // Navigation und Rückfrage erst, wenn das Menü-Sheet weg ist — iOS zeigt
  // nichts Neues, solange ein Modal noch hinausgleitet.
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(handoff.current ?? undefined), []);
  const afterSheet = (run: () => void) => {
    handoff.current = setTimeout(run, SHEET_HANDOFF_MS);
  };

  const ownAgentKeys = useMemo(() => new Set(userAgents.map(agentKey)), [userAgents]);

  // „Öffentlich": publicly-listed community agents, minus the ones the user
  // already owns. By `agentKey`: a colleague's agent under one of the user's
  // identifiers is still theirs.
  const communityAgents = useMemo(
    () => publicAgents.filter((pa) => !ownAgentKeys.has(agentKey(pa))),
    [publicAgents, ownAgentKeys]
  );

  const startAgentChat = useCallback(
    (agent: Agent, own: boolean) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          agentId: agentRef(agent, own),
        })
      );
    },
    [router]
  );

  // A recipe is a composer mention, not an agent selection: open a fresh chat
  // with the mention already typed, so the next thing the user does is describe
  // the task rather than remember the syntax.
  const startRecipeChat = useCallback(
    (mention: string) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          initialComposerText: `@${mention} `,
        })
      );
    },
    [router]
  );

  const confirmDelete = (title: string, onConfirm: () => void) =>
    Alert.alert(`„${title}" löschen?`, 'Liegt danach 30 Tage im Papierkorb.', [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: onConfirm },
    ]);

  const agentItem = (agent: Agent, origin: string | null = null): MarketItem => {
    const own = ownAgentKeys.has(agentKey(agent));
    const ref = agentRef(agent, own);
    const libraryRef = own ? null : { kind: 'agent' as const, ref: agentRef(agent, false) };
    const openDetail = () =>
      router.push({ pathname: '/(focused)/grueneratoren/agent/[slug]', params: { slug: ref } });
    return {
      key: `a-${agentKey(agent)}`,
      kind: 'agent',
      libraryRef,
      iconKey: agent.iconKey ?? null,
      title: agent.title,
      meta: agenturaMetaLine([
        'Agent',
        isLandesverbandIdentifier(agent.identifier) && landesverbandLabel(agent.identifier),
        origin,
      ]),
      description: agent.description,
      searchText: searchTextOf([agent.title, agent.description, agent.identifier]),
      onOpen: openDetail,
      actions: buildMarketMenuActions({
        kind: 'agent',
        own,
        inLibrary: libraryRef ? library.has(libraryRef.kind, libraryRef.ref) : false,
      }),
      onAction: (id) => {
        switch (id as MarketMenuId) {
          case 'chat':
            return startAgentChat(agent, own);
          case 'details':
            return openDetail();
          case 'edit':
            return router.push({
              pathname: '/(focused)/grueneratoren/agent-editor',
              params: { identifier: agent.identifier },
            });
          case 'share':
            return router.push({
              pathname: '/(focused)/grueneratoren/agent/[slug]/teilen',
              params: { slug: ref },
            });
          case 'delete':
            return confirmDelete(agent.title, () => deleteAgent.mutate(agent.identifier));
          case 'remove':
            if (libraryRef) library.remove(libraryRef.kind, libraryRef.ref);
        }
      },
    };
  };

  const recipeActions = (
    mention: string,
    title: string,
    own: boolean,
    libraryRef: MarketItem['libraryRef']
  ): Pick<MarketItem, 'onOpen' | 'actions' | 'onAction'> => {
    const openDetail = () =>
      router.push({ pathname: '/(focused)/grueneratoren/rezept/[mention]', params: { mention } });
    return {
      onOpen: openDetail,
      actions: buildMarketMenuActions({
        kind: 'recipe',
        own,
        inLibrary: libraryRef ? library.has(libraryRef.kind, libraryRef.ref) : false,
      }),
      onAction: (id) => {
        switch (id as MarketMenuId) {
          case 'chat':
            return startRecipeChat(mention);
          case 'details':
            return openDetail();
          case 'edit':
            return router.push({
              pathname: '/(focused)/grueneratoren/rezept-editor',
              params: { mention },
            });
          case 'share':
            return router.push({
              pathname: '/(focused)/grueneratoren/rezept/[mention]/teilen',
              params: { mention },
            });
          case 'delete':
            return confirmDelete(title, () => deleteRecipe.mutate(mention));
          case 'remove':
            if (libraryRef) library.remove(libraryRef.kind, libraryRef.ref);
        }
      },
    };
  };

  const skillItem = (skill: AgentListItem): MarketItem => {
    const libraryRef = { kind: 'recipe' as const, ref: skill.mention };
    return {
      key: `s-${skill.mention}`,
      kind: 'recipe',
      libraryRef,
      iconKey: skill.iconKey ?? null,
      title: skill.title,
      meta: agenturaMetaLine([
        'Rezept',
        isLandesverbandIdentifier(skill.identifier)
          ? landesverbandLabel(skill.identifier)
          : SKILL_CATEGORY_LABELS[skill.skillCategory ?? 'sonstiges'],
      ]),
      description: skill.description,
      searchText: searchTextOf([skill.title, skill.description, skill.mention]),
      ...recipeActions(skill.mention, skill.title, false, libraryRef),
    };
  };

  const recipeItem = (recipe: TextForm): MarketItem => ({
    key: `r-${recipe.id}`,
    kind: 'recipe',
    libraryRef: null,
    iconKey: recipe.iconKey ?? null,
    title: recipe.title,
    meta: 'Rezept',
    description: recipe.description ?? `@${recipe.mention}`,
    searchText: searchTextOf([recipe.title, recipe.description, recipe.mention]),
    ...recipeActions(recipe.mention, recipe.title, true, null),
  });

  const taskItem = (task: RecurringTask): MarketItem => {
    const openDetail = () =>
      router.push({ pathname: '/(focused)/grueneratoren/aufgabe/[id]', params: { id: task.id } });
    return {
      key: `t-${task.id}`,
      kind: 'task',
      libraryRef: null,
      iconKey: 'PiCalendarBlank',
      title: task.title,
      meta: agenturaMetaLine([describeRecurrence(task.recurrence), !task.enabled && 'pausiert']),
      description: task.instruction,
      searchText: searchTextOf([task.title, task.instruction]),
      onOpen: openDetail,
      actions: buildMarketMenuActions({
        kind: 'task',
        // Ohne zugehörigen Agent gibt es keinen Editor, der sie öffnen könnte.
        own: task.agentIdentifier !== null,
        inLibrary: false,
      }),
      onAction: (id) => {
        switch (id as MarketMenuId) {
          case 'details':
            return openDetail();
          case 'edit':
            return router.push({
              pathname: '/(focused)/grueneratoren/agent-editor',
              params: { identifier: task.agentIdentifier ?? '', taskId: task.id },
            });
          case 'delete':
            return confirmDelete(task.title, () => deleteTask.mutate(task.id));
          // Bietet `buildMarketMenuActions` Aufgaben nicht an.
          case 'chat':
          case 'share':
          case 'remove':
            return;
        }
      },
    };
  };

  // Was der Marktplatz anbietet, nach Verweis — dieselben Verweise wie im Web:
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

  // Aus Projekten geteilt — ohne die eigenen (die stehen schon oben) und ohne
  // Doppelte mit der Bibliothek.
  const addedAgentKeys = new Set(addedAgents.map(agentKey));
  const projectAgents = sharedEntries.filter(
    (e) => !ownAgentKeys.has(agentKey(e.agent)) && !addedAgentKeys.has(agentKey(e.agent))
  );

  const allItems: MarketItem[] = [
    ...userAgents.map((a) => agentItem(a)),
    ...ownRecipes.map(recipeItem),
    ...addedAgents.map((a) => agentItem(a)),
    ...projectAgents.map((e) =>
      // Fremde Agents tragen ihren Prompt nicht mit (#3781); für Kachel und
      // Chat-Start reicht, was da ist.
      agentItem(e.agent as Agent, e.groups[0] ? `aus ${e.groups[0].name}` : null)
    ),
    ...addedSkills.map(skillItem),
    ...(tasks.data ?? []).map(taskItem),
  ];
  const items = query ? allItems.filter((item) => item.searchText.includes(query)) : allItems;
  const sections = SECTION_KINDS.map((kind) => ({
    key: kind,
    title: AGENTURA_TYPE_LABELS[kind],
    data: items.filter((item) => item.kind === kind),
  })).filter((section) => section.data.length > 0);

  // „Leer" erst, wenn alles geladen ist — vorher sind die Listen nur leere
  // Rückfälle, und „Noch nichts hier" wäre eine Behauptung ohne Grundlage.
  const settled = agentsLoaded && recipesLoaded && library.loaded && !tasks.isLoading;
  const failed = agentsFailed || recipesFailed || library.failed;

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
      'Noch nichts hier. Leg über „+“ einen eigenen Agent oder ein Rezept an, oder hol dir welche aus dem Marktplatz.',
      <Button onPress={() => openShop('')}>Zum Marktplatz</Button>
    )
  ) : (
    note(
      'Bei deinen Grüneratoren ist nichts dabei — vielleicht im Marktplatz.',
      <Button variant="outline" onPress={() => openShop(search.trim())}>
        Im Marktplatz suchen
      </Button>
    )
  );

  return (
    <ScreenScaffold
      backdrop={<NeutralBackdrop />}
      title="Grüneratoren"
      onBack={() => goBackOr('/start')}
      headerRight={
        <Pressable
          onPress={() => setCreateOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Neu anlegen"
          style={({ pressed }) => [styles.headerButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="add" size={26} color={theme.text} />
        </Pressable>
      }
    >
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
            iconKey={item.iconKey}
            title={item.title}
            meta={item.meta}
            description={item.description}
            onPress={item.onOpen}
            onLongPress={item.actions.length > 0 ? () => setMenuItem(item) : undefined}
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
        label="Marktplatz"
        accessibilityLabel="Marktplatz öffnen"
        onPress={() => openShop('')}
        style={{
          backgroundColor: colors.secondary[600],
          bottom: Math.max(insets.bottom, spacing.medium),
        }}
      />

      <MarketplaceSheet
        visible={shopOpen}
        onClose={() => setShopOpen(false)}
        kinds={AGENTURA_KINDS}
        initialQuery={shopQuery}
        description="Offizielle Agents und Rezepte, die deines Landesverbands und was andere öffentlich teilen."
      />

      <MenuActionSheet
        visible={createOpen}
        theme={theme}
        heading="Neu anlegen"
        actions={CREATE_ACTIONS}
        onClose={() => setCreateOpen(false)}
        onSelect={(id) =>
          afterSheet(() => {
            if (id === 'recipe') router.push('/(focused)/grueneratoren/rezept/neu');
            else
              router.push({
                pathname: '/(focused)/grueneratoren/agent/neu',
                params: id === 'task' ? { mode: 'recurring' } : {},
              });
          })
        }
      />
      <MenuActionSheet
        visible={menuItem !== null}
        theme={theme}
        heading={menuItem?.title}
        actions={menuItem?.actions ?? []}
        onClose={() => setMenuItem(null)}
        onSelect={(id) => {
          const item = menuItem;
          if (item) afterSheet(() => item.onAction(id));
        }}
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
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
