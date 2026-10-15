import {
  AGENTURA_TYPE_LABELS,
  matchesAgenturaType,
  showsSystemRecipes,
  type AgenturaType,
} from '@gruenerator/shared/agents';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, HEADING_FONT_BOLD, HEADING_FONT_SEMIBOLD, spacing } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { Button } from '../common/Button';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';
import { SegmentedControl } from '../common/SegmentedControl';
import { SkeletonRows } from '../common/Skeleton';

import { AgentGlyph } from './AgentGlyph';
import { MarketCard } from './MarketCard';
import { type MarketAisle, type MarketItem } from './marketItem';
import { SearchField } from './SearchField';

import type { useUserLibrary } from '../../hooks/agents/useUserLibrary';

type Library = ReturnType<typeof useUserLibrary>;

/** Im Shop gibt es Agents und Rezepte — wiederkehrende Aufgaben sind immer eigene. */
const TYPE_OPTIONS = (['all', 'agent', 'recipe'] as const).map((value) => ({
  value,
  label: AGENTURA_TYPE_LABELS[value],
  short: AGENTURA_TYPE_LABELS[value],
  disabled: false,
}));

/**
 * Die Agentura — der Shop als Sheet über der Übersicht, wie im Web das Popup.
 * Drei Gänge: was der Grünerator mitbringt, was der eigene Landesverband
 * bereitstellt, und was andere öffentlich geteilt haben. Eine Kachel öffnet eine
 * Kurzansicht im selben Sheet; von dort holt „Zu meinen Grüneratoren" sie auf
 * die Übersicht, „Alle Details" führt auf die Detailseite. Ein zweites Sheet
 * für die Kurzansicht müsste auf das Verschwinden des ersten warten
 * (`SHEET_HANDOFF_MS`) — der Inhaltswechsel nicht.
 */
export function AgenturaSheet({
  visible,
  onClose,
  aisles,
  publicLoading,
  initialQuery,
  library,
}: {
  visible: boolean;
  onClose: () => void;
  aisles: MarketAisle[];
  publicLoading: boolean;
  /** Suchbegriff beim Öffnen — „In der Agentura suchen" von der Übersicht. */
  initialQuery: string;
  library: Library;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [search, setSearch] = useState(initialQuery);
  const [type, setType] = useState<AgenturaType>('all');
  const [opened, setOpened] = useState<MarketItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Jedes Öffnen beginnt im Gang-Überblick, mit dem Begriff, den die Übersicht mitgibt.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSearch(initialQuery);
      setType('all');
      setOpened(null);
    }
  }
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;
  const withSystemRecipes = showsSystemRecipes(type, searching);
  const sections = aisles
    .map((aisle) => ({
      key: aisle.key,
      title: aisle.title,
      data: aisle.items.filter(
        (item) =>
          (withSystemRecipes || !item.systemRecipe) &&
          matchesAgenturaType(type, item) &&
          (!searching || item.searchText.includes(q))
      ),
    }))
    .filter((section) => section.data.length > 0);
  const filtered = searching || type !== 'all';

  // Chat und Detailseite schieben sich unter dem Sheet ein, sobald es weg ist.
  const leaveFor = (run: () => void) => {
    onClose();
    timer.current = setTimeout(run, SHEET_HANDOFF_MS);
  };

  const openedChat = opened?.onStartChat ?? null;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="92%">
      <View style={[styles.body, { height: height * 0.85 }]}>
        {opened ? (
          <MarketItemDetail
            item={opened}
            library={library}
            onBack={() => setOpened(null)}
            onStartChat={openedChat ? () => leaveFor(openedChat) : null}
            onOpenDetails={() => leaveFor(opened.onOpen)}
          />
        ) : (
          <>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
                Agentura
              </Text>
              <Text style={[styles.description, { color: theme.textSecondary }]}>
                Offizielle Agents, die deines Landesverbands und was andere öffentlich teilen.
                System-Rezepte wie „Pressemitteilung“ wendet der Grünerator von selbst an — die
                Suche findet sie trotzdem.
              </Text>
              <SearchField value={search} onChange={setSearch} placeholder="Agentura durchsuchen" />
              <SegmentedControl
                options={TYPE_OPTIONS}
                value={type}
                onChange={(value) => setType(value as AgenturaType)}
                accessibilityLabel="Art"
              />
            </View>
            <SectionList
              sections={sections}
              keyExtractor={(item) => item.key}
              extraData={library.items}
              renderSectionHeader={({ section }) => (
                <Text style={[styles.aisle, { color: theme.text }]} accessibilityRole="header">
                  {section.title}
                </Text>
              )}
              renderItem={({ item }) => (
                <MarketCard
                  iconKey={item.iconKey}
                  title={item.title}
                  meta={item.meta}
                  description={item.description}
                  onPress={() => setOpened(item)}
                  added={
                    item.libraryRef ? library.has(item.libraryRef.kind, item.libraryRef.ref) : null
                  }
                  onToggleAdded={() => {
                    if (item.libraryRef) library.toggle(item.libraryRef.kind, item.libraryRef.ref);
                  }}
                />
              )}
              ItemSeparatorComponent={Gap}
              stickySectionHeadersEnabled={false}
              ListFooterComponent={
                publicLoading && !searching ? (
                  <SkeletonRows count={3} leading={40} on="card" style={styles.footer} />
                ) : null
              }
              ListEmptyComponent={
                publicLoading ? null : (
                  <View style={styles.empty}>
                    <Ionicons name="storefront-outline" size={40} color={theme.textSecondary} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                      {filtered
                        ? 'Nichts gefunden. Versuch ein anderes Stichwort oder einen anderen Filter.'
                        : 'Sobald es offizielle oder öffentliche Grüneratoren gibt, stehen sie hier.'}
                    </Text>
                  </View>
                )
              }
              initialNumToRender={8}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            />
          </>
        )}
      </View>
    </BottomSheet>
  );
}

/**
 * Ein Agent oder Rezept in der Agentura: worum es geht, und die Wege weiter —
 * auf die eigene Übersicht holen, im Chat ausprobieren, oder die volle
 * Detailseite.
 */
function MarketItemDetail({
  item,
  library,
  onBack,
  onStartChat,
  onOpenDetails,
}: {
  item: MarketItem;
  library: Library;
  onBack: () => void;
  onStartChat: (() => void) | null;
  onOpenDetails: () => void;
}) {
  const theme = useTheme();
  const ref = item.libraryRef;
  const added = ref ? library.has(ref.kind, ref.ref) : false;

  return (
    <View style={styles.detail}>
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Ionicons name="arrow-back" size={16} color={theme.textSecondary} />
        <Text style={[styles.backText, { color: theme.textSecondary }]}>Zurück zur Agentura</Text>
      </Pressable>

      <View style={styles.detailHeader}>
        <View style={[styles.detailIcon, { backgroundColor: theme.backgroundAlt }]}>
          <AgentGlyph iconKey={item.iconKey} size={28} color={theme.text} />
        </View>
        <View style={styles.detailTitles}>
          <Text style={[styles.detailTitle, { color: theme.text }]} accessibilityRole="header">
            {item.title}
          </Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {item.author ? `${item.meta} · ${item.author}` : item.meta}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {ref ? (
          <Button
            variant={added ? 'outline' : 'primary'}
            onPress={() => library.toggle(ref.kind, ref.ref)}
          >
            {added ? 'In meinen Grüneratoren' : 'Zu meinen Grüneratoren'}
          </Button>
        ) : null}
        {onStartChat ? (
          <Button variant={ref ? 'ghost' : 'primary'} onPress={onStartChat}>
            Im Chat ausprobieren
          </Button>
        ) : null}
        <Button variant="ghost" onPress={onOpenDetails}>
          Alle Details
        </Button>
      </View>

      {item.description ? (
        <Text style={[styles.detailBody, { color: theme.text }]}>{item.description}</Text>
      ) : null}
    </View>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.medium,
  },
  header: {
    gap: spacing.small,
    paddingBottom: spacing.small,
  },
  title: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 24,
  },
  description: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  aisle: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 17,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
  },
  listContent: {
    paddingBottom: spacing.xlarge,
  },
  gap: {
    height: spacing.small,
  },
  footer: {
    paddingTop: spacing.medium,
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
  detail: {
    gap: spacing.large,
    paddingTop: spacing.small,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
  },
  detailIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailTitles: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  detailTitle: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 22,
    lineHeight: 27,
  },
  actions: {
    gap: spacing.small,
  },
  detailBody: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    lineHeight: 24,
  },
});
