import { sortGroups, splitArchivedGroups } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';

import { NeutralBackdrop } from '../../../components/common/NeutralBackdrop';
import { SkeletonBar, SkeletonGroup } from '../../../components/common/Skeleton';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { useProjekteTone } from '../../../components/projekte/projekteTone';
import { ProjektTile } from '../../../components/projekte/ProjektTile';
import { pickRecentEntries } from '../../../components/projekte/recentEntries';
import { useOwnRecipes } from '../../../hooks/agents/useOwnRecipes';
import { useUserGroups, type GroupSummary } from '../../../hooks/useGroups';
import { useItemUsage } from '../../../hooks/useItemUsage';
import { useNotebookCollections } from '../../../hooks/useNotebookCollections';
import { useTheme } from '../../../hooks/useTheme';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  BODY_FONT,
  HEADING_FONT_BOLD,
} from '../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../theme/layout';
import { routeWithParams } from '../../../types/routes';
import { formatRelativeDate } from '../../../utils/date';
import { goBackOr } from '../../../utils/navigation';

/**
 * Projekte — die mobile Ansicht dessen, was das Web Gruppen nennt.
 *
 * Was im Projekt selbst geht, steht in `[id]/info` (Stummschalten, Umbenennen,
 * Einladungslink, Rollen, Verlassen). Im Web bleiben: Projekt anlegen, Einladung
 * per E-Mail, Profilbild, Links und Anweisungen bearbeiten, Löschen, öffentliche
 * Projekte, Beitrittsanfragen und Sichtbarkeit. Ein Einladungslink funktioniert
 * weiter; `app/gruppen-join/[token]` fängt ihn ab.
 */
export default function ProjekteScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const tone = useProjekteTone();

  const [showArchived, setShowArchived] = useState(false);
  const { data: groups = [], isPending, isRefetching, error, refetch } = useUserGroups();
  const { data: projectUsage } = useItemUsage('project');
  const { data: notebookUsage } = useItemUsage('notebook');
  const { collections: notebooks, isLoading: notebooksLoading } = useNotebookCollections();
  const { data: recipes = [], isSuccess: recipesLoaded, isError: recipesFailed } = useOwnRecipes();
  const recent = useMemo(
    () => pickRecentEntries(groups, notebooks, projectUsage, notebookUsage),
    [groups, notebooks, projectUsage, notebookUsage]
  );
  // Web's grid: two squares across on a phone, three from tablet width.
  const { width } = useWindowDimensions();
  const inner = Math.min(width, CONTENT_MAX_WIDTH) - spacing.medium * 2;
  const columns = inner >= 560 ? 3 : 2;
  const tile = Math.floor((inner - GAP * (columns - 1)) / columns);

  const openGroup = useCallback(
    (groupId: string) => router.push(`/(focused)/projekte/${groupId}`),
    [router]
  );

  // (focused) has no tab bar, so a bare router.back() strands the user when this
  // screen is the stack root — e.g. reached via gruppen-join's router.replace on
  // a cold deep link. Fall back to a tab, mirroring gruppen-join's own guard.
  const handleBack = useCallback(() => goBackOr('/start'), []);

  const openNotebook = useCallback(
    (id: string, title: string) => router.push(routeWithParams('/notebook/[id]', { id, title })),
    [router]
  );
  const openRecipe = useCallback(
    (mention: string) =>
      router.push({ pathname: '/(focused)/grueneratoren/rezept/[mention]', params: { mention } }),
    [router]
  );

  // Web's meta rule: only the exceptions are labelled.
  const metaFor = (group: GroupSummary): string =>
    group.archived_at ? 'Archiviert' : group.is_system ? 'Für alle' : '';

  let body: ReactNode;
  if (isPending) {
    // The rows below, in outline: the same card, the same 44-dp avatar, the
    // same two lines of text. Five of them, which fills a phone screen without
    // claiming to know how many projects there are.
    body = (
      <SkeletonGroup style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBar key={i} width={tile} height={tile} radius={20} />
        ))}
      </SkeletonGroup>
    );
  } else if (error) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="alert-circle" size={44} color={colors.semantic.error} />
        {/* Deliberately not the hook's own message: it comes from the shared
            groups client and still says "Projekte", web's word for this. */}
        <Text style={[styles.centeredText, { color: colors.semantic.error }]}>
          Projekte konnten nicht geladen werden.
        </Text>
        <Pressable
          onPress={() => void refetch()}
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: tone.accent, opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  } else if (groups.length === 0) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="people-outline" size={44} color={theme.textSecondary} />
        <Text style={[styles.centeredText, { color: theme.text }]}>Keine Projekte</Text>
        <Text style={[styles.centeredText, { color: theme.textSecondary }]}>
          Projekte legst du am Rechner an oder trittst ihnen über einen Einladungslink bei.
        </Text>
      </View>
    );
  } else {
    const split = splitArchivedGroups(groups);
    const active = sortGroups(split.active, 'recommended', projectUsage ?? {});
    const archived = split.archived;
    const renderTiles = (list: GroupSummary[]) => (
      <View style={styles.grid}>
        {list.map((group) => (
          <ProjektTile
            key={group.id}
            group={group}
            meta={metaFor(group)}
            size={tile}
            onPress={() => openGroup(group.id)}
          />
        ))}
      </View>
    );
    body = (
      <>
        <SectionTitle title="Deine Projekte" />
        {renderTiles(active)}
        {archived.length > 0 && (
          <View style={styles.archived}>
            <Pressable
              onPress={() => setShowArchived((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showArchived }}
              style={styles.archivedHeader}
            >
              <Ionicons
                name={showArchived ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={theme.textSecondary}
              />
              <Text style={[styles.centeredText, { color: theme.textSecondary }]}>
                Archiviert ({archived.length})
              </Text>
            </Pressable>
            {showArchived && renderTiles(archived)}
          </View>
        )}
      </>
    );
  }

  return (
    <ScreenScaffold backdrop={<NeutralBackdrop />} title="Projekte" onBack={handleBack}>
      <ScrollView
        contentContainerStyle={[styles.column, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {recent.length > 0 && (
          <View style={styles.section}>
            <SectionTitle title="Zuletzt" />
            <View style={styles.grid}>
              {recent.map((e) =>
                e.kind === 'project' ? (
                  <ProjektTile
                    key={e.key}
                    group={e.item}
                    meta={`Projekt · ${formatRelativeDate(new Date(e.usedAt))}`}
                    size={tile}
                    onPress={() => openGroup(e.item.id)}
                  />
                ) : (
                  <InfoTile
                    key={e.key}
                    size={tile}
                    icon="library-outline"
                    title={e.item.name}
                    meta={`Notebook · ${formatRelativeDate(new Date(e.usedAt))}`}
                    onPress={() => openNotebook(e.item.id, e.item.name)}
                  />
                )
              )}
            </View>
          </View>
        )}
        <View style={styles.section}>{body}</View>
        <View style={styles.section}>
          <SectionTitle title="Deine Notebooks" />
          {notebooks.length > 0 ? (
            <View style={styles.grid}>
              {notebooks.map((c) => (
                <InfoTile
                  key={c.id}
                  size={tile}
                  icon="library-outline"
                  title={c.name}
                  meta={c.description ?? ''}
                  onPress={() => openNotebook(c.id, c.name)}
                />
              ))}
            </View>
          ) : (
            !notebooksLoading && (
              <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
                Noch keine Notebooks.
              </Text>
            )
          )}
        </View>
        <View style={styles.section}>
          <SectionTitle title="Deine Rezepte" />
          {recipes.length > 0 ? (
            <View style={styles.grid}>
              {recipes.map((r) => (
                <InfoTile
                  key={r.id}
                  size={tile}
                  icon="restaurant-outline"
                  title={r.title}
                  meta={r.description ?? `@${r.mention}`}
                  onPress={() => openRecipe(r.mention)}
                />
              ))}
            </View>
          ) : recipesFailed ? (
            <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
              Deine Rezepte konnten nicht geladen werden.
            </Text>
          ) : (
            recipesLoaded && (
              <Text style={[styles.emptyLine, { color: theme.textSecondary }]}>
                Noch keine Rezepte.
              </Text>
            )
          )}
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const GAP = spacing.small;

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>
      {title}
    </Text>
  );
}

/** Square tile for notebooks and recipes, styled like ProjektTile. */
function InfoTile({
  size,
  icon,
  title,
  meta,
  onPress,
}: {
  size: number;
  icon: 'library-outline' | 'restaurant-outline';
  title: string;
  meta: string;
  onPress(): void;
}) {
  const theme = useTheme();
  const tone = useProjekteTone();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meta ? `${title}, ${meta}` : title}
      style={({ pressed }) => [
        styles.infoTile,
        {
          width: size,
          height: size,
          backgroundColor: theme.card,
          borderColor: theme.cardBorder,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={tone.accent} />
      <View>
        <Text style={[styles.infoName, { color: theme.text }]} numberOfLines={2}>
          {title}
        </Text>
        {meta ? (
          <Text style={[styles.infoMeta, { color: theme.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  section: { marginBottom: spacing.large },
  sectionTitle: { fontFamily: HEADING_FONT_BOLD, fontSize: 18, marginBottom: spacing.small },
  emptyLine: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  infoTile: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    justifyContent: 'space-between',
  },
  infoName: { fontFamily: HEADING_FONT_BOLD, fontSize: 16, lineHeight: 20 },
  infoMeta: { fontFamily: BODY_FONT, fontSize: 13, marginTop: 2 },
  archived: { marginTop: spacing.large, gap: GAP },
  archivedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xsmall },
  // Reading measure on a tablet; a phone is narrower than the cap anyway.
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  scrollContent: {
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
    paddingBottom: spacing.xxlarge * 2,
  },
  centered: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xxlarge,
    paddingHorizontal: spacing.large,
  },
  centeredText: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.small,
    paddingHorizontal: spacing.large,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.medium,
  },
  retryButtonText: { ...typography.body, fontWeight: '600', color: colors.white },
});
