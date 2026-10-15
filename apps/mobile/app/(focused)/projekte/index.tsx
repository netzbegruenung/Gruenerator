import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
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

import { SkeletonBar, SkeletonGroup } from '../../../components/common/Skeleton';
import { ScreenScaffold } from '../../../components/navigation/ScreenScaffold';
import { ProjekteBackdrop, useProjekteTone } from '../../../components/projekte/projekteTone';
import { ProjektTile } from '../../../components/projekte/ProjektTile';
import { useUserGroups, type GroupSummary } from '../../../hooks/useGroups';
import {
  colors,
  spacing,
  typography,
  borderRadius,
  lightTheme,
  darkTheme,
  BODY_FONT,
} from '../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../theme/layout';
import { roleLabel } from '../../../utils/groups';
import { goBackOr } from '../../../utils/navigation';

/**
 * Projekte — the read-only mobile view of what web calls Gruppen.
 *
 * Read-only on purpose: creating a project, joining by code, renaming, managing
 * members and links all stay on web. What is left is the thing people actually
 * do on a phone — look up which projects they are in and what has been shared
 * there. An invite link still works; `app/gruppen-join/[token]` handles it.
 */
export default function ProjekteScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const router = useRouter();
  const tone = useProjekteTone();

  const { data: groups = [], isPending, isRefetching, error, refetch } = useUserGroups();
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

  // Web's meta rule, kept verbatim so a project reads the same on both surfaces.
  const metaFor = (group: GroupSummary): string => {
    if (group.group_type === 'personal') return 'Nur für dich';
    if (group.is_system) return 'Für alle';
    if (group.member_count) {
      return `${group.member_count} ${group.member_count === 1 ? 'Mitglied' : 'Mitglieder'}`;
    }
    return roleLabel(group.role);
  };

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
            groups client and still says "Gruppen", web's word for this. */}
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
    body = (
      <View style={styles.grid}>
        {groups.map((group) => (
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
  }

  return (
    <ScreenScaffold backdrop={<ProjekteBackdrop />} title="Projekte" onBack={handleBack}>
      <ScrollView
        contentContainerStyle={[styles.column, styles.scrollContent]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        {body}
      </ScrollView>
    </ScreenScaffold>
  );
}

const GAP = spacing.small;

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
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
