import { addableKey, type AddableItem, type GroupFeedKind } from '@gruenerator/shared/groups';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useAddableContent } from '../../hooks/useAddableContent';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, spacing, typography } from '../../theme';
import { ListGroup, ListRow, SkeletonRows } from '../common';

import { FEED_KIND_ICONS } from './feedIcons';

interface AddableContentListProps {
  /** `addableKey`s der gewählten Inhalte. */
  selected: ReadonlySet<string>;
  /** `kind`: die Art des Abschnitts, für das Symbol an der Stelle, wo die Wahl erscheint. */
  onToggle: (item: AddableItem, kind: GroupFeedKind) => void;
  /** `addableKey`s, die schon im Projekt liegen: sichtbar, aber nicht wählbar. */
  alreadyShared: ReadonlySet<string>;
}

/**
 * Die eigenen Agents, Rezepte, Notebooks, Docs und Boards zum Auswählen, mit
 * Suche — für „Inhalte hinzufügen“ und für „Aus meinen Inhalten“ im Beitrag.
 */
export function AddableContentList({ selected, onToggle, alreadyShared }: AddableContentListProps) {
  const theme = useTheme();
  const { sections, isPending } = useAddableContent();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = sections
    .map((s) => ({
      ...s,
      items: q ? s.items.filter((i) => i.title.toLowerCase().includes(q)) : s.items,
    }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      <View style={[styles.search, { backgroundColor: theme.buttonBackground }]}>
        <Ionicons name="search" size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Eigene Inhalte suchen"
          placeholderTextColor={theme.textSecondary}
          accessibilityLabel="Eigene Inhalte suchen"
          style={[styles.searchInput, { color: theme.text }]}
          returnKeyType="search"
        />
      </View>

      {isPending ? (
        <SkeletonRows count={5} leading={44} />
      ) : visible.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textSecondary }]}>
          {q ? `Nichts passt zu „${query.trim()}“.` : 'Du hast noch keine eigenen Inhalte.'}
        </Text>
      ) : (
        visible.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text
              style={[styles.sectionTitle, { color: theme.textSecondary }]}
              accessibilityRole="header"
            >
              {section.title}
            </Text>
            <ListGroup>
              {section.items.map((item, i) => {
                const key = addableKey(item);
                const shared = alreadyShared.has(key);
                return (
                  <ListRow
                    key={key}
                    icon={FEED_KIND_ICONS[section.kind]}
                    title={item.title || 'Ohne Titel'}
                    value={shared ? 'Schon im Projekt' : null}
                    selected={shared || selected.has(key)}
                    disabled={shared}
                    onPress={() => onToggle(item, section.kind)}
                    last={i === section.items.length - 1}
                  />
                );
              })}
            </ListGroup>
          </View>
        ))
      )}
    </>
  );
}

const styles = StyleSheet.create({
  search: {
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontFamily: BODY_FONT, fontSize: 15, height: 44 },
  section: { gap: spacing.xsmall },
  sectionTitle: { ...typography.caption, fontWeight: '600', paddingHorizontal: spacing.xsmall },
  empty: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    textAlign: 'center',
    paddingTop: spacing.large,
  },
});
