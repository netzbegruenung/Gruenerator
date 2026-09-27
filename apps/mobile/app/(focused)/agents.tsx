import {
  agentsList,
  useHiddenSkillMentions,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import { type TextForm } from '@gruenerator/contracts';
import {
  AGENTURA_TYPE_LABELS,
  DEFAULT_CATEGORY,
  DEFAULT_TYPE,
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  agenturaCategoriesForPlatform,
  agenturaMetaLine,
  getSystemAgent,
  getVisibleSystemAgentsForLocale,
  isAdminVisibleSkill,
  isAgentVisibleForPlatform,
  isLandesverbandIdentifier,
  isLvItemVisibleForRoles,
  isSkillOfferedIn,
  landesverbandLabel,
  landesverbandRegion,
  matchesAgenturaType,
  type Agent,
  type AgenturaCategoryKey,
  type AgenturaType,
} from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';

import { MarketCard } from '../../components/agentura/MarketCard';
import { ShelfTabs, TypeFilterRow } from '../../components/agentura/MarketFilters';
import { agentIcon } from '../../components/chat/sidebarIcons';
import { ListGroup, SkeletonRows } from '../../components/common';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { CURRENT_INSTANCE } from '../../config/instance';
import { useOwnRecipes } from '../../hooks/agents/useOwnRecipes';
import { usePublicUserAgents } from '../../hooks/agents/usePublicUserAgents';
import { useUserAgents } from '../../hooks/agents/useUserAgents';
import { spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { routeWithParams } from '../../types/routes';

/**
 * Regal-Schild je Kategorie. Ein `Record` über die volle Schlüssel-Union, nicht
 * ein Nachschlagen mit Rückfall: ein neues Regal in der geteilten Registry
 * scheitert hier am Compiler, bis es ein Symbol hat. `empfohlen` und
 * `favoriten` sind stillgelegt (`platforms: []`) und erscheinen nie — der
 * Eintrag bleibt trotzdem, weil der Typ die Union verlangt.
 */
const SHELF_ICONS: Record<AgenturaCategoryKey, IoniconsIconName> = {
  empfohlen: 'star-outline',
  meine: 'sparkles-outline',
  landesverband: 'location-outline',
  community: 'globe-outline',
  gruenerator: 'storefront-outline',
  favoriten: 'star',
};

/**
 * Nur die Gattungen, die es mobil gibt. „Wiederkehrend" und „Favoriten" führt
 * dieser Bildschirm nicht — sie kämen immer leer zurück.
 */
const MOBILE_TYPE_FILTERS = (['all', 'agent', 'recipe'] as const).map((id) => ({
  id,
  label: AGENTURA_TYPE_LABELS[id],
}));

/**
 * The Agentura — the market of Grüneratoren, as a full screen in the style of
 * the four tabs.
 *
 * Read-only by construction: creating, editing, sharing and favouriting all stay
 * on web. Deshalb trägt die Kachel hier kein Aktionsmenü und die Seite keinen
 * „Neu"-Knopf — beides zeigte nur Wege, die auf dem Telefon nirgends hinführen.
 * Aus demselben Grund bietet der Typ-Filter nur „Alle", „Agents" und
 * „Rezepte": wiederkehrende Aufgaben und Favoriten gibt es mobil nicht, und ein
 * Filter, der immer leer zurückkommt, ist ein kaputter Filter.
 *
 * Regale und Typ-Filter sind dieselben wie im Web (`agenturaCategoriesForPlatform`,
 * `matchesAgenturaType`), und das Regal ist wie dort eine flache Liste statt
 * überschriebener Abschnitte.
 */
export default function AgentsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();
  const { locale } = useAuth();

  const [shelf, setShelf] = useState<AgenturaCategoryKey>(DEFAULT_CATEGORY);
  const [type, setType] = useState<AgenturaType>(DEFAULT_TYPE);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const { data: userAgents = [], isLoading, error } = useUserAgents();
  const {
    data: publicAgents = [],
    isLoading: publicLoading,
    error: publicError,
  } = usePublicUserAgents();
  const { data: ownRecipes = [] } = useOwnRecipes();

  // Die Landesverbands-Zuteilung: LV-Agents und -Rezepte gehören den
  // Leuten des jeweiligen Verbands, gebunden an die Rolle „Mitarbeiter*in
  // Landesgeschäftsstelle". Gefiltert wird an der QUELLE — beide Regale, die
  // Kategorien und die Suche erben es damit von selbst; ein Filter nur auf den
  // Regalen ließe die Suche finden, was die Liste verbirgt.
  //
  // `lvIds === null` heißt „Rollen noch nicht geladen" und lässt durch, damit
  // die Ladephase nichts wegnimmt, was gleich wieder erscheint.
  const { lvIds, shelfLabel: lvShelfLabel, isHydrated: rolesLoaded } = useUserLandesverbaende();

  const systemAgents = useMemo(
    () =>
      getVisibleSystemAgentsForLocale(locale, CURRENT_INSTANCE).filter(
        (a) =>
          isAgentVisibleForPlatform(a, 'mobile') && isLvItemVisibleForRoles(a.identifier, lvIds)
      ),
    [locale, lvIds]
  );
  const generalSystemAgents = useMemo(
    () => systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  const lvSystemAgents = useMemo(
    () => systemAgents.filter((a) => isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );

  // „Öffentlich": publicly-listed community agents, minus the ones the user
  // already owns (those show under "Meine Grüneratoren").
  const communityAgents = useMemo(
    () => publicAgents.filter((pa) => !userAgents.some((ua) => ua.identifier === pa.identifier)),
    [publicAgents, userAgents]
  );

  const hiddenSkillMentions = useHiddenSkillMentions();

  // Recipes ("Rezepte") whose owning agent is hidden on mobile would open a chat
  // with an agent this app cannot render, so they are filtered the same way the
  // agents are. Also drops anything an admin hid from discovery on this
  // deployment, and anything this instance does not carry at all — the same
  // three questions web's AgenturaPage asks.
  const skills = useMemo(
    () =>
      agentsList.filter((s) => {
        if (s.audience !== undefined && s.audience !== 'all' && s.audience !== locale) return false;
        if (!isAdminVisibleSkill(s.mention, hiddenSkillMentions)) return false;
        if (!isSkillOfferedIn(s, CURRENT_INSTANCE)) return false;
        if (!isLvItemVisibleForRoles(s.identifier, lvIds)) return false;
        const owner = getSystemAgent(s.identifier);
        return !owner || isAgentVisibleForPlatform(owner, 'mobile');
      }),
    [locale, hiddenSkillMentions, lvIds]
  );
  const lvSkills = useMemo(
    () => skills.filter((s) => isLandesverbandIdentifier(s.identifier)),
    [skills]
  );
  const skillsByCategory = useMemo(() => {
    const map = new Map<string, AgentListItem[]>();
    for (const skill of skills) {
      if (isLandesverbandIdentifier(skill.identifier)) continue;
      const cat = skill.skillCategory ?? 'sonstiges';
      map.set(cat, [...(map.get(cat) ?? []), skill]);
    }
    return map;
  }, [skills]);

  const openAgent = useCallback(
    (agent: Agent) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          agentId: agent.identifier,
        })
      );
    },
    [router]
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

  const openSkill = useCallback(
    (skill: AgentListItem) => openWithComposerText(`${skill.mention} `),
    [openWithComposerText]
  );

  // Das Landesverbands-Regal nennt seinen Verband beim Namen („Grüne Hessen").
  // Vor der Hydratation ist `lvIds` `null` — der Name stünde also nicht fest und
  // das Regal zeigte obendrein die Inhalte ALLER Verbände (der sichere Ausgang
  // für Filter, siehe `useUserLandesverbaende`). Deshalb erscheint es erst, wenn
  // die Rollen geladen sind, und trägt dann `lvShelfLabel` statt `cat.label`.
  const shelves = useMemo(
    () =>
      agenturaCategoriesForPlatform('mobile')
        .filter((c) => c.key !== 'landesverband' || rolesLoaded)
        .map((c) => (c.key === 'landesverband' ? { ...c, label: lvShelfLabel } : c)),
    [rolesLoaded, lvShelfLabel]
  );
  const activeShelf = shelves.find((c) => c.key === shelf);

  const matches = (fields: (string | undefined)[]) =>
    fields.some((f) => f?.toLowerCase().includes(query));

  /**
   * Eine fertig gezeichnete Kachel. Keine Union über die Quellen: Agent, Rezept
   * aus dem Katalog und eigenes Rezept unterscheiden sich hier nur noch in
   * Symbol, Zeile und Ziel — `kind` und `isFavorite` sind alles, was der
   * gemeinsame Typ-Filter braucht.
   */
  interface MarketItem {
    key: string;
    kind: 'agent' | 'recipe';
    isFavorite: boolean;
    icon: IoniconsIconName;
    title: string;
    meta: string;
    description?: string;
    onPress: () => void;
  }

  const agentItem = (agent: Agent): MarketItem => ({
    key: `a-${agent.identifier}`,
    kind: 'agent',
    isFavorite: false,
    icon: agentIcon(agent.iconKey),
    title: agent.title,
    meta: agenturaMetaLine([
      'Agent',
      isLandesverbandIdentifier(agent.identifier) && landesverbandLabel(agent.identifier),
    ]),
    description: agent.description,
    onPress: () => openAgent(agent),
  });

  const skillItem = (skill: AgentListItem): MarketItem => ({
    key: `s-${skill.mention}`,
    kind: 'recipe',
    isFavorite: false,
    icon: agentIcon(skill.iconKey),
    title: skill.title,
    meta: agenturaMetaLine([
      'Rezept',
      isLandesverbandIdentifier(skill.identifier)
        ? landesverbandLabel(skill.identifier)
        : SKILL_CATEGORY_LABELS[skill.skillCategory ?? 'sonstiges'],
    ]),
    description: skill.description,
    onPress: () => openSkill(skill),
  });

  const recipeItem = (recipe: TextForm): MarketItem => ({
    key: `r-${recipe.id}`,
    kind: 'recipe',
    isFavorite: false,
    icon: agentIcon(recipe.iconKey ?? 'sparkles'),
    title: recipe.title,
    meta: 'Rezept',
    description: recipe.description ?? `@${recipe.mention}`,
    onPress: () => openWithComposerText(`@${recipe.mention} `),
  });

  const emptyNote = (text: string): ReactNode => (
    <View style={styles.empty}>
      <Ionicons name="sparkles-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );

  // What a shelf looks like before it arrives.
  const shelfSkeleton = (
    <ListGroup>
      <SkeletonRows count={6} leading={44} on="card" />
    </ListGroup>
  );

  // --- Items ----------------------------------------------------------------
  // Jedes Regal ist eine flache Liste. Die Reihenfolge trägt, was vorher
  // Abschnittsüberschriften trugen: Eigenes zuerst, Angeheftetes vor dem Rest,
  // Landesverbände nach Region.
  let shelfItems: MarketItem[] = [];
  let loading = false;
  let loadError: string | null = null;

  if (query) {
    shelfItems = [
      ...[...userAgents, ...communityAgents, ...systemAgents]
        .filter((a) => matches([a.title, a.description, a.identifier]))
        .map(agentItem),
      ...ownRecipes
        .filter((r) => matches([r.title, r.description ?? undefined, r.mention]))
        .map(recipeItem),
      ...skills.filter((s) => matches([s.title, s.description, s.mention])).map(skillItem),
    ];
  } else if (shelf === 'meine') {
    loading = isLoading;
    loadError = error ? 'Deine Agents konnten nicht geladen werden.' : null;
    shelfItems = [...userAgents.map(agentItem), ...ownRecipes.map(recipeItem)];
  } else if (shelf === 'landesverband') {
    const byRegion = <T,>(list: readonly T[], id: (t: T) => string): T[] =>
      [...list].sort((a, b) =>
        landesverbandRegion(id(a)).localeCompare(landesverbandRegion(id(b)))
      );
    shelfItems = [
      ...byRegion(lvSystemAgents, (a) => a.identifier).map(agentItem),
      ...byRegion(lvSkills, (s) => s.identifier).map(skillItem),
    ];
  } else if (shelf === 'community') {
    loading = publicLoading;
    loadError = publicError ? 'Die öffentlichen Agents konnten nicht geladen werden.' : null;
    shelfItems = communityAgents.map(agentItem);
  } else {
    // „Offizielle": die angehefteten zuerst — das ist, was „Empfohlen" als
    // eigenes Regal war, bevor es eine Reihung wurde.
    const pinned = generalSystemAgents.filter((a) => a.pinnedToSidebar);
    const rest = generalSystemAgents.filter((a) => !a.pinnedToSidebar);
    shelfItems = [
      ...[...pinned, ...rest].map(agentItem),
      ...SKILL_CATEGORY_ORDER.flatMap((cat) => (skillsByCategory.get(cat) ?? []).map(skillItem)),
    ];
  }

  const items = shelfItems.filter((item) => matchesAgenturaType(type, item));
  const filteredOut = shelfItems.length > 0 && items.length === 0;

  const emptyText = filteredOut
    ? 'Hier gibt es nichts dieser Art. Wähl oben „Alle", um wieder alles zu sehen.'
    : query
      ? 'Keine Treffer. Versuch ein anderes Stichwort.'
      : (activeShelf?.emptyText ?? 'Hier ist gerade nichts vorhanden.');

  const body: ReactNode = loading ? (
    shelfSkeleton
  ) : loadError ? (
    emptyNote(loadError)
  ) : items.length > 0 ? (
    <View style={styles.list}>
      {items.map((item) => (
        <MarketCard
          key={item.key}
          icon={item.icon}
          title={item.title}
          meta={item.meta}
          description={item.description}
          onPress={item.onPress}
        />
      ))}
    </View>
  ) : (
    emptyNote(emptyText)
  );

  return (
    <ScreenScaffold title="Agentura" onBack={() => router.back()}>
      <View style={styles.controls}>
        <View
          style={[
            styles.searchField,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Grüneratoren und Rezepte durchsuchen"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Grüneratoren und Rezepte durchsuchen"
          />
          {search.length > 0 && (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Suche zurücksetzen"
            >
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Hidden while searching: results already run across every shelf, so a
          highlighted tab would claim a filter that isn't being applied. */}
      {!query && (
        <ShelfTabs
          options={shelves.map((c) => ({
            id: c.key,
            label: c.label,
            icon: SHELF_ICONS[c.key],
          }))}
          active={shelf}
          onSelect={(key) => {
            setShelf(key);
            // Sonst öffnet das nächste Regal vorgefiltert auf eine Gattung, die
            // es vielleicht gar nicht führt — und liest sich als leer.
            setType(DEFAULT_TYPE);
          }}
        />
      )}

      <View style={styles.typeRow}>
        <TypeFilterRow options={MOBILE_TYPE_FILTERS} active={type} onSelect={setType} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {body}
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.medium,
    gap: spacing.small,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    height: 44,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontFamily: BODY_FONT,
    fontSize: 15,
    paddingVertical: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.medium,
    // Clears the floating tab capsule and leaves the last row room to breathe
    // rather than ending flush against the bottom edge.
    paddingBottom: spacing.xxlarge * 2,
  },
  list: {
    gap: spacing.small,
  },
  typeRow: {
    paddingTop: spacing.small,
    paddingBottom: spacing.small,
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
