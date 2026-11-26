import {
  PROJECT_SEARCH_STATE_LABELS,
  filterGroupFeed,
  groupFeedKindMeta,
  searchSummary,
  type GroupFeedItem,
} from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { canOpenInApp } from '../../hooks/useGroupContent';
import { type ShareItemActions } from '../../hooks/useShareItemActions';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT } from '../../theme';
import { MenuActionSheet } from '../chat/MenuActionSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';

import { FEED_KIND_ICONS } from './feedIcons';
import { buildKnowledgeActions, DISCUSS_ID, KNOWLEDGE_SHOWN } from './knowledgeMenu';
import { useProjekteTone } from './projekteTone';
import { projectRoleLabel } from './shareMenu';

interface ProjectKnowledgeListProps {
  items: GroupFeedItem[];
  onOpen: (item: GroupFeedItem) => void;
  /** Rolle ändern und Entfernen; `null`, wo die Person nichts verwaltet. */
  shareActions: ShareItemActions | null;
  /** `null`: hier gibt es keinen Austausch (persönliches oder System-Projekt). */
  onDiscuss: ((item: GroupFeedItem) => void) | null;
  /** Andere Karten mit derselben Zeilenliste (Rezepte) setzen Titel und Leertext selbst. */
  title?: string;
  /** „Im Wissen suchen“ — die Präposition hängt am Titel, deshalb eigens. */
  searchLabel?: string;
  emptyText?: ReactNode;
  /** Rechts neben dem Titel, z. B. „+ Rezept“. */
  headerAction?: ReactNode;
  /** Unter der Liste, z. B. die Rezepte des Landesverbands. */
  footer?: ReactNode;
  /** Eine Karte nur einer Art: ohne Art in der Zeile, ohne „durchsuchbar“-Zeile. */
  singleKind?: boolean;
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
  title = 'Wissen',
  searchLabel = 'Im Wissen suchen',
  emptyText = 'Noch nichts hinterlegt. Mit „+“ legst du Dateien, Texte oder Notebooks ab, die Chats in diesem Projekt nutzen.',
  headerAction = null,
  footer = null,
  singleKind = false,
}: ProjectKnowledgeListProps) {
  const theme = useTheme();
  const tone = useProjekteTone();
  const [query, setQuery] = useState('');
  // Suche über die Lupe im Kopf, nicht als stehendes Feld.
  const [searchOpen, setSearchOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [menuItem, setMenuItem] = useState<GroupFeedItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const searching = searchOpen && query.trim().length > 0;
  const matches = filterGroupFeed(items, query);
  // Beim Suchen zählt jeder Treffer; sonst nur die ersten Zeilen, bis jemand aufklappt.
  const visible = searching || showAll ? matches : matches.slice(0, KNOWLEDGE_SHOWN);
  const toggleSearch = () => {
    setQuery('');
    setSearchOpen((v) => !v);
  };
  const menuActions = useMemo(
    () =>
      menuItem
        ? buildKnowledgeActions(menuItem, !!onDiscuss, shareActions?.actionsFor(menuItem) ?? [])
        : [],
    [menuItem, onDiscuss, shareActions]
  );
  const hasMenu = (item: GroupFeedItem) =>
    buildKnowledgeActions(item, !!onDiscuss, shareActions?.actionsFor(item) ?? []).length > 0;

  const summary = searchSummary(items);

  return (
    <View style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {title}
        </Text>
        {items.length > 0 ? (
          <Pressable
            onPress={toggleSearch}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? `Suche in „${title}“ schließen` : searchLabel}
            style={styles.searchToggle}
          >
            <Ionicons
              name={searchOpen ? 'close' : 'search'}
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>
        ) : null}
        {headerAction}
      </View>

      {!singleKind && summary.total > 0 ? (
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
          {summary.searchable} von {summary.total} durchsuchbar
        </Text>
      ) : null}

      {items.length === 0 ? (
        emptyText ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>{emptyText}</Text>
        ) : null
      ) : (
        <>
          {searchOpen ? (
            <View style={[styles.search, { backgroundColor: theme.buttonBackground }]}>
              <Ionicons name="search" size={16} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchLabel}
                placeholderTextColor={theme.textSecondary}
                accessibilityLabel={searchLabel}
                style={[styles.searchInput, { color: theme.text }]}
                returnKeyType="search"
                autoFocus
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
              const label = [
                singleKind ? null : groupFeedKindMeta(item.kind).label,
                projectRoleLabel(item),
                item.searchState && item.searchState !== 'ready'
                  ? PROJECT_SEARCH_STATE_LABELS[item.searchState]
                  : null,
              ]
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
                      {/* In einer Karte nur einer Art bleibt oft nichts übrig — dann keine leere Zeile. */}
                      {label ? (
                        <Text
                          style={[styles.rowMeta, { color: theme.textSecondary }]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      ) : null}
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
          {!searching && matches.length > KNOWLEDGE_SHOWN ? (
            <Pressable
              onPress={() => setShowAll((v) => !v)}
              accessibilityRole="button"
              style={styles.showAll}
            >
              <Text style={[styles.showAllText, { color: theme.textSecondary }]}>
                {showAll ? 'Weniger anzeigen' : `Alle ${matches.length} anzeigen`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
      {footer}

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
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, fontFamily: BODY_FONT, fontSize: 17, fontWeight: '700' },
  searchToggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  showAll: { alignSelf: 'flex-start', paddingVertical: 8 },
  showAllText: { fontFamily: BODY_FONT, fontSize: 14 },
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
