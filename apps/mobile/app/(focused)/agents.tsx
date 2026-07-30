import { agentsList, type AgentListItem } from '@gruenerator/chat';
import {
  SKILL_CATEGORY_LABELS,
  SKILL_CATEGORY_ORDER,
  agenturaCategoriesForPlatform,
  getSystemAgent,
  getVisibleSystemAgentsForLocale,
  isAgentVisibleForPlatform,
  isLandesverbandIdentifier,
  isLvItemVisibleForRoles,
  landesverbandHeadings,
  landesverbandLabel,
  landesverbandRegion,
  type Agent,
  type AgenturaCategoryKey,
} from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  useColorScheme,
} from 'react-native';

import { agentIcon } from '../../components/chat/sidebarIcons';
import { ChipGroup, ListGroup, ListRow } from '../../components/common';
import { ScreenScaffold } from '../../components/navigation/ScreenScaffold';
import { usePublicUserAgents } from '../../hooks/agents/usePublicUserAgents';
import { useUserAgents } from '../../hooks/agents/useUserAgents';
import { useUserLandesverbaende } from '../../hooks/useUserLandesverbaende';
import { colors, spacing, borderRadius, lightTheme, darkTheme, BODY_FONT } from '../../theme';
import { routeWithParams } from '../../types/routes';

/** How many agents the "Empfohlen" shelf shows before it stops being a shortcut. */
const FEATURED_LIMIT = 8;

/**
 * The Agentura — the market of Grüneratoren, as a full screen in the style of
 * the four tabs.
 *
 * Read-only by construction: creating, editing, sharing and favouriting all stay
 * on web. What mobile adds over the old flat list is the ability to *find*
 * something — shelves and a search field, since ~30 official Grüneratoren in one
 * ungrouped column is not a list anybody reads.
 */
export default function AgentsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = isDark ? darkTheme : lightTheme;
  const router = useRouter();
  const { locale } = useAuth();

  const [shelf, setShelf] = useState<AgenturaCategoryKey>('empfohlen');
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const { lvIds } = useUserLandesverbaende();
  const lvHeadings = useMemo(() => landesverbandHeadings(lvIds), [lvIds]);
  const { data: userAgents = [], isLoading, error } = useUserAgents();
  const {
    data: publicAgents = [],
    isLoading: publicLoading,
    error: publicError,
  } = usePublicUserAgents();

  const systemAgents = useMemo(
    () =>
      getVisibleSystemAgentsForLocale(locale).filter((a) => isAgentVisibleForPlatform(a, 'mobile')),
    [locale]
  );
  const generalSystemAgents = useMemo(
    () => systemAgents.filter((a) => !isLandesverbandIdentifier(a.identifier)),
    [systemAgents]
  );
  // Landesverband agents and recipes belong to the people who work there: shown
  // only when a profile role names that Bundesland (roles are set on web).
  const lvSystemAgents = useMemo(
    () =>
      systemAgents.filter(
        (a) =>
          isLandesverbandIdentifier(a.identifier) && isLvItemVisibleForRoles(a.identifier, lvIds)
      ),
    [systemAgents, lvIds]
  );

  // "Von der Basis": publicly-listed community agents, minus the ones the user
  // already owns (those show under "Meine Grüneratoren").
  const communityAgents = useMemo(
    () => publicAgents.filter((pa) => !userAgents.some((ua) => ua.identifier === pa.identifier)),
    [publicAgents, userAgents]
  );

  const featuredAgents = useMemo(() => {
    const pinned = generalSystemAgents.filter((a) => a.pinnedToSidebar);
    const pool = pinned.length > 0 ? pinned : generalSystemAgents;
    return pool.slice(0, FEATURED_LIMIT);
  }, [generalSystemAgents]);

  // Recipes ("Rezepte") whose owning agent is hidden on mobile would open a chat
  // with an agent this app cannot render, so they are filtered the same way the
  // agents are.
  const skills = useMemo(
    () =>
      agentsList.filter((s) => {
        if (!s.skillSystemPrompt) return false;
        if (s.audience !== undefined && s.audience !== 'all' && s.audience !== locale) return false;
        const owner = getSystemAgent(s.identifier);
        return !owner || isAgentVisibleForPlatform(owner, 'mobile');
      }),
    [locale]
  );
  const lvSkills = useMemo(
    () =>
      skills.filter(
        (s) =>
          isLandesverbandIdentifier(s.identifier) && isLvItemVisibleForRoles(s.identifier, lvIds)
      ),
    [skills, lvIds]
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
  const openSkill = useCallback(
    (skill: AgentListItem) => {
      router.push(
        routeWithParams('/(focused)/chat-conversation', {
          threadId: 'new',
          initialComposerText: `${skill.mention} `,
        })
      );
    },
    [router]
  );

  const shelves = useMemo(() => agenturaCategoriesForPlatform('mobile'), []);
  const activeShelf = shelves.find((c) => c.key === shelf);

  const matches = (fields: (string | undefined)[]) =>
    fields.some((f) => f?.toLowerCase().includes(query));

  const agentRow = (agent: Agent, last: boolean): ReactNode => (
    <ListRow
      key={agent.identifier}
      icon={agentIcon(agent.iconKey)}
      title={agent.title}
      value={agent.description}
      valueLines={2}
      onPress={() => openAgent(agent)}
      last={last}
    />
  );

  const skillRow = (skill: AgentListItem, last: boolean): ReactNode => (
    <ListRow
      key={skill.mention}
      icon={agentIcon(skill.iconKey)}
      title={skill.title}
      value={skill.description}
      valueLines={2}
      onPress={() => openSkill(skill)}
      last={last}
    />
  );

  const group = (nodes: ReactNode[]): ReactNode => <ListGroup>{nodes}</ListGroup>;

  const agentGroup = (list: readonly Agent[]): ReactNode =>
    group(list.map((a, i) => agentRow(a, i === list.length - 1)));

  const section = (key: string, heading: string, body: ReactNode): ReactNode => (
    <View key={key} style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{heading}</Text>
      {body}
    </View>
  );

  const emptyNote = (text: string): ReactNode => (
    <View style={styles.empty}>
      <Ionicons name="sparkles-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{text}</Text>
    </View>
  );

  // --- Body -----------------------------------------------------------------
  let body: ReactNode;

  if (query) {
    const foundAgents = [...userAgents, ...communityAgents, ...systemAgents].filter((a) =>
      matches([a.title, a.description, a.identifier])
    );
    const foundSkills = skills.filter((s) => matches([s.title, s.description, s.mention]));
    body =
      foundAgents.length + foundSkills.length === 0 ? (
        emptyNote('Keine Treffer. Versuch ein anderes Stichwort.')
      ) : (
        <View style={styles.sections}>
          {foundAgents.length > 0 && section('s-agents', 'Grüneratoren', agentGroup(foundAgents))}
          {foundSkills.length > 0 &&
            section(
              's-skills',
              'Rezepte',
              group(foundSkills.map((s, i) => skillRow(s, i === foundSkills.length - 1)))
            )}
        </View>
      );
  } else if (shelf === 'empfohlen') {
    // No loading or error branch here on purpose: "Empfohlen" comes from the
    // bundled system-agent registry, so it is complete before any request
    // finishes. Blocking it on the user-agents call put a network error in front
    // of a shelf that never needed the network.
    body = agentGroup(featuredAgents);
  } else if (shelf === 'meine') {
    body = isLoading ? (
      <ActivityIndicator color={colors.primary[600]} style={styles.loader} />
    ) : error ? (
      emptyNote('Deine Grüneratoren konnten nicht geladen werden.')
    ) : userAgents.length > 0 ? (
      agentGroup(userAgents)
    ) : (
      emptyNote(
        'Du hast noch keine eigenen Grüneratoren. Anlegen geht am Rechner — hier findest du sie danach wieder.'
      )
    );
  } else if (shelf === 'community') {
    body = publicLoading ? (
      <ActivityIndicator color={colors.primary[600]} style={styles.loader} />
    ) : publicError ? (
      emptyNote('Die Grüneratoren von der Basis konnten nicht geladen werden.')
    ) : communityAgents.length > 0 ? (
      agentGroup(communityAgents)
    ) : (
      // Only says "none yet" once we know: a request still in flight or a failed
      // one is not an empty shelf.
      emptyNote('Noch keine öffentlich geteilten Grüneratoren von der Basis.')
    );
  } else {
    // "Offizielle": the flat 30-item list this screen used to be, now split into
    // the sub-sections web has — general agents, Landesverbände, then recipes.
    const lvSorted = [
      ...lvSystemAgents.map((a) => ({
        region: landesverbandRegion(a.identifier),
        order: 0,
        node: a,
      })),
    ].sort((a, b) => a.region.localeCompare(b.region));

    body = (
      <View style={styles.sections}>
        {generalSystemAgents.length > 0 && agentGroup(generalSystemAgents)}
        {lvSorted.length > 0 &&
          section(
            'lv',
            lvHeadings.agents,
            group(
              lvSorted.map((e, i) => (
                <ListRow
                  key={e.node.identifier}
                  icon={agentIcon(e.node.iconKey)}
                  title={e.node.title}
                  value={landesverbandLabel(e.node.identifier)}
                  onPress={() => openAgent(e.node)}
                  last={i === lvSorted.length - 1}
                />
              ))
            )
          )}
        {lvSkills.length > 0 &&
          section(
            'lv-skills',
            lvHeadings.skills,
            group(lvSkills.map((s, i) => skillRow(s, i === lvSkills.length - 1)))
          )}
        {SKILL_CATEGORY_ORDER.map((cat) => {
          const list = skillsByCategory.get(cat) ?? [];
          if (list.length === 0) return null;
          return section(
            `cat-${cat}`,
            SKILL_CATEGORY_LABELS[cat],
            group(list.map((s, i) => skillRow(s, i === list.length - 1)))
          );
        })}
      </View>
    );
  }

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
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Hidden while searching: results already run across every shelf, so a
            highlighted chip would claim a filter that isn't being applied. */}
        {!query && (
          <ChipGroup
            options={shelves.map((c) => ({ id: c.key, label: c.label }))}
            selected={shelf}
            onSelect={(v) => setShelf(v as AgenturaCategoryKey)}
          />
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        {!query && activeShelf?.description ? (
          <Text style={[styles.blurb, { color: theme.textSecondary }]}>
            {activeShelf.description}
          </Text>
        ) : null}
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
  blurb: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    lineHeight: 18,
    paddingBottom: spacing.medium,
  },
  sections: {
    gap: spacing.xlarge,
  },
  section: {
    gap: spacing.small,
  },
  sectionTitle: {
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.xsmall,
  },
  loader: {
    paddingTop: spacing.xlarge,
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
