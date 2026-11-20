import { filterGroupFeed, groupFeedKindMeta, type GroupFeedItem } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { canOpenInApp } from '../../hooks/useGroupContent';
import { type ShareItemActions } from '../../hooks/useShareItemActions';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';

import { FEED_KIND_ICONS } from './feedIcons';
import { buildKnowledgeActions, DISCUSS_ID, KNOWLEDGE_SEARCH_FROM } from './knowledgeMenu';
import { useProjekteTone } from './projekteTone';
import { projectRoleLabel } from './shareMenu';

interface ProjectKnowledgeListProps {
  items: GroupFeedItem[];
  onOpen: (item: GroupFeedItem) => void;
  /** Rolle ändern und Entfernen; `null`, wo die Person nichts verwaltet. */
  shareActions: ShareItemActions | null;
  /** `null`: hier gibt es keinen Austausch (persönliches oder System-Projekt). */
  onDiscuss: ((item: GroupFeedItem) => void) | null;
}

/**
 * „Wissen“: was Chats im Projekt nutzen können — Dateien, Texte, Notebooks,
 * Rezepte, Agents … — als eine Liste. Tippen öffnet, „…“ bzw. langes Drücken
 * zeigt das Zeilenmenü.
 */
export function ProjectKnowledgeList({
  items,
  onOpen,
  shareActions,
  onDiscuss,
}: ProjectKnowledgeListProps) {
  const theme = useTheme();
  const tone = useProjekteTone();
  const [query, setQuery] = useState('');
  const [menuItem, setMenuItem] = useState<GroupFeedItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const visible = filterGroupFeed(items, query);
  const menuActions = useMemo(
    () =>
      menuItem
        ? buildKnowledgeActions(menuItem, !!onDiscuss, shareActions?.actionsFor(menuItem) ?? [])
        : [],
    [menuItem, onDiscuss, shareActions]
  );
  const hasMenu = (item: GroupFeedItem) =>
    buildKnowledgeActions(item, !!onDiscuss, shareActions?.actionsFor(item) ?? []).length > 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          Wissen
        </Text>
        {items.length > 0 ? (
          <Text style={[styles.count, { color: theme.textSecondary }]}>{items.length}</Text>
        ) : null}
      </View>

      {items.length === 0 ? (
        <Text style={[styles.note, { color: theme.textSecondary }]}>
          Noch nichts hinterlegt. Mit „+“ legst du Dateien, Texte oder Notebooks ab, die Chats in
          diesem Projekt nutzen.
        </Text>
      ) : (
        <>
          {items.length > KNOWLEDGE_SEARCH_FROM ? (
            <View style={[styles.search, { backgroundColor: theme.buttonBackground }]}>
              <Ionicons name="search" size={16} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Im Wissen suchen"
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel="Im Wissen suchen"
                style={[styles.searchInput, { color: theme.text }]}
                returnKeyType="search"
              />
            </View>
          ) : null}
          {visible.length === 0 ? (
            <Text style={[styles.note, { color: theme.textSecondary }]}>
              Nichts gefunden für „{query.trim()}“.
            </Text>
          ) : (
            visible.map((item) => {
              const openable = canOpenInApp(item);
              const menu = hasMenu(item);
              const label = [groupFeedKindMeta(item.kind).label, projectRoleLabel(item)]
                .filter(Boolean)
                .join(' · ');
              return (
                <View key={item.key} style={styles.row}>
                  <Pressable
                    onPress={openable ? () => onOpen(item) : undefined}
                    onLongPress={menu ? () => setMenuItem(item) : undefined}
                    disabled={!openable && !menu}
                    accessibilityRole={openable ? 'button' : 'text'}
                    accessibilityLabel={`${item.title}, ${label}`}
                    accessibilityHint={menu ? 'Gedrückt halten für weitere Optionen' : undefined}
                    style={styles.rowMain}
                  >
                    <Ionicons name={FEED_KIND_ICONS[item.kind]} size={20} color={tone.accent} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text
                        style={[styles.rowMeta, { color: theme.textSecondary }]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                    </View>
                  </Pressable>
                  {menu ? (
                    <Pressable
                      onPress={() => setMenuItem(item)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Weitere Aktionen für ${item.title}`}
                      style={styles.more}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </>
      )}

      <MenuActionSheet
        visible={menuItem !== null}
        theme={theme}
        heading={menuItem?.title}
        actions={menuActions}
        onSelect={(id) => {
          const item = menuItem;
          if (!item) return;
          // Das Menü fährt noch ein; iOS zeigt im selben Tick keinen zweiten Dialog.
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            if (id === DISCUSS_ID) onDiscuss?.(item);
            else shareActions?.run(item, id);
          }, SHEET_HANDOFF_MS);
        }}
        onClose={() => setMenuItem(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  count: { fontFamily: BODY_FONT, fontSize: 14 },
  note: { fontFamily: BODY_FONT, fontSize: 15, paddingVertical: 4 },
  search: {
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginVertical: 6,
  },
  searchInput: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, height: 38 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, minWidth: 0, paddingVertical: 8 },
  rowTitle: { fontFamily: BODY_FONT, fontSize: 15 },
  rowMeta: { fontFamily: BODY_FONT, fontSize: 12 },
  more: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
